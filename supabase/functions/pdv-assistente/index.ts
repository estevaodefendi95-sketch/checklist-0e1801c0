// Assistente do PDV para perguntas livres. Só lê dados (nunca altera nada).
// Opcional: defina o secret ANTHROPIC_API_KEY (e, se quiser, ANTHROPIC_MODEL). Sem ele, responde texto null
// e a tela usa as respostas prontas.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ texto: null }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: pode } = await user.schema("checklist").rpc("pdv_pode", { p: "pdv_operar" });
    if (pode !== true) return json({ texto: null }, 403);
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ texto: null });
    const { pergunta, tela } = await req.json();
    if (typeof pergunta !== "string" || !pergunta.trim()) return json({ texto: null });

    // contexto lido com a permissão do próprio usuário (RLS)
    const db = user.schema("checklist");
    const ini = new Date(); ini.setHours(0, 0, 0, 0);
    const [abertas, fechadas, avisos, notas] = await Promise.all([
      db.from("pdv_comandas").select("numero,pessoas,status").in("status", ["aberta", "pedindo_conta"]).limit(50),
      db.from("pdv_comandas").select("id,pessoas").eq("status", "fechada").gte("fechada_em", ini.toISOString()).limit(500),
      db.from("pdv_notificacoes").select("titulo,mensagem,criado_em").eq("lida", false).order("criado_em", { ascending: false }).limit(10),
      db.from("pdv_notas").select("status").gte("criado_em", ini.toISOString()).limit(200),
    ]);
    const ctx = JSON.stringify({ tela, comandas_abertas: abertas.data, comandas_fechadas_hoje: fechadas.data?.length, avisos_nao_lidos: avisos.data, notas_hoje: notas.data });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5", max_tokens: 500,
        system: "Você é o assistente do sistema Paggio Operação (PDV, caixa, impressoras, NFC-e, estoque, fichas técnicas) de um restaurante. Responda em português do Brasil, curto e direto. Use apenas o contexto fornecido; se faltar dado, diga qual tela do sistema consultar (Salão, Caixa, Relatórios PDV, Configurações do PDV, Estoque, Notas de compra, Notas de eventos). Você não executa ações.",
        messages: [{ role: "user", content: `Contexto do sistema (JSON): ${ctx}\n\nPergunta: ${pergunta.slice(0, 500)}` }],
      }),
    });
    if (!r.ok) return json({ texto: null });
    const out = await r.json();
    return json({ texto: out.content?.[0]?.text ?? null });
  } catch {
    return json({ texto: null });
  }
});
