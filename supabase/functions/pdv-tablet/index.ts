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
    if (!cfg.tablet_qr_ativo) return json({ mesa: mesa.numero, qr_ativo: false, boas_vindas: cfg.tablet_mensagem_boas_vindas });

    const { data: com } = await db.from("pdv_comandas").select("id,nome_cliente,status,taxa_servico_pct,desconto")
      .eq("mesa_id", mesa.id).in("status", ["aberta", "pedindo_conta"]).maybeSingle();

    if (acao === "menu") {
      const [cats, prods, its] = await Promise.all([
        db.from("pdv_categorias").select("id,nome").eq("ativo", true).order("ordem"),
        db.from("pdv_produtos").select("id,nome,descricao,preco,categoria_id,foto_url").eq("ativo", true).eq("disponivel", true).order("ordem").order("nome"),
        com ? db.from("pdv_pedido_itens").select("nome,qtd,preco_unit,status").eq("comanda_id", com.id).neq("status", "cancelado").order("criado_em") : Promise.resolve({ data: [] }),
      ]);
      const sub = (its.data ?? []).reduce((s: number, i: any) => s + i.qtd * i.preco_unit, 0);
      const total = Math.max(0, sub * (1 + (com?.taxa_servico_pct ?? 0) / 100) - (com?.desconto ?? 0));
      return json({
        mesa: mesa.numero, qr_ativo: true, boas_vindas: cfg.tablet_mensagem_boas_vindas, exige_checkin: cfg.tablet_exige_checkin,
        pode_chamar: cfg.tablet_pode_chamar_garcom, pode_conta: cfg.tablet_pode_pedir_conta,
        comanda: com ? { id: com.id, nome_cliente: com.nome_cliente, status: com.status, total } : null,
        itens: its.data ?? [], categorias: cats.data ?? [], produtos: prods.data ?? [],
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
      const { data: prods } = await db.from("pdv_produtos").select("id,nome,preco,destino").in("id", ids).eq("ativo", true).eq("disponivel", true);
      const mapa = new Map((prods ?? []).map((p: any) => [p.id, p]));
      const linhas = [];
      for (const i of itens) {
        const p: any = mapa.get(i.produto_id);
        const q = Math.min(20, Math.max(1, Math.floor(Number(i.qtd) || 0)));
        if (!p) return json({ erro: "Um dos itens não está mais disponível." });
        linhas.push({ comanda_id: com.id, produto_id: p.id, nome: p.nome, qtd: q, preco_unit: p.preco, obs: String(i.obs ?? "").slice(0, 120) || null, destino: p.destino, origem: "tablet" });
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
