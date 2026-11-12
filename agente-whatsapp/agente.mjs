// Agente de WhatsApp do Paggio. Node 18+. Usa o WhatsApp Web (whatsapp-web.js) no computador da casa.
// Recebe mensagens dos clientes -> função wa-bot (bot de reservas/cardápio) -> responde pelo mesmo número.
// Também envia as mensagens que a equipe/CRM enfileirar no sistema.
import pkg from 'whatsapp-web.js'
const { Client, LocalAuth } = pkg

const URL_FN = process.env.WA_FUNCAO_URL // https://<projeto>.supabase.co/functions/v1/wa-bot
const ANON = process.env.WA_ANON_KEY // chave publishable/anon do projeto
const TOKEN = process.env.WA_TOKEN_AGENTE // token do dispositivo "agente_whatsapp"
if (!URL_FN || !ANON || !TOKEN) {
  console.error('Defina WA_FUNCAO_URL, WA_ANON_KEY e WA_TOKEN_AGENTE (veja o LEIA-ME).')
  process.exit(1)
}

async function api(acao, corpo = {}) {
  const r = await fetch(URL_FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` }, body: JSON.stringify({ token: TOKEN, acao, ...corpo }) })
  if (!r.ok) throw new Error(`wa-bot ${r.status}`)
  return r.json()
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const pausa = () => espera(1200 + Math.random() * 1800) // ritmo humano: evita bloqueio por disparo em rajada

let status = 'iniciando', qr = null, numero = null
const client = new Client({ authStrategy: new LocalAuth({ dataPath: './sessao' }), puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] } })
client.on('qr', (q) => { qr = q; status = 'aguardando_qr'; console.log('QR atualizado: escaneie pelo painel (PDV > WhatsApp > Conexão).') })
client.on('ready', () => { qr = null; status = 'conectado'; numero = client.info?.wid?.user ?? null; console.log('WhatsApp conectado:', numero) })
client.on('disconnected', (m) => { status = 'desconectado'; console.log('Desconectado:', m); setTimeout(() => client.initialize().catch(console.error), 5000) })

client.on('message', async (msg) => {
  try {
    if (msg.fromMe || msg.from === 'status@broadcast' || msg.from.endsWith('@g.us') || msg.type !== 'chat') return
    const contato = await msg.getContact()
    const tel = contato.number || msg.from.replace(/@.*/, '')
    const r = await api('receber', { telefone: tel, nome: contato.pushname || contato.name || null, texto: msg.body })
    for (const x of r.respostas ?? []) {
      await pausa()
      try { await client.sendMessage(msg.from, x.texto); await api('ack', { id: x.id, ok: true }) }
      catch (e) { await api('ack', { id: x.id, ok: false, erro: String(e.message ?? e) }) }
    }
  } catch (e) { console.error('erro ao tratar mensagem:', e.message) }
})

async function enviarFila() {
  const r = await api('sync', { status, numero, qr })
  if (status !== 'conectado') return
  for (const m of r.mensagens ?? []) {
    try {
      const id = await client.getNumberId('55' + m.telefone)
      if (!id) throw new Error('número sem WhatsApp')
      await client.sendMessage(id._serialized, m.texto)
      await api('ack', { id: m.id, ok: true })
    } catch (e) { await api('ack', { id: m.id, ok: false, erro: String(e.message ?? e) }) }
    await pausa()
  }
}

client.initialize().catch((e) => { console.error(e); process.exit(1) })
for (;;) {
  try { await enviarFila() } catch (e) { console.error('sync:', e.message) }
  await espera(3000)
}
