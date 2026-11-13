// Aprovação de administrador para cancelar item, cancelar comanda, estornar pagamento, lançar "a receber" e consumo interno (cortesia).
// Dois caminhos: (1) o administrador digita e-mail e senha no aparelho de quem pediu;
// (2) quem pediu "solicita" e o administrador recebe uma notificação push e decide no app dele.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { ...cors, "Content-Type": "application/json" } });
const ACOES = ["cancelar_item", "cancelar_comanda", "estornar", "a_receber", "cortesia"];
const ROTULO: Record<string, string> = { cancelar_item: "Cancelar item", cancelar_comanda: "Cancelar comanda", estornar: "Estornar pagamento", a_receber: "Conta a receber", cortesia: "Consumo interno (sem cobrança)" };

// Executa a ação já aprovada.
const reais = (n: number) => "R$ " + n.toFixed(2).replace(".", ",");

// Valida e limpa os dados do "a receber".
function limparDados(acao: string, d: any): { dados?: Record<string, unknown>; erro?: string } {
  if (acao !== "a_receber") return { dados: {} };
  const nome = String(d?.nome ?? "").trim().slice(0, 80);
  const tel = String(d?.telefone ?? "").replace(/\D/g, "");
  if (nome.length < 2) return { erro: "Informe o nome do cliente." };
  if (tel.length < 10 || tel.length > 13) return { erro: "Informe o telefone do cliente com DDD." };
  const venc = /^\d{4}-\d{2}-\d{2}$/.test(String(d?.vencimento ?? "")) ? String(d.vencimento) : null;
  return { dados: { nome, telefone: tel, vencimento: venc, observacao: String(d?.observacao ?? "").trim().slice(0, 200) || null } };
}

// Fecha a comanda liberando o restante: "a receber" (cobrança depois) ou "cortesia" (consumo interno).
async function liberarComanda(db: any, acao: "a_receber" | "cortesia", id: string, mot: string, dados: any, solicitante: string, aprovador: string): Promise<{ ok?: true; erro?: string }> {
  const { data: c } = await db.from("pdv_comandas").select("id,numero,status").eq("id", id).maybeSingle();
  if (!c) return { erro: "Comanda não encontrada." };
  if (!["aberta", "pedindo_conta"].includes(c.status)) return { erro: "A comanda não está aberta." };
  const { data: t } = await db.from("pdv_comanda_totais").select("total,pago").eq("comanda_id", id).maybeSingle();
  const restante = Math.round((Number(t?.total ?? 0) - Number(t?.pago ?? 0)) * 100) / 100;
  if (restante <= 0.004) return { erro: "Não há valor restante nesta comanda." };
  const { data: ses } = await db.from("pdv_caixa_sessoes").select("id").eq("status", "aberto").eq("aberto_por", solicitante).maybeSingle();
  const { data: pg, error: e1 } = await db.from("pdv_pagamentos").insert({ comanda_id: id, sessao_id: ses?.id ?? null, forma: acao, valor: restante, troco: 0, user_id: solicitante }).select("id").single();
  if (e1) return { erro: e1.message };
  if (acao === "a_receber") {
    const { error } = await db.from("pdv_a_receber").insert({
      comanda_id: id, pagamento_id: pg.id, cliente_nome: dados.nome, telefone: dados.telefone, valor: restante,
      vencimento: dados.vencimento ?? null, observacao: dados.observacao ?? null, criado_por: solicitante, aprovado_por: aprovador,
    });
    if (error) { await db.from("pdv_pagamentos").delete().eq("id", pg.id); return { erro: error.message }; }
  }
  const { error: e3 } = await db.from("pdv_comandas").update({ status: "fechada", fechada_em: new Date().toISOString(), sessao_id: ses?.id ?? null }).eq("id", id);
  if (e3) return { erro: e3.message };
  await db.from("pdv_aprovacoes").insert({
    acao, comanda_id: id, pagamento_id: pg.id, motivo: mot || null, solicitado_por: solicitante, aprovado_por: aprovador,
    detalhe: acao === "a_receber" ? `Comanda ${c.numero} · ${reais(restante)} · ${dados.nome} ${dados.telefone}` : `Comanda ${c.numero} · ${reais(restante)} liberado sem cobrança`,
  });
  return { ok: true };
}

async function executar(db: any, acao: string, id: string, mot: string, solicitante: string, aprovador: string, dados: any = {}): Promise<{ ok?: true; erro?: string }> {
  if (acao === "a_receber" || acao === "cortesia") return liberarComanda(db, acao, id, mot, dados, solicitante, aprovador);
  const log = (x: Record<string, unknown>) => db.from("pdv_aprovacoes").insert({ acao, motivo: mot || null, solicitado_por: solicitante, aprovado_por: aprovador, ...x });
  if (acao === "cancelar_item") {
    const { data: it } = await db.from("pdv_pedido_itens").select("id,nome,qtd,comanda_id,status").eq("id", id).maybeSingle();
    if (!it) return { erro: "Item não encontrado." };
    if (it.status === "cancelado") return { ok: true };
    const { error } = await db.from("pdv_pedido_itens").update({ status: "cancelado", cancelado_motivo: mot }).eq("id", id);
    if (error) return { erro: error.message };
    await log({ comanda_id: it.comanda_id, item_id: id, detalhe: `${it.qtd}× ${it.nome}` });
    return { ok: true };
  }
  if (acao === "estornar") {
    const { data: p } = await db.from("pdv_pagamentos").select("id,comanda_id,forma,valor,troco,estornado").eq("id", id).maybeSingle();
    if (!p) return { erro: "Pagamento não encontrado." };
    if (p.estornado) return { ok: true };
    const { error } = await db.from("pdv_pagamentos").update({ estornado: true }).eq("id", id);
    if (error) return { erro: error.message };
    await log({ comanda_id: p.comanda_id, pagamento_id: id, detalhe: `${p.forma} R$ ${(Number(p.valor) - Number(p.troco)).toFixed(2)}` });
    return { ok: true };
  }
  const { data: c } = await db.from("pdv_comandas").select("id,numero,status").eq("id", id).maybeSingle();
  if (!c) return { erro: "Comanda não encontrada." };
  if (!["aberta", "pedindo_conta"].includes(c.status)) return { erro: "A comanda não está aberta." };
  const { count: pagos } = await db.from("pdv_pagamentos").select("id", { count: "exact", head: true }).eq("comanda_id", id).eq("estornado", false);
  if ((pagos ?? 0) > 0) return { erro: "Estorne os pagamentos antes de cancelar." };
  await db.from("pdv_pedido_itens").update({ status: "cancelado", cancelado_motivo: mot || "comanda cancelada" }).eq("comanda_id", id).neq("status", "cancelado");
  const { error } = await db.from("pdv_comandas").update({ status: "cancelada", fechada_em: new Date().toISOString() }).eq("id", id);
  if (error) return { erro: error.message };
  await log({ comanda_id: id, detalhe: `Comanda ${c.numero}` });
  return { ok: true };
}

// Notificação push para todos os aparelhos de administradores.
async function avisarAdmins(db: any, payload: Record<string, unknown>) {
  const { data: v } = await db.from("pdv_vapid").select("*").eq("id", 1).maybeSingle();
  if (!v) return 0;
  webpush.setVapidDetails(v.assunto, v.chave_publica, v.chave_privada);
  const { data: admins } = await db.from("profiles").select("id").or("role.eq.admin,is_master.eq.true");
  const { data: subs } = await db.from("pdv_push_subs").select("id,endpoint,p256dh,auth").in("user_id", (admins ?? []).map((a: any) => a.id));
  let n = 0;
  await Promise.all((subs ?? []).map(async (sub: any) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
      n++;
    } catch (e) {
      const sc = (e as any)?.statusCode;
      if (sc === 404 || sc === 410) await db.from("pdv_push_subs").delete().eq("id", sub.id);
    }
  }));
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { acao, tipo, id, motivo, email, senha, pedido_id, decisao, dados } = await req.json();
    const url = Deno.env.get("SUPABASE_URL")!;
    const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const db = sb.schema("checklist");

    // quem está pedindo
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
    const { data: u } = await sb.auth.getUser(jwt);
    const eu = u?.user?.id;
    if (!eu) return json({ erro: "Sessão expirada. Entre de novo." });
    const [{ data: sp }, { data: sperm }] = await Promise.all([
      db.from("profiles").select("nome,role,is_master").eq("id", eu).maybeSingle(),
      db.from("permissoes").select("*").eq("user_id", eu).maybeSingle(),
    ]);
    const souAdmin = !!(sp?.role === "admin" || sp?.is_master);

    // ---- o administrador decide um pedido (aprovar ou recusar) pelo app dele
    if (acao === "decidir") {
      if (!souAdmin) return json({ erro: "Só administrador pode decidir." });
      const { data: p } = await db.from("pdv_aprov_pedidos").select("*").eq("id", String(pedido_id ?? "")).maybeSingle();
      if (!p) return json({ erro: "Pedido não encontrado." });
      if (p.status !== "pendente") return json({ erro: "Esse pedido já foi decidido." });
      if (Date.now() - new Date(p.criado_em).getTime() > 30 * 60 * 1000) return json({ erro: "Pedido expirado (mais de 30 min). Peça de novo." });
      if (decisao === "recusar") {
        await db.from("pdv_aprov_pedidos").update({ status: "recusado", decidido_por: eu, decidido_em: new Date().toISOString() }).eq("id", p.id);
        return json({ ok: true });
      }
      const r = await executar(db, p.acao, p.alvo_id, p.motivo ?? "", p.solicitado_por, eu, p.dados ?? {});
      if (r.erro) {
        await db.from("pdv_aprov_pedidos").update({ status: "recusado", erro: r.erro, decidido_por: eu, decidido_em: new Date().toISOString() }).eq("id", p.id);
        return json({ erro: r.erro });
      }
      await db.from("pdv_aprov_pedidos").update({ status: "aprovado", decidido_por: eu, decidido_em: new Date().toISOString() }).eq("id", p.id);
      return json({ ok: true });
    }

    // daqui para baixo: cancelar_item | cancelar_comanda | estornar (senha) ou "solicitar" (push)
    const alvoAcao = acao === "solicitar" ? tipo : acao;
    if (!ACOES.includes(alvoAcao)) return json({ erro: "Ação inválida." });
    const precisa = ["estornar", "a_receber", "cortesia"].includes(alvoAcao) ? "pdv_caixa" : "pdv_operar";
    if (!souAdmin && !(sperm as any)?.[precisa]) return json({ erro: "Você não tem permissão para isso." });
    if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ""))) return json({ erro: "Registro inválido." });
    const mot = String(motivo ?? "").trim().slice(0, 200);
    if (!["estornar", "a_receber"].includes(alvoAcao) && mot.length < 3) return json({ erro: "Informe o motivo." });
    const ld = limparDados(alvoAcao, dados);
    if (ld.erro) return json({ erro: ld.erro });
    const dadosOk = ld.dados!;

    if (acao === "solicitar") {
      const { data: ja } = await db.from("pdv_aprov_pedidos").select("id").eq("alvo_id", id).eq("acao", alvoAcao).eq("status", "pendente").gte("criado_em", new Date(Date.now() - 30 * 60 * 1000).toISOString()).maybeSingle();
      if (ja) return json({ ok: true, pedido_id: ja.id });
      // descrição do alvo para a notificação
      let detalhe = "", comanda_id: string | null = null, onde = "";
      if (alvoAcao === "cancelar_item") {
        const { data: it } = await db.from("pdv_pedido_itens").select("nome,qtd,preco_unit,comanda_id").eq("id", id).maybeSingle();
        if (!it) return json({ erro: "Item não encontrado." });
        detalhe = `${it.qtd}× ${it.nome} (R$ ${(it.qtd * it.preco_unit).toFixed(2)})`; comanda_id = it.comanda_id;
      } else if (alvoAcao === "estornar") {
        const { data: pg } = await db.from("pdv_pagamentos").select("forma,valor,troco,comanda_id").eq("id", id).maybeSingle();
        if (!pg) return json({ erro: "Pagamento não encontrado." });
        detalhe = `${pg.forma} R$ ${(Number(pg.valor) - Number(pg.troco)).toFixed(2)}`; comanda_id = pg.comanda_id;
      } else if (alvoAcao === "a_receber" || alvoAcao === "cortesia") {
        comanda_id = id;
        const { data: t } = await db.from("pdv_comanda_totais").select("total,pago").eq("comanda_id", id).maybeSingle();
        const rest = Number(t?.total ?? 0) - Number(t?.pago ?? 0);
        detalhe = alvoAcao === "a_receber" ? `${reais(rest)} — ${dadosOk.nome}` : `${reais(rest)} sem cobrança`;
      } else comanda_id = id;
      if (comanda_id) {
        const { data: c } = await db.from("pdv_comandas").select("numero,mesa_id").eq("id", comanda_id).maybeSingle();
        const { data: m } = c?.mesa_id ? await db.from("pdv_mesas").select("numero").eq("id", c.mesa_id).maybeSingle() : { data: null };
        onde = c ? `Comanda ${c.numero}${m ? " · mesa " + m.numero : ""}` : "";
        if (alvoAcao === "cancelar_comanda") detalhe = onde;
      }
      const { data: novo, error } = await db.from("pdv_aprov_pedidos").insert({ acao: alvoAcao, alvo_id: id, comanda_id, detalhe, motivo: mot || null, solicitado_por: eu, solicitante_nome: sp?.nome ?? null, dados: dadosOk }).select("id").single();
      if (error) return json({ erro: error.message });
      const enviados = await avisarAdmins(db, {
        title: `${ROTULO[alvoAcao]} — aprovar?`,
        body: `${sp?.nome ?? "Equipe"}: ${detalhe}${onde && alvoAcao !== "cancelar_comanda" ? " · " + onde : ""}${mot ? " — " + mot : ""}`,
        tag: novo.id, url: "/",
      });
      return json({ ok: true, pedido_id: novo.id, notificados: enviados });
    }

    // ---- caminho da senha: limite de tentativas erradas
    const desde = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await db.from("pdv_aprov_falhas").select("id", { count: "exact", head: true }).eq("user_id", eu).gte("criado_em", desde);
    if ((count ?? 0) >= 5) return json({ erro: "Muitas tentativas. Aguarde 10 minutos." });
    const mail = String(email ?? "").trim().toLowerCase();
    if (!mail || !senha) return json({ erro: "Informe e-mail e senha do administrador." });
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: login, error: le } = await anon.auth.signInWithPassword({ email: mail, password: String(senha) });
    const aprovador = login?.user?.id;
    if (le || !aprovador) { await db.from("pdv_aprov_falhas").insert({ user_id: eu }); return json({ erro: "E-mail ou senha incorretos." }); }
    const { data: ap } = await db.from("profiles").select("role,is_master").eq("id", aprovador).maybeSingle();
    if (!(ap?.role === "admin" || ap?.is_master)) { await db.from("pdv_aprov_falhas").insert({ user_id: eu }); return json({ erro: "Esse usuário não é administrador." }); }
    return json(await executar(db, alvoAcao, id, mot, eu, aprovador, dadosOk));
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) });
  }
});
