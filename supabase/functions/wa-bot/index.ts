// API do agente de WhatsApp (WhatsApp Web rodando no computador da casa) + bot de reservas e envio de cardápio.
//   { token, acao: "sync", status, numero?, qr? }      -> heartbeat; devolve até 10 mensagens a enviar
//   { token, acao: "ack", id, ok, erro? }               -> confirma envio
//   { token, acao: "receber", telefone, nome?, texto }  -> grava a mensagem do cliente e devolve as respostas do bot
// Autentica pelo token de um dispositivo do tipo "agente_whatsapp".
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const norm = (s: string) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
const fmt = (iso: string) => `${DIAS[dow(iso)]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function lerData(t: string): string | null {
  const h = hojeSP();
  if (t === "hoje") return h;
  if (t === "amanha") return somaDias(h, 1);
  if (t === "depois de amanha") return somaDias(h, 2);
  const nomes = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const w = nomes.findIndex((n) => t.startsWith(n));
  if (w >= 0) { for (let i = 0; i < 7; i++) if (dow(somaDias(h, i)) === w) return somaDias(h, i); }
  const m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]);
    let y = m[3] ? Number(m[3]) : Number(h.slice(0, 4));
    if (y < 100) y += 2000;
    const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || Number.isNaN(Date.parse(iso))) return null;
    if (!m[3] && iso < h) return `${y + 1}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return iso;
  }
  return null;
}

// deno-lint-ignore no-explicit-any
type Db = any;
interface Conv { telefone: string; nome: string | null; estado: string; dados: Record<string, any>; humano: boolean }
interface Cfg { bot_ativo: boolean; link_base: string; boas_vindas: string; texto_info: string }

const menu = (c: Cfg) => `${c.boas_vindas}\n\nEscolha uma opção:\n1️⃣ Reservar uma mesa\n2️⃣ Ver o cardápio\n3️⃣ Horários e informações\n4️⃣ Minhas reservas\n0️⃣ Falar com um atendente\n\n_(Digite *menu* a qualquer momento para voltar.)_`;

async function bot(db: Db, cfg: Cfg, conv: Conv, texto: string): Promise<{ respostas: string[]; estado: string; dados: Record<string, any>; humano?: boolean }> {
  const t = norm(texto);
  let estado = conv.estado, dados = { ...conv.dados };
  const R = (...r: string[]) => ({ respostas: r, estado, dados });
  const base = cfg.link_base.replace(/\/$/, "");

  if (["menu", "oi", "ola", "bom dia", "boa tarde", "boa noite", "inicio", "voltar", "cancelar", "start"].includes(t)) { estado = "menu"; dados = {}; return R(menu(cfg)); }
  if (t === "0" || t === "atendente" || t === "humano") {
    await db.from("pdv_notificacoes").insert({ tipo: "whatsapp", nivel: "aviso", titulo: "Cliente pediu atendente no WhatsApp", mensagem: `${conv.nome ?? conv.telefone} (${conv.telefone})`, ref_tabela: "wa_conversas" });
    estado = "menu"; dados = {};
    return { ...R("Certo! Já avisei nossa equipe — alguém responde por aqui em instantes. 🙂"), humano: true };
  }
  const cancela = t.match(/^cancelar (\d+)$/);
  if (cancela && Array.isArray(dados.lista)) {
    const id = dados.lista[Number(cancela[1]) - 1];
    if (id) {
      await db.from("reservas").update({ status: "cancelada", atualizado_em: new Date().toISOString() }).eq("id", id).eq("telefone", conv.telefone);
      estado = "menu"; dados = {};
      return R("Reserva cancelada. Se quiser, é só fazer outra: digite *1*.");
    }
  }

  if (estado === "r_data") {
    const d = lerData(t);
    if (!d) return R("Não entendi a data. Pode digitar *hoje*, *amanhã*, um dia da semana (ex.: *sexta*) ou a data (ex.: *25/11*).");
    const { data: s } = await db.rpc("reservas_slots", { p_data: d, p_pessoas: 1 });
    if (!s?.length) return R(`Não temos horários disponíveis para ${fmt(d)} (fechado, fora do prazo ou muito em cima da hora). Escolha outra data.`);
    dados.data = d; estado = "r_pessoas";
    return R(`Perfeito, ${fmt(d)}! Para quantas pessoas?`);
  }
  if (estado === "r_pessoas") {
    const n = parseInt(t, 10);
    if (!n || n < 1) return R("Digite só o número de pessoas (ex.: *4*).");
    const { data: rc } = await db.from("reservas_config").select("max_pessoas").eq("id", 1).single();
    if (n > (rc?.max_pessoas ?? 12)) return R(`Para grupos acima de ${rc?.max_pessoas ?? 12} pessoas precisamos combinar direto. Digite *0* para falar com a equipe.`);
    const { data: s } = await db.rpc("reservas_slots", { p_data: dados.data, p_pessoas: n });
    const livres = (s ?? []).filter((x: { livre: boolean }) => x.livre).map((x: { hora: string }) => x.hora).slice(0, 12);
    if (!livres.length) { estado = "r_data"; return R(`${fmt(dados.data)} está lotado para ${n} pessoas. Quer tentar outro dia? Digite a data.`); }
    dados.pessoas = n; dados.slots = livres; estado = "r_hora";
    return R(`Horários livres em ${fmt(dados.data)} para ${n} pessoa(s):\n${livres.map((h: string, i: number) => `${i + 1}) ${h}`).join("\n")}\n\nResponda com o *número* ou o horário (ex.: *20:00*).`);
  }
  if (estado === "r_hora") {
    let hora: string | null = null;
    const n = parseInt(t, 10);
    if (/^\d{1,2}$/.test(t) && n >= 1 && n <= dados.slots.length) hora = dados.slots[n - 1];
    else { const m = t.match(/^(\d{1,2})(?:[:h](\d{2}))?$/); if (m) { const c = `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`; if (dados.slots.includes(c)) hora = c; } }
    if (!hora) return R("Não encontrei esse horário na lista. Responda com o número da opção ou um horário listado.");
    dados.hora = hora;
    const { data: cli } = await db.from("pdv_clientes").select("nome").eq("telefone", conv.telefone).maybeSingle();
    if (cli?.nome) { dados.nome = cli.nome; estado = "r_confirma"; return R(resumo(dados)); }
    estado = "r_nome"; return R("Em nome de quem fica a reserva? (nome completo)");
  }
  if (estado === "r_nome") {
    const nome = String(texto).trim();
    if (nome.length < 2 || nome.length > 60) return R("Digite o nome para a reserva.");
    dados.nome = nome; estado = "r_confirma"; return R(resumo(dados));
  }
  if (estado === "r_confirma") {
    if (["nao", "n", "não"].includes(t)) { estado = "menu"; dados = {}; return R("Tudo bem, reserva não feita. Digite *menu* para ver as opções."); }
    if (!["sim", "s", "confirmo", "confirmar", "ok", "pode ser"].includes(t)) return R("Responda *sim* para confirmar ou *não* para cancelar.");
    const { data: r, error } = await db.rpc("reserva_criar", { p_nome: dados.nome, p_telefone: conv.telefone, p_pessoas: dados.pessoas, p_data: dados.data, p_hora: dados.hora, p_origem: "whatsapp", p_ocasiao: "", p_obs: "" });
    if (error) { estado = "r_data"; return R(`😕 ${error.message}\nVamos tentar outro horário — para qual dia?`); }
    const d = dados; estado = "menu"; dados = {};
    return R(r.status === "confirmada"
      ? `✅ Reserva confirmada!\n📅 ${fmt(d.data)} às ${d.hora}\n👥 ${d.pessoas} pessoa(s) · ${d.nome}\n\nSe precisar alterar ou cancelar, digite *4*. Até lá!`
      : `📝 Recebemos seu pedido de reserva para ${fmt(d.data)} às ${d.hora} (${d.pessoas} pessoa(s)). Nossa equipe confirma por aqui em breve.`);
  }

  // menu principal
  if (t === "1" || t.includes("reserv")) { estado = "r_data"; dados = {}; return R("Vamos reservar! 🎉 Para qual dia?\nDigite *hoje*, *amanhã*, um dia da semana (ex.: *sexta*) ou a data (ex.: *25/11*).\n\n_(Digite *menu* para voltar.)_"); }
  if (t === "2" || t.includes("cardapio")) return R(`🍽️ Nosso cardápio digital:\n${base}/cardapio\n\nQuer reservar uma mesa? Digite *1*.`);
  if (t === "3" || t.includes("horario") || t.includes("endereco")) return R(cfg.texto_info + "\n\nDigite *menu* para ver as opções.");
  if (t === "4" || t.includes("minha")) {
    const { data: l } = await db.from("reservas").select("id,data,hora,pessoas,status").eq("telefone", conv.telefone).in("status", ["pendente", "confirmada"]).gte("data", hojeSP()).order("data").order("hora").limit(5);
    if (!l?.length) return R("Você não tem reservas futuras. Para reservar, digite *1*.");
    dados.lista = l.map((x: { id: string }) => x.id);
    return R(`Suas reservas:\n${l.map((x: { data: string; hora: string; pessoas: number; status: string }, i: number) => `${i + 1}) ${fmt(x.data)} às ${x.hora.slice(0, 5)} · ${x.pessoas} pessoa(s) · ${x.status}`).join("\n")}\n\nPara cancelar, responda *cancelar 1* (o número da reserva).`);
  }
  return R("Não entendi 😅\n\n" + menu(cfg));
}
function resumo(d: Record<string, any>) {
  return `Confira sua reserva:\n📅 ${fmt(d.data)} às ${d.hora}\n👥 ${d.pessoas} pessoa(s)\n🙋 ${d.nome}\n\nConfirma? Responda *sim* ou *não*.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json();
    const { token, acao } = b;
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return json({ erro: "token inválido" }, 401);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!).schema("checklist");
    const { data: disp } = await db.from("pdv_dispositivos").select("id").eq("token", token).eq("tipo", "agente_whatsapp").eq("ativo", true).maybeSingle();
    if (!disp) return json({ erro: "dispositivo não autorizado" }, 401);
    await db.from("pdv_dispositivos").update({ ultimo_ping: new Date().toISOString() }).eq("id", disp.id);

    if (acao === "sync") {
      await db.from("wa_config").update({ agente_ping: new Date().toISOString(), agente_status: String(b.status ?? "conectado").slice(0, 30), agente_numero: b.numero ? String(b.numero).slice(0, 20) : null, agente_qr: b.qr ? String(b.qr).slice(0, 600) : null }).eq("id", 1);
      const velho = new Date(Date.now() - 120_000).toISOString();
      const { data: fila } = await db.from("wa_mensagens").select("id,telefone,texto,status,tentativas")
        .eq("direcao", "out").or(`status.eq.pendente,and(status.eq.enviando,criado_em.lt.${velho})`).lt("tentativas", 5).order("criado_em").limit(10);
      const msgs = [];
      for (const m of fila ?? []) {
        const { data: ok } = await db.from("wa_mensagens").update({ status: "enviando", tentativas: m.tentativas + 1 }).eq("id", m.id).eq("status", m.status).select("id");
        if (ok?.length) msgs.push({ id: m.id, telefone: m.telefone, texto: m.texto });
      }
      return json({ mensagens: msgs });
    }
    if (acao === "ack") {
      const { data: m } = await db.from("wa_mensagens").select("tentativas").eq("id", b.id).maybeSingle();
      const falhou = !b.ok;
      await db.from("wa_mensagens").update(falhou ? { status: (m?.tentativas ?? 5) >= 5 ? "erro" : "pendente", erro: String(b.erro ?? "").slice(0, 200) } : { status: "enviada", erro: null }).eq("id", b.id);
      return json({ ok: true });
    }
    if (acao === "receber") {
      let tel = String(b.telefone ?? "").replace(/\D/g, "");
      if (tel.length > 11 && tel.startsWith("55")) tel = tel.slice(2);
      const texto = String(b.texto ?? "").slice(0, 1000);
      if (tel.length < 10 || tel.length > 11 || !texto.trim()) return json({ respostas: [] });
      await db.from("wa_mensagens").insert({ telefone: tel, direcao: "in", texto, status: "recebida", origem: "cliente" });
      const { data: ex } = await db.from("wa_conversas").select("*").eq("telefone", tel).maybeSingle();
      const { data: cli } = await db.from("pdv_clientes").select("id,nome").eq("telefone", tel).maybeSingle();
      const conv: Conv = ex ?? { telefone: tel, nome: null, estado: "menu", dados: {}, humano: false };
      const nome = cli?.nome ?? (b.nome ? String(b.nome).slice(0, 60) : conv.nome);
      const { data: cfg } = await db.from("wa_config").select("bot_ativo,link_base,boas_vindas,texto_info").eq("id", 1).single();
      let resp: { respostas: string[]; estado: string; dados: Record<string, any>; humano?: boolean } = { respostas: [], estado: conv.estado, dados: conv.dados };
      if (cfg?.bot_ativo && !conv.humano) {
        // conversa nova ou parada há mais de 6h recomeça no menu
        const parada = ex && Date.now() - new Date(ex.ultima_em).getTime() > 6 * 3600_000;
        const nova = !ex || parada;
        resp = nova && !["1", "2", "3", "4", "0"].includes(norm(texto)) ? { respostas: [menu(cfg)], estado: "menu", dados: {} } : await bot(db, cfg, nova ? { ...conv, estado: "menu", dados: {} } : conv, texto);
      }
      await db.from("wa_conversas").upsert({ telefone: tel, nome, cliente_id: cli?.id ?? null, estado: resp.estado, dados: resp.dados, humano: resp.humano ?? conv.humano, nao_lidas: (ex?.nao_lidas ?? 0) + 1, ultima_em: new Date().toISOString() }, { onConflict: "telefone" });
      const saidas = [];
      for (const r of resp.respostas) {
        const { data: ins } = await db.from("wa_mensagens").insert({ telefone: tel, direcao: "out", texto: r, status: "enviando", origem: "bot", tentativas: 1 }).select("id").single();
        if (ins) saidas.push({ id: ins.id, texto: r });
      }
      return json({ respostas: saidas });
    }
    return json({ erro: "ação inválida" });
  } catch (_e) {
    return json({ erro: "Erro interno." }, 500);
  }
});
