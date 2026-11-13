// Tablet / QR Code da mesa. Público (sem login): a mesa é identificada pelo qr_token e
// qualquer escrita exige comanda ABERTA na mesa. Usa service role só dentro desta função.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });


// Horário de funcionamento do item/categoria (fuso de Brasília). dias: 0=dom..6=sáb; fim < início = vira a noite.
function agoraSP() {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t: string) => f.find((x) => x.type === t)!.value;
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { dow, min: (Number(g("hour")) % 24) * 60 + Number(g("minute")) };
}
function noHorario(h: { dia: number; inicio: string; fim: string }[] | null) {
  if (!h?.length) return true;
  const { dow, min } = agoraSP();
  const ontem = (dow + 6) % 7;
  const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  return h.some((f) => { const a = m(f.inicio), b = m(f.fim); return a <= b ? f.dia === dow && min >= a && min < b : (f.dia === dow && min >= a) || (f.dia === ontem && min < b); });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { token, acao, itens, nome, pessoas, telefone, nascimento, email, senha, reserva_id } = await req.json();
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return json({ erro: "QR Code inválido." });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const db = sb.schema("checklist");

    const { data: mesa } = await db.from("pdv_mesas").select("id,numero").eq("qr_token", token).eq("ativo", true).maybeSingle();
    if (!mesa) return json({ erro: "Mesa não encontrada." });
    const { data: cfg } = await db.from("pdv_config").select("*").eq("id", 1).single();

    // Trava do tablet: trocar de mesa / sair do cardápio exige e-mail e senha de um usuário do sistema com acesso ao PDV.
    if (acao === "autorizar") {
      const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { count } = await db.from("pdv_tablet_falhas").select("id", { count: "exact", head: true }).eq("token", token).gte("criado_em", desde);
      if ((count ?? 0) >= 5) return json({ erro: "Muitas tentativas. Aguarde 10 minutos." });
      const mail = String(email ?? "").trim().toLowerCase();
      if (!mail || !senha) return json({ erro: "Informe e-mail e senha." });
      const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: login, error: le } = await anon.auth.signInWithPassword({ email: mail, password: String(senha) });
      const uid = login?.user?.id;
      if (le || !uid) { await db.from("pdv_tablet_falhas").insert({ token }); return json({ erro: "E-mail ou senha incorretos." }); }
      const [{ data: prof }, { data: perm }] = await Promise.all([
        db.from("profiles").select("role,is_master").eq("id", uid).maybeSingle(),
        db.from("permissoes").select("*").eq("user_id", uid).maybeSingle(),
      ]);
      const ok = prof?.role === "admin" || prof?.is_master || (perm as any)?.pdv_operar || (perm as any)?.pdv_gerir;
      if (!ok) { await db.from("pdv_tablet_falhas").insert({ token }); return json({ erro: "Esse usuário não tem acesso ao PDV." }); }
      const { data: todas } = await db.from("pdv_mesas").select("numero,qr_token,capacidade").eq("ativo", true);
      const mesas = (todas ?? []).sort((a: any, b: any) => String(a.numero).localeCompare(String(b.numero), "pt-BR", { numeric: true }));
      return json({ ok: true, mesas });
    }
    if (!cfg.tablet_qr_ativo) return json({ mesa: mesa.numero, qr_ativo: false, boas_vindas: cfg.tablet_mensagem_boas_vindas, tema: cfg.tablet_tema });

    const { data: com } = await db.from("pdv_comandas").select("id,nome_cliente,status,taxa_servico_pct,desconto")
      .eq("mesa_id", mesa.id).in("status", ["aberta", "pedindo_conta"]).maybeSingle();

    if (acao === "menu") {
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const [cats, prods, its, grp, pg, ops, bn, rs] = await Promise.all([
        db.from("pdv_categorias").select("id,nome,visivel_tablet,horarios").eq("ativo", true).order("ordem"),
        db.from("pdv_produtos").select("id,nome,descricao,preco,categoria_id,foto_url,visivel_tablet,horarios,indicacao,indicacao_rotulo").eq("ativo", true).eq("disponivel", true).order("ordem").order("nome"),
        com ? db.from("pdv_pedido_itens").select("nome,qtd,preco_unit,status,opcoes").eq("comanda_id", com.id).neq("status", "cancelado").order("criado_em") : Promise.resolve({ data: [] }),
        db.from("pdv_grupos_opcoes").select("id,nome,tipo,min_escolhas,max_escolhas").eq("ativo", true).order("ordem"),
        db.from("pdv_produto_grupos").select("produto_id,grupo_id,ordem").order("ordem"),
        db.from("pdv_opcoes").select("id,grupo_id,nome,preco_adicional").eq("ativo", true).order("ordem"),
        db.from("pdv_banners").select("id,titulo,patrocinador,imagem_url,produto_id,inicio,fim").eq("ativo", true).order("ordem").order("criado_em"),
        com ? Promise.resolve({ data: [] }) : db.from("reservas").select("id,nome,telefone,pessoas,hora,duracao_min,liberada_tablet_em").eq("mesa_id", mesa.id).eq("data", hoje).in("status", ["pendente", "confirmada"]).order("hora"),
      ]);
      const banners = (bn.data ?? []).filter((b: any) => (!b.inicio || b.inicio <= hoje) && (!b.fim || b.fim >= hoje));
      // reserva da mesa: aparece de 3 h antes até o fim da duração; o toque na tela do tablet libera
      const { min: agoraMin } = agoraSP();
      const hm = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
      const r: any = (rs.data ?? []).find((x: any) => agoraMin >= hm(x.hora) - 180 && agoraMin <= hm(x.hora) + x.duracao_min);
      const reserva = r ? { id: r.id, nome: r.nome, telefone: r.telefone, pessoas: r.pessoas, hora: String(r.hora).slice(0, 5), liberada: !!r.liberada_tablet_em } : null;
      const catOk = new Map((cats.data ?? []).filter((c: any) => c.visivel_tablet && noHorario(c.horarios)).map((c: any) => [c.id, c]));
      const produtos = (prods.data ?? []).filter((p: any) => p.visivel_tablet && (!p.categoria_id || catOk.has(p.categoria_id)) && noHorario(p.horarios))
        .map((p: any) => ({
          id: p.id, nome: p.nome, descricao: p.descricao, preco: p.preco, categoria_id: p.categoria_id, foto_url: p.foto_url, indicacao: !!p.indicacao, indicacao_rotulo: p.indicacao_rotulo,
          grupos: (pg.data ?? []).filter((x: any) => x.produto_id === p.id).map((x: any) => (grp.data ?? []).find((g: any) => g.id === x.grupo_id)).filter(Boolean)
            .map((g: any) => ({ ...g, opcoes: (ops.data ?? []).filter((o: any) => o.grupo_id === g.id) })),
        }));
      const categorias = [...catOk.values()].filter((c: any) => produtos.some((p: any) => p.categoria_id === c.id)).map((c: any) => ({ id: c.id, nome: c.nome }));
      const sub = (its.data ?? []).reduce((s: number, i: any) => s + i.qtd * i.preco_unit, 0);
      const total = Math.max(0, sub * (1 + (com?.taxa_servico_pct ?? 0) / 100) - (com?.desconto ?? 0));
      return json({
        mesa: mesa.numero, qr_ativo: true, tema: cfg.tablet_tema, boas_vindas: cfg.tablet_mensagem_boas_vindas, exige_checkin: cfg.tablet_exige_checkin,
        pode_chamar: cfg.tablet_pode_chamar_garcom, pode_conta: cfg.tablet_pode_pedir_conta,
        comanda: com ? { id: com.id, nome_cliente: com.nome_cliente, status: com.status, total } : null,
        itens: its.data ?? [], categorias, produtos, banners, reserva,
      });
    }

    if (acao === "checkin") {
      if (cfg.tablet_exige_checkin) return json({ erro: "O check-in é feito na recepção." });
      if (com) return json({ ok: true });
      let tel = String(telefone ?? "").replace(/\D/g, "");
      if (tel.length > 11 && tel.startsWith("55")) tel = tel.slice(2);
      const nm = String(nome ?? "").trim().slice(0, 60);
      if (!nm) return json({ erro: "Informe seu nome." });
      if (tel.length < 10 || tel.length > 11) return json({ erro: "Informe seu telefone com DDD." });
      const nasc = /^\d{4}-\d{2}-\d{2}$/.test(String(nascimento ?? "")) ? String(nascimento) : null;
      const { data: cli } = await db.from("pdv_clientes").upsert(
        nasc ? { telefone: tel, nome: nm, nascimento: nasc } : { telefone: tel, nome: nm }, { onConflict: "telefone" }).select("id").single();
      const { data: nova, error } = await db.from("pdv_comandas").insert({
        mesa_id: mesa.id, nome_cliente: nm, telefone: tel, cliente_id: cli?.id ?? null, pessoas: Math.min(30, Math.max(1, Number(pessoas) || 1)),
        origem: "tablet", taxa_servico_pct: cfg.taxa_servico_pct,
      }).select("id").single();
      if (!error && nova) {
        // reserva liberada no tablet vira "sentada" e fica ligada à comanda
        const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
        const { data: rl } = await db.from("reservas").select("id").eq("mesa_id", mesa.id).eq("data", hoje).in("status", ["pendente", "confirmada"]).not("liberada_tablet_em", "is", null).order("hora").limit(1);
        if (rl?.length) await db.from("reservas").update({ status: "sentada", comanda_id: nova.id, atualizado_em: new Date().toISOString() }).eq("id", rl[0].id);
      }
      return error ? json({ erro: "Não foi possível abrir a mesa." }) : json({ ok: true });
    }

    if (acao === "liberar_reserva") {
      if (com) return json({ ok: true });
      const { error } = await db.from("reservas").update({ liberada_tablet_em: new Date().toISOString() }).eq("id", String(reserva_id ?? "")).eq("mesa_id", mesa.id);
      return error ? json({ erro: "Não foi possível liberar." }) : json({ ok: true });
    }

    if (!com) return json({ erro: "Mesa sem comanda aberta. Chame o garçom." });

    if (acao === "pedir") {
      if (!Array.isArray(itens) || !itens.length || itens.length > 40) return json({ erro: "Pedido vazio." });
      const ids = itens.map((i: any) => i.produto_id);
      const [{ data: prods }, { data: cats }, { data: pg }, { data: grp }, { data: ops }] = await Promise.all([
        db.from("pdv_produtos").select("id,nome,preco,destino,categoria_id,visivel_tablet,horarios").in("id", ids).eq("ativo", true).eq("disponivel", true),
        db.from("pdv_categorias").select("id,visivel_tablet,horarios"),
        db.from("pdv_produto_grupos").select("produto_id,grupo_id").in("produto_id", ids),
        db.from("pdv_grupos_opcoes").select("id,nome,min_escolhas,max_escolhas").eq("ativo", true),
        db.from("pdv_opcoes").select("id,grupo_id,nome,preco_adicional").eq("ativo", true),
      ]);
      const mapa = new Map((prods ?? []).map((p: any) => [p.id, p]));
      const linhas = [];
      for (const i of itens) {
        const p: any = mapa.get(i.produto_id);
        const q = Math.min(20, Math.max(1, Math.floor(Number(i.qtd) || 0)));
        const c: any = (cats ?? []).find((k: any) => k.id === p?.categoria_id);
        if (!p || !p.visivel_tablet || !noHorario(p.horarios) || (c && (!c.visivel_tablet || !noHorario(c.horarios))))
          return json({ erro: "Um dos itens não está disponível neste horário." });
        // opções escolhidas: valida grupos do produto, mínimo/máximo e recalcula o preço no servidor
        const escolhidas: any[] = (Array.isArray(i.opcoes) ? i.opcoes : []).map((id: string) => (ops ?? []).find((o: any) => o.id === id));
        if (escolhidas.some((o) => !o)) return json({ erro: "Uma das opções não está mais disponível." });
        const gruposDoProduto = (pg ?? []).filter((x: any) => x.produto_id === p.id).map((x: any) => (grp ?? []).find((g: any) => g.id === x.grupo_id)).filter(Boolean);
        for (const o of escolhidas) if (!gruposDoProduto.some((g: any) => g.id === o.grupo_id)) return json({ erro: "Opção inválida para o item." });
        for (const g of gruposDoProduto as any[]) {
          const n = escolhidas.filter((o) => o.grupo_id === g.id).length;
          if (n < g.min_escolhas) return json({ erro: `Escolha "${g.nome}" em ${p.nome}.` });
          if (n > g.max_escolhas) return json({ erro: `Em "${g.nome}" escolha no máximo ${g.max_escolhas}.` });
        }
        const adic = escolhidas.reduce((s, o) => s + Number(o.preco_adicional), 0);
        linhas.push({
          comanda_id: com.id, produto_id: p.id, nome: p.nome, qtd: q, preco_unit: Number(p.preco) + adic,
          opcoes: escolhidas.map((o) => ({ id: o.id, nome: o.nome, preco: Number(o.preco_adicional) })),
          obs: String(i.obs ?? "").slice(0, 120) || null, destino: p.destino, origem: "tablet",
        });
      }
      const { error } = await db.from("pdv_pedido_itens").insert(linhas); // o gatilho já enfileira a impressão
      return error ? json({ erro: "Não foi possível enviar. Chame o garçom." }) : json({ ok: true });
    }

    if (acao === "garcom" || acao === "conta") {
      if (acao === "garcom" && !cfg.tablet_pode_chamar_garcom) return json({ erro: "Indisponível." });
      if (acao === "conta" && !cfg.tablet_pode_pedir_conta) return json({ erro: "Indisponível." });
      if (acao === "conta") await db.from("pdv_comandas").update({ status: "pedindo_conta" }).eq("id", com.id);
      const { data: imp } = await db.from("pdv_impressoras").select("id").eq("funcao", "caixa").eq("ativo", true).limit(1);
      if (imp?.length) {
        await db.from("pdv_fila_impressao").insert({
          impressora_id: imp[0].id, tipo: "pedido", comanda_id: com.id,
          conteudo: { mesa: mesa.numero, nome: acao === "garcom" ? "*** CHAMAR GARCOM ***" : "*** PEDIU A CONTA ***", qtd: 1, origem: "tablet" },
        });
      }
      return json({ ok: true });
    }
    return json({ erro: "Ação inválida." });
  } catch (e) {
    return json({ erro: "Erro interno." }, 500);
  }
});
