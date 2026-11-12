// Emissão de NFC-e pela Focus NFe. Secret necessário: FOCUSNFE_TOKEN (supabase secrets set FOCUSNFE_TOKEN=...).
// ATENÇÃO: escrito conforme a documentação da Focus; valide SEMPRE em homologação antes de produção.
//   { acao: "status" }                              testa token/ambiente
//   { acao: "emitir", comanda_id }                  monta e envia a NFC-e da comanda
//   { acao: "consultar", referencia }               atualiza o status da nota
//   { acao: "cancelar", referencia, justificativa } cancela nota autorizada
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const FORMA: Record<string, string> = { dinheiro: "01", credito: "03", debito: "04", voucher: "05", pix: "17", outros: "99" };
const r2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Não autenticado." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const body = await req.json();
    const acao = body.acao as string;

    const { data: podeFiscal } = await user.schema("checklist").rpc("pdv_pode", { p: "pdv_fiscal" });
    const { data: podeCaixa } = await user.schema("checklist").rpc("pdv_pode", { p: "pdv_caixa" });
    if (!(podeFiscal === true || (["emitir", "consultar", "emitir_evento", "consultar_evento"].includes(acao) && podeCaixa === true))) return json({ error: "Sem permissão fiscal." }, 403);

    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!).schema("checklist");
    const { data: cfg } = await db.from("pdv_fiscal_config").select("*").eq("id", 1).single();
    const token = Deno.env.get("FOCUSNFE_TOKEN");
    if (!token) return json({ error: "Secret FOCUSNFE_TOKEN não configurado na função." }, 400);
    const base = cfg.ambiente === "producao" ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
    const hdr = { Authorization: "Basic " + btoa(token + ":"), "Content-Type": "application/json" };

    if (acao === "status") {
      const r = await fetch(`${base}/v2/nfce/__teste__`, { headers: hdr });
      const ok = r.status === 404 || r.status === 200; // 404 = autenticou, referência inexistente
      return json({ mensagem: ok ? `Conexão OK (${cfg.ambiente}).` : `Focus respondeu ${r.status}: verifique o token/ambiente.` });
    }

    if (acao === "emitir") {
      if (!cfg.ativo) return json({ error: "Módulo fiscal inativo." }, 400);
      if (!cfg.cnpj) return json({ error: "Cadastre o CNPJ do emitente." }, 400);
      const { data: ja } = await db.from("pdv_notas").select("id,status").eq("comanda_id", body.comanda_id).in("status", ["autorizada", "processando", "pendente"]).limit(1);
      if (ja?.length) return json({ error: "Esta comanda já tem nota em andamento ou autorizada." }, 409);
      const { data: com } = await db.from("pdv_comandas").select("*").eq("id", body.comanda_id).single();
      const { data: its } = await db.from("pdv_pedido_itens").select("*, produto:pdv_produtos(*), cobranca:pdv_cobrancas(*)").eq("comanda_id", com.id).neq("status", "cancelado");
      const { data: pgs } = await db.from("pdv_pagamentos").select("forma,valor,troco").eq("comanda_id", com.id).eq("estornado", false);
      if (!its?.length) return json({ error: "Comanda sem itens." }, 400);

      const bruto = its.reduce((s: number, i: any) => s + i.qtd * i.preco_unit, 0);
      const desc = Math.min(com.desconto, bruto);
      const simples = cfg.regime_tributario !== "regime_normal";
      const itens = its.map((i: any, n: number) => {
        const p = i.produto ?? i.cobranca ?? {};
        const vb = r2(i.qtd * i.preco_unit);
        return {
          numero_item: n + 1, codigo_produto: p.codigo || String(n + 1), descricao: i.nome, codigo_ncm: p.ncm,
          cfop: p.cfop || "5102", unidade_comercial: p.unidade || "UN", quantidade_comercial: i.qtd,
          valor_unitario_comercial: i.preco_unit, valor_bruto: vb, unidade_tributavel: p.unidade || "UN",
          quantidade_tributavel: i.qtd, valor_unitario_tributavel: i.preco_unit,
          valor_desconto: r2(desc * (vb / bruto)), icms_origem: p.origem ?? 0,
          icms_situacao_tributaria: simples ? (p.csosn || "102") : (p.cst_icms || "00"),
          pis_situacao_tributaria: p.cst_pis || "07", cofins_situacao_tributaria: p.cst_cofins || "07",
        };
      });
      const semNcm = its.filter((i: any) => !(i.produto ?? i.cobranca)?.ncm).map((i: any) => i.nome);
      if (semNcm.length) return json({ error: `Produtos sem NCM: ${[...new Set(semNcm)].join(", ")}` }, 400);

      // pagamentos: o fiscal cobre só os itens (serviço/gorjeta fora da nota); distribui proporcionalmente
      const totalNota = r2(bruto - desc);
      const pagoLiq = (pgs ?? []).reduce((s: number, p: any) => s + p.valor - p.troco, 0) || 1;
      const formas: { forma_pagamento: string; valor_pagamento: number }[] = [];
      let acum = 0;
      (pgs ?? []).forEach((p: any, k: number) => {
        const v = k === (pgs!.length - 1) ? r2(totalNota - acum) : r2(totalNota * ((p.valor - p.troco) / pagoLiq));
        acum += v;
        formas.push({ forma_pagamento: FORMA[p.forma] ?? "99", valor_pagamento: v });
      });

      const ref = `paggio-${com.numero}-${Date.now()}`;
      const payload: Record<string, unknown> = {
        natureza_operacao: "VENDA AO CONSUMIDOR", data_emissao: new Date().toISOString(), presenca_comprador: "1",
        modalidade_frete: "9", local_destino: "1", cnpj_emitente: String(cfg.cnpj).replace(/\D/g, ""),
        itens, formas_pagamento: formas,
      };
      const doc = String(com.cpf_cnpj_nota ?? "").replace(/\D/g, "");
      if (doc.length === 11) payload.cpf_destinatario = doc;
      if (doc.length === 14) payload.cnpj_destinatario = doc;

      await db.from("pdv_notas").insert({ comanda_id: com.id, referencia: ref, status: "processando", payload });
      const r = await fetch(`${base}/v2/nfce?ref=${ref}`, { method: "POST", headers: hdr, body: JSON.stringify(payload) });
      const resp = await r.json().catch(() => ({}));
      const st = r.ok ? (resp.status === "autorizado" ? "autorizada" : "processando") : "erro";
      await db.from("pdv_notas").update({ status: st, resposta: resp, mensagem: resp.mensagem ?? resp.mensagem_sefaz ?? null, atualizado_em: new Date().toISOString() }).eq("referencia", ref);
      return json({ mensagem: r.ok ? "NFC-e enviada. Consulte o status em instantes." : (resp.mensagem ?? "Erro ao enviar."), referencia: ref }, r.ok ? 200 : 400);
    }

    if (acao === "emitir_evento" || acao === "consultar_evento") {
      // NFS-e de eventos (serviço) pela Focus NFe. Cada município pode exigir campos próprios: valide em homologação.
      const { data: ev } = await db.from("pdv_eventos").select("*").eq("id", body.evento_id).single();
      if (!ev) return json({ error: "Evento não encontrado." }, 404);
      const mapa: Record<string, string> = { autorizado: "autorizada", cancelado: "cancelada", erro_autorizacao: "rejeitada", processando_autorizacao: "processando", rejeitado: "rejeitada" };
      const atualizar = async (resp: any, ok: boolean) => {
        const st = mapa[resp.status] ?? (ok ? "processando" : "erro");
        await db.from("pdv_eventos").update({
          status: st, resposta: resp, mensagem: resp.mensagem ?? resp.erros?.[0]?.mensagem ?? null, numero_nota: resp.numero ? String(resp.numero) : ev.numero_nota,
          nota_url: resp.url ?? resp.url_danfse ?? null, atualizado_em: new Date().toISOString(),
        }).eq("id", ev.id);
        return st;
      };
      if (acao === "consultar_evento") {
        if (!ev.referencia) return json({ error: "Evento ainda não enviado." }, 400);
        const r = await fetch(`${base}/v2/nfse/${ev.referencia}`, { headers: hdr });
        const resp = await r.json().catch(() => ({}));
        return json({ mensagem: `Status: ${await atualizar(resp, r.ok)}` });
      }
      if (["processando", "autorizada", "manual"].includes(ev.status)) return json({ error: "Este evento já tem nota em andamento ou emitida." }, 409);
      if (!cfg.cnpj || !cfg.inscricao_municipal || !cfg.codigo_municipio_ibge) return json({ error: "Complete CNPJ, inscrição municipal e código IBGE do emitente (Configurações › Fiscal)." }, 400);
      if (!cfg.item_lista_servico) return json({ error: "Informe o item da lista de serviço (Configurações › Fiscal)." }, 400);
      const doc = String(ev.tomador_doc).replace(/\D/g, "");
      const ref = `evento-${ev.id.slice(0, 8)}-${Date.now()}`;
      const payload: Record<string, unknown> = {
        data_emissao: new Date().toISOString(),
        prestador: { cnpj: String(cfg.cnpj).replace(/\D/g, ""), inscricao_municipal: String(cfg.inscricao_municipal).replace(/\D/g, ""), codigo_municipio: cfg.codigo_municipio_ibge },
        tomador: {
          ...(doc.length === 14 ? { cnpj: doc } : { cpf: doc }), razao_social: ev.tomador_nome, email: ev.tomador_email ?? undefined,
          endereco: ev.tomador_logradouro ? { logradouro: ev.tomador_logradouro, numero: ev.tomador_numero || "S/N", bairro: ev.tomador_bairro, codigo_municipio: ev.tomador_codigo_municipio, uf: ev.tomador_uf, cep: ev.tomador_cep } : undefined,
        },
        servico: {
          aliquota: Number(cfg.aliquota_iss ?? 0), discriminacao: `${ev.descricao_servico}${ev.data_evento ? ` — evento em ${ev.data_evento}` : ""}`, iss_retido: false,
          item_lista_servico: cfg.item_lista_servico, codigo_tributario_municipio: cfg.codigo_tributario_municipio ?? undefined, valor_servicos: Number(ev.valor),
        },
      };
      await db.from("pdv_eventos").update({ referencia: ref, status: "processando", mensagem: null }).eq("id", ev.id);
      const r = await fetch(`${base}/v2/nfse?ref=${ref}`, { method: "POST", headers: hdr, body: JSON.stringify(payload) });
      const resp = await r.json().catch(() => ({}));
      const st = await atualizar(resp, r.ok);
      return json({ mensagem: r.ok ? `NFS-e enviada (${st}). Consulte o status em instantes.` : (resp.mensagem ?? "Erro ao enviar.") }, r.ok ? 200 : 400);
    }

    if (acao === "consultar" || acao === "cancelar") {
      const ref = String(body.referencia ?? "");
      if (!ref) return json({ error: "Referência ausente." }, 400);
      let r: Response;
      if (acao === "cancelar") {
        if (String(body.justificativa ?? "").length < 15) return json({ error: "Justificativa precisa de 15+ caracteres." }, 400);
        r = await fetch(`${base}/v2/nfce/${ref}`, { method: "DELETE", headers: hdr, body: JSON.stringify({ justificativa: body.justificativa }) });
      } else r = await fetch(`${base}/v2/nfce/${ref}`, { headers: hdr });
      const resp = await r.json().catch(() => ({}));
      const mapa: Record<string, string> = { autorizado: "autorizada", cancelado: "cancelada", erro_autorizacao: "rejeitada", processando_autorizacao: "processando", rejeitado: "rejeitada" };
      const st = mapa[resp.status] ?? (r.ok ? "processando" : "erro");
      await db.from("pdv_notas").update({
        status: st, resposta: resp, mensagem: resp.mensagem ?? resp.mensagem_sefaz ?? null, numero: resp.numero ? Number(resp.numero) : null,
        serie: resp.serie ? Number(resp.serie) : null, chave: resp.chave_nfe ?? null, protocolo: resp.protocolo ?? null,
        danfe_url: resp.caminho_danfe ? (resp.caminho_danfe.startsWith("http") ? resp.caminho_danfe : base + resp.caminho_danfe) : null,
        xml_url: resp.caminho_xml_nota_fiscal ? (resp.caminho_xml_nota_fiscal.startsWith("http") ? resp.caminho_xml_nota_fiscal : base + resp.caminho_xml_nota_fiscal) : null,
        atualizado_em: new Date().toISOString(),
      }).eq("referencia", ref);
      return json({ mensagem: `Status: ${st}${resp.mensagem ? " — " + resp.mensagem : ""}` });
    }
    return json({ error: "Ação inválida." }, 400);
  } catch (e) {
    return json({ error: "Erro interno: " + (e as Error).message }, 500);
  }
});
