// API do agente de impressão. Autentica pelo token do dispositivo (tipo agente_impressao).
//   { token, acao: "pull" }                      -> reserva até 10 trabalhos pendentes e devolve com os dados da impressora
//   { token, acao: "ack", id, ok, erro? }        -> marca o trabalho como impresso ou com erro
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
    const { token, acao, id, ok, erro } = await req.json();
    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return json({ erro: "token inválido" }, 401);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!).schema("checklist");
    const { data: disp } = await db.from("pdv_dispositivos").select("id").eq("token", token).eq("tipo", "agente_impressao").eq("ativo", true).maybeSingle();
    if (!disp) return json({ erro: "dispositivo não autorizado" }, 401);
    await db.from("pdv_dispositivos").update({ ultimo_ping: new Date().toISOString() }).eq("id", disp.id);

    if (acao === "pull") {
      const velho = new Date(Date.now() - 60_000).toISOString();
      const { data: fila } = await db.from("pdv_fila_impressao").select("*")
        .or(`status.eq.pendente,and(status.eq.imprimindo,criado_em.lt.${velho})`).lt("tentativas", 5)
        .order("criado_em").limit(10);
      const jobs = [];
      for (const j of fila ?? []) {
        // reserva otimista: só um agente consegue mudar o status deste registro
        const { data: r } = await db.from("pdv_fila_impressao").update({ status: "imprimindo", tentativas: j.tentativas + 1 })
          .eq("id", j.id).eq("status", j.status).select("id");
        if (!r?.length) continue;
        const { data: imp } = await db.from("pdv_impressoras").select("*").eq("id", j.impressora_id).single();
        jobs.push({ ...j, impressora: imp });
      }
      return json({ jobs });
    }
    if (acao === "ack") {
      const { data: j } = await db.from("pdv_fila_impressao").select("impressora_id,tentativas").eq("id", id).single();
      if (!j) return json({ erro: "trabalho não encontrado" }, 404);
      if (ok) {
        await db.from("pdv_fila_impressao").update({ status: "ok", impresso_em: new Date().toISOString(), erro: null }).eq("id", id);
        await db.from("pdv_impressoras").update({ ultimo_ok: new Date().toISOString() }).eq("id", j.impressora_id);
      } else {
        await db.from("pdv_fila_impressao").update({ status: j.tentativas >= 5 ? "erro" : "pendente", erro: String(erro ?? "").slice(0, 300) }).eq("id", id);
      }
      return json({ ok: true });
    }
    return json({ erro: "ação inválida" }, 400);
  } catch (e) {
    return json({ erro: "erro interno" }, 500);
  }
});
