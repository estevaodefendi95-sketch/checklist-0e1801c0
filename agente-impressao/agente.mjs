// Agente de impressão do Paggio PDV. Node 18+. Sem dependências.
// Lê a fila no Supabase (função pdv-print) e imprime em ESC/POS nas impressoras de rede (porta 9100).
import net from 'node:net'

const URL_FN = process.env.PDV_FUNCAO_URL // https://<projeto>.supabase.co/functions/v1/pdv-print
const ANON = process.env.PDV_ANON_KEY // chave pública (anon) do projeto
const TOKEN = process.env.PDV_TOKEN_AGENTE // token do dispositivo "agente de impressão"
const INTERVALO = Number(process.env.PDV_INTERVALO_MS ?? 2000)
if (!URL_FN || !ANON || !TOKEN) {
  console.error('Defina PDV_FUNCAO_URL, PDV_ANON_KEY e PDV_TOKEN_AGENTE (veja o LEIA-ME).')
  process.exit(1)
}

const CP860 = { 'ç': 0x87, 'Ç': 0x80, 'á': 0xa0, 'à': 0x85, 'â': 0x83, 'ã': 0x84, 'é': 0x82, 'ê': 0x88, 'í': 0xa1, 'ó': 0xa2, 'ô': 0x93, 'õ': 0x94, 'ú': 0xa3, 'Á': 0x86, 'À': 0x91, 'Â': 0x8f, 'Ã': 0x8e, 'É': 0x90, 'Ê': 0x89, 'Í': 0x8b, 'Ó': 0x9f, 'Ô': 0x8c, 'Õ': 0x99, 'Ú': 0x96, 'ü': 0x81, 'º': 0xa7, 'ª': 0xa6 }
const ESC = 0x1b, GS = 0x1d, LF = 0x0a

function codifica(txt, codepage) {
  const out = []
  for (const ch of String(txt)) {
    const c = ch.codePointAt(0)
    if (c < 128) out.push(c)
    else if (codepage === 'CP860' && CP860[ch] !== undefined) out.push(CP860[ch])
    else out.push(...Buffer.from(ch.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7f]/g, '?')))
  }
  return Buffer.from(out)
}

class Cupom {
  constructor(imp) { this.imp = imp; this.cols = imp.colunas || 48; this.b = [Buffer.from([ESC, 0x40])]; if (imp.codepage === 'CP860') this.b.push(Buffer.from([ESC, 0x74, 3])) }
  raw(...n) { this.b.push(Buffer.from(n)); return this }
  txt(t = '') { this.b.push(codifica(t, this.imp.codepage), Buffer.from([LF])); return this }
  centro(on) { return this.raw(ESC, 0x61, on ? 1 : 0) }
  negrito(on) { return this.raw(ESC, 0x45, on ? 1 : 0) }
  grande(on) { return this.raw(GS, 0x21, on ? 0x11 : 0) }
  linha(c = '-') { return this.txt(c.repeat(this.cols)) }
  par(esq, dir) { const e = String(esq), d = String(dir); const esp = Math.max(1, this.cols - e.length - d.length); return this.txt(e.slice(0, this.cols - d.length - 1) + ' '.repeat(esp) + d) }
  fim() { for (let i = 0; i < 4; i++) this.b.push(Buffer.from([LF])); if (this.imp.corta_papel) this.b.push(Buffer.from([GS, 0x56, 0x42, 0x00])); return Buffer.concat(this.b) }
}
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function monta(job) {
  const imp = job.impressora, c = job.conteudo, k = new Cupom(imp)
  if (job.tipo === 'teste') {
    k.centro(true).negrito(true).grande(true).txt('TESTE').grande(false).negrito(false).txt(imp.nome).txt(`Funcao: ${imp.funcao}`).txt(new Date().toLocaleString('pt-BR')).centro(false).txt('Acentuacao: ação, coração, é, ü, ç')
  } else if (job.tipo === 'pedido') {
    k.centro(true).negrito(true).grande(true).txt(imp.funcao.toUpperCase()).grande(false).txt(`MESA ${c.mesa ?? '-'}`).negrito(false).txt(`${c.hora ?? ''} (${c.origem ?? ''})`).centro(false).linha()
    k.negrito(true).grande(true).txt(`${c.qtd ?? 1}x ${c.nome}`).grande(false).negrito(false)
    if (c.obs) k.txt('OBS: ' + c.obs)
    k.linha()
  } else if (job.tipo === 'conta') {
    k.centro(true).negrito(true).txt('PRE-CONTA (sem valor fiscal)').negrito(false).txt(`Mesa ${c.mesa}  Comanda #${c.comanda}`).centro(false).linha()
    for (const i of c.itens ?? []) k.par(`${i.qtd}x ${i.nome}`, brl(i.qtd * i.preco))
    k.linha().par('Subtotal', brl(c.subtotal)).par(`Servico ${c.taxa_servico_pct}%`, brl(c.servico))
    if (c.desconto > 0) k.par('Desconto', '-' + brl(c.desconto))
    k.negrito(true).grande(true).par('TOTAL', brl(c.total)).grande(false).negrito(false)
    if (c.por_pessoa) k.txt(`${c.pessoas} pessoas: ${brl(c.por_pessoa)} cada`)
  } else if (job.tipo === 'fechamento_caixa') {
    k.centro(true).negrito(true).txt('FECHAMENTO DE CAIXA').negrito(false).centro(false).txt(c.caixa).linha()
    k.par('Fundo', brl(c.fundo)).par('Suprimentos', brl(c.suprimentos)).par('Sangrias', brl(c.sangrias)).linha()
    for (const [f, v] of Object.entries(c.esperado ?? {})) k.par(`Esperado ${f}`, brl(v)).par(`Contado ${f}`, brl((c.contado ?? {})[f] ?? 0))
    k.linha().negrito(true).par('Diferenca dinheiro', brl(c.diferenca_dinheiro)).par('Total vendido', brl(c.total_vendas)).negrito(false)
  } else if (job.tipo === 'cupom') {
    // 2ª via do cupom fiscal (NFC-e) — DANFE simplificado + QR Code de consulta
    k.centro(true).negrito(true).txt(c.emitente ?? '').negrito(false)
    if (c.cnpj) k.txt('CNPJ ' + c.cnpj)
    k.txt('DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletronica').txt(c.via2 ? '*** 2a VIA ***' : '').centro(false).linha()
    for (const i of c.itens ?? []) k.par(`${i.qtd}x ${i.nome}`, brl(i.qtd * i.preco))
    k.linha().negrito(true).par('TOTAL', brl(c.total)).negrito(false)
    for (const p of c.pagamentos ?? []) k.par(p.forma, brl(p.valor))
    k.linha().centro(true).txt(`NFC-e n ${c.numero ?? '-'}  Serie ${c.serie ?? '-'}`)
    if (c.chave) k.txt('Chave de acesso:').txt(String(c.chave).replace(/(\d{4})/g, '$1 ').trim())
    if (c.protocolo) k.txt('Protocolo: ' + c.protocolo)
    k.txt(c.consumidor ? 'Consumidor: ' + c.consumidor : 'CONSUMIDOR NAO IDENTIFICADO')
    if (c.qrcode) {
      const d = Buffer.from(String(c.qrcode)), n = d.length + 3
      k.raw(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0).raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 6).raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31)
      k.b.push(Buffer.from([GS, 0x28, 0x6b, n & 255, n >> 8, 0x31, 0x50, 0x30]), d)
      k.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30).txt('')
    }
    if (c.url_consulta) k.txt('Consulte em: ' + c.url_consulta)
    k.centro(false)
  } else {
    k.txt(JSON.stringify(c).slice(0, 400))
  }
  return k.fim()
}

function envia(ip, porta, buf) {
  return new Promise((ok, falha) => {
    const s = net.createConnection({ host: ip, port: porta, timeout: 5000 }, () => s.write(buf, () => s.end()))
    s.on('close', () => ok())
    s.on('timeout', () => { s.destroy(); falha(new Error('timeout ao conectar na impressora')) })
    s.on('error', falha)
  })
}

async function api(body) {
  const r = await fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` }, body: JSON.stringify({ token: TOKEN, ...body }) })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`)
  return r.json()
}

async function ciclo() {
  const { jobs } = await api({ acao: 'pull' })
  for (const j of jobs ?? []) {
    try {
      const buf = monta(j)
      const copias = 1 + (j.impressora.via_extra ?? 0)
      for (let i = 0; i < copias; i++) await envia(j.impressora.ip, j.impressora.porta, buf)
      await api({ acao: 'ack', id: j.id, ok: true })
      console.log(new Date().toLocaleTimeString(), 'impresso', j.tipo, '->', j.impressora.nome)
    } catch (e) {
      console.error('falha', j.impressora?.nome, e.message)
      await api({ acao: 'ack', id: j.id, ok: false, erro: e.message }).catch(() => {})
    }
  }
}

console.log('Agente de impressão Paggio ativo.')
for (;;) {
  try { await ciclo() } catch (e) { console.error('erro no ciclo:', e.message) }
  await new Promise((r) => setTimeout(r, INTERVALO))
}
