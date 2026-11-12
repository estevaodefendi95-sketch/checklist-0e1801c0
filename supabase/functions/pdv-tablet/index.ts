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
    const { token, acao, itens, nome, pessoas } = await req.json();
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return json({ erro: "QR Code inválido." });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const db = sb.schema("checklist");

    const { data: mesa } = await db.from("pdv_mesas").select("id,numero").eq("qr_token", token).eq("ativo", true).maybeSingle();
    if (!mesa) return json({ erro: "Mesa não encontrada." });
    const { data: cfg } = await db.from("pdv_config").select("*").eq("id", 1).single();
    if (!cfg.tablet_qr_ativo) return json({ mesa: mesa.numero, qr_ativo: false, boas_vindas: cfg.tablet_mensagem_boas_vindas, tema: cfg.tablet_tema });

    const { data: com } = await db.from("pdv_comandas").select("id,nome_cliente,status,taxa_servico_pct,desconto")
      .eq("mesa_id", mesa.id).in("status", ["aberta", "pedindo_conta"]).maybeSingle();

    if (acao === "menu") {
      const [cats, prods, its, grp, pg, ops] = await Promise.all([
        db.from("pdv_categorias").select("id,nome,visivel_tablet,horarios").eq("ativo", true).order("ordem"),
        db.from("pdv_produtos").select("id,nome,descricao,preco,categoria_id,foto_url,visivel_tablet,horarios").eq("ativo", true).eq("disponivel", true).order("ordem").order("nome"),
        com ? db.from("pdv_pedido_itens").select("nome,qtd,preco_unit,status,opcoes").eq("comanda_id", com.id).neq("status", "cancelado").order("criado_em") : Promise.resolve({ data: [] }),
        db.from("pdv_grupos_opcoes").select("id,nome,tipo,min_escolhas,max_escolhas").eq("ativo", true).order("ordem"),
        db.from("pdv_produto_grupos").select("produto_id,grupo_id,ordem").order("ordem"),
        db.from("pdv_opcoes").select("id,grupo_id,nome,preco_adicional").eq("ativo", true).order("ordem"),
      ]);
      const catOk = new Map((cats.data ?? []).filter((c: any) => c.visivel_tablet && noHorario(c.horarios)).map((c: any) => [c.id, c]));
      const produtos = (prods.data ?? []).filter((p: any) => p.visivel_tablet && (!p.categoria_id || catOk.has(p.categoria_id)) && noHorario(p.horarios))
        .map((p: any) => ({
          id: p.id, nome: p.nome, descricao: p.descricao, preco: p.preco, categoria_id: p.categoria_id, foto_url: p.foto_url,
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
        itens: its.data ?? [], categorias, produtos,
      });
    }

    if (acao === "checkin") {
      if (cfg.tablet_exige_checkin) return json({ erro: "O check-in é feito na recepção." });
      if (com) return json({ ok: true });
      const { error } = await db.from("pdv_comandas").insert({
        mesa_id: mesa.id, nome_cliente: String(nome ?? "").slice(0, 60) || null, pessoas: Math.min(30, Math.max(1, Number(pessoas) || 1)),
        origem: "tablet", taxa_servico_pct: cfg.taxa_servico_pct,
      });
      return error ? json({ erro: "Não foi possível abrir a mesa." }) : json({ ok: true });
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
