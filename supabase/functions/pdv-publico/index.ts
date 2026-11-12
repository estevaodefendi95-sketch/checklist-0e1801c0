// Páginas públicas (sem login): cardápio para consulta (/cardapio) e reservas (/reservar).
// Só leitura do cardápio e criação de reserva via RPC (que valida horário, lotação e limites).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function agoraSP() {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const g = (t: string) => f.find((x) => x.type === t)!.value;
  return { dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday")), min: (Number(g("hour")) % 24) * 60 + Number(g("minute")) };
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
    const { acao, data, pessoas, hora, nome, telefone, ocasiao, obs } = await req.json();
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!).schema("checklist");
    const { data: cfg } = await db.from("pdv_config").select("tablet_tema,tablet_mensagem_boas_vindas").eq("id", 1).single();

    if (acao === "menu") {
      const [cats, prods] = await Promise.all([
        db.from("pdv_categorias").select("id,nome,visivel_tablet,horarios").eq("ativo", true).order("ordem"),
        db.from("pdv_produtos").select("id,nome,descricao,preco,categoria_id,foto_url,visivel_tablet,horarios").eq("ativo", true).eq("disponivel", true).order("ordem").order("nome"),
      ]);
      const catOk = new Map((cats.data ?? []).filter((c: any) => c.visivel_tablet && noHorario(c.horarios)).map((c: any) => [c.id, c]));
      const produtos = (prods.data ?? []).filter((p: any) => p.visivel_tablet && (!p.categoria_id || catOk.has(p.categoria_id)) && noHorario(p.horarios))
        .map((p: any) => ({ id: p.id, nome: p.nome, descricao: p.descricao, preco: p.preco, categoria_id: p.categoria_id, foto_url: p.foto_url }));
      const categorias = [...catOk.values()].filter((c: any) => produtos.some((p: any) => p.categoria_id === c.id)).map((c: any) => ({ id: c.id, nome: c.nome }));
      return json({ tema: cfg?.tablet_tema ?? {}, boas_vindas: cfg?.tablet_mensagem_boas_vindas ?? null, categorias, produtos });
    }

    const { data: rc } = await db.from("reservas_config").select("ativo_online,max_pessoas,dias_futuro,confirmacao_automatica").eq("id", 1).single();
    if (acao === "config") return json({ tema: cfg?.tablet_tema ?? {}, ...rc });

    if (acao === "slots") {
      const d = String(data ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return json({ erro: "Data inválida." });
      const { data: s, error } = await db.rpc("reservas_slots", { p_data: d, p_pessoas: Math.max(1, Math.floor(Number(pessoas) || 1)) });
      if (error) return json({ erro: "Não foi possível consultar os horários." });
      return json({ slots: s ?? [] });
    }

    if (acao === "reservar") {
      const { data: r, error } = await db.rpc("reserva_criar", {
        p_nome: String(nome ?? "").slice(0, 80), p_telefone: String(telefone ?? ""), p_pessoas: Math.floor(Number(pessoas) || 0),
        p_data: String(data ?? ""), p_hora: String(hora ?? ""), p_origem: "site", p_ocasiao: String(ocasiao ?? "").slice(0, 60), p_obs: String(obs ?? "").slice(0, 300),
      });
      if (error) return json({ erro: error.message });
      return json({ ok: true, ...r });
    }
    return json({ erro: "Ação inválida." });
  } catch (_e) {
    return json({ erro: "Erro interno." }, 500);
  }
});
