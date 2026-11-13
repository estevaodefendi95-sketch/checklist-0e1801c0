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
    const { token, acao, itens, nome, pessoas, telefone, nascimento, pin, reserva_id, comanda_token, aparelho, nivel, carregando, hora, vincular_mesa } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const db = sb.schema("checklist");
    const uuidOk = (x: unknown) => /^[0-9a-f-]{36}$/i.test(String(x ?? ""));

    // O QR Code é do cartão da comanda: o token do cartão aponta para a comanda ABERTA com aquele número.
    async function resolverCartao(ct: unknown) {
      // aceita o texto exato do QR já impresso (qualquer formato) ou a última parte de um endereço
      const raw = String(ct ?? "").trim().slice(0, 300);
      const cand = [...new Set([raw, raw.split(/[/?#]/).filter(Boolean).pop() ?? raw])];
      const { data: card } = raw ? await db.from("pdv_cartoes").select("numero").in("token", cand).limit(1).maybeSingle() : { data: null };
      if (!card) return { erro: "QR Code inválido. Leia o QR Code do cartão da sua comanda." } as const;
      const { data: c } = await db.from("pdv_comandas").select("id,numero,nome_cliente,status,taxa_servico_pct,desconto,mesa_id")
        .eq("numero", card.numero).in("status", ["aberta", "pedindo_conta"]).maybeSingle();
      if (!c) return { erro: `A comanda ${card.numero} ainda não foi aberta. Peça ao atendente para fazer o check-in.` } as const;
      return { com: c } as const;
    }
    async function consumo(comId: string, taxa: number, desc: number) {
      const { data: its } = await db.from("pdv_pedido_itens").select("nome,qtd,preco_unit,status,opcoes").eq("comanda_id", comId).neq("status", "cancelado").order("criado_em");
      const sub = (its ?? []).reduce((s: number, i: any) => s + i.qtd * i.preco_unit, 0);
      return { itens: its ?? [], total: Math.max(0, sub * (1 + (taxa ?? 0) / 100) - (desc ?? 0)) };
    }
    if (acao === "comanda_info") {
      const rc = await resolverCartao(comanda_token);
      if ("erro" in rc) return json({ erro: rc.erro });
      const k = await consumo(rc.com.id, rc.com.taxa_servico_pct, rc.com.desconto);
      return json({ ok: true, numero: rc.com.numero, nome: rc.com.nome_cliente, status: rc.com.status, ...k });
    }

    // PIN de supervisor (cadastrado pelo administrador): autoriza trocar a mesa do tablet. Limite de erros por mesa/aparelho.
    async function conferirPin(quem: string) {
      const { data, error } = await db.rpc("pdv_validar_pin_interno", { p_pin: String(pin ?? ""), p_quem: quem });
      if (error) return { erro: error.message.includes("Muitas tentativas") ? "Muitas tentativas. Aguarde 10 minutos." : "Não foi possível conferir o PIN." } as const;
      const u = (data ?? [])[0];
      if (!u) return { erro: "PIN incorreto." } as const;
      if (!u.pode_autorizar) return { erro: "Esse PIN não tem autorização para configurar o tablet." } as const;
      return { ok: true } as const;
    }
    async function listaMesas() {
      const { data: todas } = await db.from("pdv_mesas").select("numero,qr_token,capacidade").eq("ativo", true);
      return (todas ?? []).sort((a: any, b: any) => String(a.numero).localeCompare(String(b.numero), "pt-BR", { numeric: true }));
    }
    // Endereço único do tablet (sem mesa): só mostra as mesas depois do PIN.
    if (acao === "configurar") {
      const r = await conferirPin("tablet-config");
      if ("erro" in r) return json({ erro: r.erro });
      return json({ ok: true, mesas: await listaMesas() });
    }

    if (!token || !uuidOk(token)) return json({ erro: "Endereço do tablet inválido." });

    const { data: mesa } = await db.from("pdv_mesas").select("id,numero,reservado_nome,reservado_hora").eq("qr_token", token).eq("ativo", true).maybeSingle();
    if (!mesa) return json({ erro: "Mesa não encontrada." });
    const { data: cfg } = await db.from("pdv_config").select("*").eq("id", 1).single();

    // Trava do tablet: trocar de mesa / sair do cardápio exige o PIN de um supervisor.
    if (acao === "autorizar") {
      const r = await conferirPin("tablet-" + token);
      if ("erro" in r) return json({ erro: r.erro });
      return json({ ok: true, mesas: await listaMesas() });
    }
    // bateria do tablet: o aparelho avisa o nível a cada minuto; a gestão vê todos em Configurações › Tablet
    if (acao === "bateria") {
      const ap = String(aparelho ?? "").slice(0, 64);
      const n = Math.round(Number(nivel));
      if (!ap || !Number.isFinite(n) || n < 0 || n > 100) return json({ erro: "Dados inválidos." });
      await db.from("pdv_tablet_bateria").upsert({ aparelho: ap, mesa_id: mesa.id, nivel: n, carregando: !!carregando, atualizado_em: new Date().toISOString() });
      return json({ ok: true });
    }

    if (!cfg.tablet_qr_ativo) return json({ mesa: mesa.numero, qr_ativo: false, boas_vindas: cfg.tablet_mensagem_boas_vindas, tema: cfg.tablet_tema });

    if (acao === "menu") {
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const [cats, prods, mn, grp, pg, ops, bn, rs, fch] = await Promise.all([
        db.from("pdv_categorias").select("id,nome,visivel_tablet,horarios,menu_id").eq("ativo", true).order("ordem"),
        db.from("pdv_produtos").select("id,nome,descricao,preco,categoria_id,foto_url,video_url,ficha_id,visivel_tablet,horarios,indicacao,indicacao_rotulo").eq("ativo", true).eq("disponivel", true).order("ordem").order("nome"),
        db.from("pdv_menus").select("id,visivel,horarios").eq("ativo", true),
        db.from("pdv_grupos_opcoes").select("id,nome,tipo,min_escolhas,max_escolhas").eq("ativo", true).order("ordem"),
        db.from("pdv_produto_grupos").select("produto_id,grupo_id,ordem").order("ordem"),
        db.from("pdv_opcoes").select("id,grupo_id,nome,preco_adicional").eq("ativo", true).order("ordem"),
        db.from("pdv_banners").select("id,titulo,patrocinador,imagem_url,produto_id,inicio,fim,horarios").eq("ativo", true).order("ordem").order("criado_em"),
        db.from("reservas").select("id,nome,telefone,pessoas,hora,duracao_min,liberada_tablet_em").eq("mesa_id", mesa.id).eq("data", hoje).in("status", ["pendente", "confirmada"]).order("hora"),
        db.from("fichas").select("id,foto_url,video_url").or("foto_url.not.is.null,video_url.not.is.null"),
      ]);
      const banners = (bn.data ?? []).filter((b: any) => (!b.inicio || b.inicio <= hoje) && (!b.fim || b.fim >= hoje) && noHorario(b.horarios));
      // reserva da mesa: aparece de 3 h antes até o fim da duração; o toque na tela do tablet libera
      const { min: agoraMin } = agoraSP();
      const hm = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
      const r: any = (rs.data ?? []).find((x: any) => agoraMin >= hm(x.hora) - 180 && agoraMin <= hm(x.hora) + x.duracao_min);
      const fmap = new Map((fch.data ?? []).map((f: any) => [f.id, f]));
      const reserva: any = r ? { id: r.id, nome: r.nome, telefone: r.telefone, pessoas: r.pessoas, hora: String(r.hora).slice(0, 5), liberada: !!r.liberada_tablet_em } : null;
      const reservaManual = !reserva && mesa.reservado_nome ? { id: "manual", nome: mesa.reservado_nome, telefone: "", pessoas: 0, hora: mesa.reservado_hora ?? "", liberada: false, manual: true } : null;
      const menuOk = new Map((mn.data ?? []).map((m: any) => [m.id, m.visivel && noHorario(m.horarios)]));
      const catOk = new Map((cats.data ?? []).filter((c: any) => c.visivel_tablet && noHorario(c.horarios) && (!c.menu_id || menuOk.get(c.menu_id) === true)).map((c: any) => [c.id, c]));
      const produtos = (prods.data ?? []).filter((p: any) => p.visivel_tablet && (!p.categoria_id || catOk.has(p.categoria_id)) && noHorario(p.horarios))
        .map((p: any) => ({
          id: p.id, nome: p.nome, descricao: p.descricao, preco: p.preco, categoria_id: p.categoria_id, foto_url: p.foto_url ?? (fmap.get(p.ficha_id) as any)?.foto_url ?? null, video_url: p.video_url ?? (fmap.get(p.ficha_id) as any)?.video_url ?? null, indicacao: !!p.indicacao, indicacao_rotulo: p.indicacao_rotulo,
          grupos: (pg.data ?? []).filter((x: any) => x.produto_id === p.id).map((x: any) => (grp.data ?? []).find((g: any) => g.id === x.grupo_id)).filter(Boolean)
            .map((g: any) => ({ ...g, opcoes: (ops.data ?? []).filter((o: any) => o.grupo_id === g.id) })),
        }));
      const categorias = [...catOk.values()].filter((c: any) => produtos.some((p: any) => p.categoria_id === c.id)).map((c: any) => ({ id: c.id, nome: c.nome }));
      return json({
        mesa: mesa.numero, qr_ativo: true, tema: cfg.tablet_tema, boas_vindas: cfg.tablet_mensagem_boas_vindas, exige_checkin: cfg.tablet_exige_checkin,
        pode_chamar: cfg.tablet_pode_chamar_garcom, pode_conta: cfg.tablet_pode_pedir_conta, inatividade_min: cfg.tablet_tempo_inatividade_min,
        categorias, produtos, banners, reserva: reserva ?? reservaManual,
      });
    }

    if (acao === "reservar" || acao === "liberar_manual") {
      const r = await conferirPin("tablet-" + token);
      if ("erro" in r) return json({ erro: r.erro });
      const nm = String(nome ?? "").trim().slice(0, 60);
      if (acao === "reservar" && !nm) return json({ erro: "Informe o nome da reserva." });
      const { error } = await db.from("pdv_mesas").update(acao === "reservar" ? { reservado_nome: nm, reservado_hora: /^\d{2}:\d{2}$/.test(String(hora ?? "")) ? String(hora) : null, reservado_em: new Date().toISOString() } : { reservado_nome: null, reservado_hora: null, reservado_em: null }).eq("id", mesa.id);
      return error ? json({ erro: "Não foi possível salvar." }) : json({ ok: true });
    }
    if (acao === "liberar_reserva") {
      const { error } = await db.from("reservas").update({ liberada_tablet_em: new Date().toISOString() }).eq("id", String(reserva_id ?? "")).eq("mesa_id", mesa.id);
      return error ? json({ erro: "Não foi possível liberar." }) : json({ ok: true });
    }

    if (acao === "pedir") {
      const rc = await resolverCartao(comanda_token);
      if ("erro" in rc) return json({ erro: rc.erro });
      const com = rc.com;
      if (com.status !== "aberta") return json({ erro: "Essa conta já foi pedida. Chame o atendente." });
      if (!Array.isArray(itens) || !itens.length || itens.length > 40) return json({ erro: "Pedido vazio." });
      // comanda sem mesa: pede para cadastrar a mesa deste tablet antes de enviar
      if (!com.mesa_id) {
        if (!vincular_mesa) return json({ precisa_mesa: true, mesa: mesa.numero, comanda: com.numero });
        const v = await db.from("pdv_comandas").update({ mesa_id: mesa.id }).eq("id", com.id);
        if (v.error) return json({ erro: v.error.code === "23505" ? "Esta mesa já tem outra comanda aberta. Chame o atendente." : "Não foi possível vincular a mesa. Chame o atendente." });
      }
      const ids = itens.map((i: any) => i.produto_id);
      const [{ data: prods }, { data: cats }, { data: pg }, { data: grp }, { data: ops }, { data: menusP }] = await Promise.all([
        db.from("pdv_produtos").select("id,nome,preco,destino,categoria_id,visivel_tablet,horarios").in("id", ids).eq("ativo", true).eq("disponivel", true),
        db.from("pdv_categorias").select("id,visivel_tablet,horarios,menu_id"),
        db.from("pdv_produto_grupos").select("produto_id,grupo_id").in("produto_id", ids),
        db.from("pdv_grupos_opcoes").select("id,nome,min_escolhas,max_escolhas").eq("ativo", true),
        db.from("pdv_opcoes").select("id,grupo_id,nome,preco_adicional").eq("ativo", true),
        db.from("pdv_menus").select("id,visivel,horarios").eq("ativo", true),
      ]);
      const menuOkP = new Map((menusP ?? []).map((m: any) => [m.id, m.visivel && noHorario(m.horarios)]));
      const mapa = new Map((prods ?? []).map((p: any) => [p.id, p]));
      const linhas = [];
      for (const i of itens) {
        const p: any = mapa.get(i.produto_id);
        const q = Math.min(20, Math.max(1, Math.floor(Number(i.qtd) || 0)));
        const c: any = (cats ?? []).find((k: any) => k.id === p?.categoria_id);
        if (!p || !p.visivel_tablet || !noHorario(p.horarios) || (c && (!c.visivel_tablet || !noHorario(c.horarios) || (c.menu_id && menuOkP.get(c.menu_id) !== true))))
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
      let comId: string | null = null, numero: number | null = null;
      if (acao === "conta") {
        const rc = await resolverCartao(comanda_token);
        if ("erro" in rc) return json({ erro: rc.erro });
        comId = rc.com.id; numero = rc.com.numero;
        await db.from("pdv_comandas").update({ status: "pedindo_conta" }).eq("id", comId);
      }
      const { data: imp } = await db.from("pdv_impressoras").select("id").eq("funcao", "caixa").eq("ativo", true).limit(1);
      if (imp?.length) {
        await db.from("pdv_fila_impressao").insert({
          impressora_id: imp[0].id, tipo: "pedido", comanda_id: comId,
          conteudo: { mesa: mesa.numero, nome: acao === "garcom" ? "*** CHAMAR GARCOM ***" : `*** PEDIU A CONTA (COMANDA ${numero}) ***`, qtd: 1, origem: "tablet" },
        });
      }
      return json({ ok: true });
    }
    return json({ erro: "Ação inválida." });
  } catch (e) {
    return json({ erro: "Erro interno." }, 500);
  }
});
