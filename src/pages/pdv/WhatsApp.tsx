import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Vazio, btnCls, btnSecCls, cartaoCls, chipCls, inputCls } from '../../components/Estado'
import { useAoVivo } from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'
import { mascaraTel, soDigitos } from './CheckinRapido'

interface Conv { telefone: string; nome: string | null; humano: boolean; nao_lidas: number; ultima_em: string; estado: string }
interface Msg { id: string; telefone: string; direcao: 'in' | 'out'; texto: string; status: string; origem: string; erro: string | null; criado_em: string }
interface Cfg { bot_ativo: boolean; link_base: string; boas_vindas: string; texto_info: string; agente_ping: string | null; agente_numero: string | null; agente_qr: string | null; agente_status: string }

export function WhatsApp() {
  const { pode } = usePermissoes()
  const gerir = pode('pdv_gerir')
  const [aba, setAba] = useState<'conversas' | 'bot' | 'conexao'>('conversas')
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [convs, setConvs] = useState<Conv[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [novoTel, setNovoTel] = useState('')
  const [busca, setBusca] = useState('')
  const fim = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    const [c, v, m] = await Promise.all([
      gerir ? db.from('wa_config').select('*').eq('id', 1).single() : Promise.resolve({ data: null }),
      db.from('wa_conversas').select('*').order('ultima_em', { ascending: false }).limit(200),
      sel ? db.from('wa_mensagens').select('*').eq('telefone', sel).order('criado_em').limit(300) : Promise.resolve({ data: [] }),
    ])
    setCfg(c.data as Cfg | null); setConvs((v.data ?? []) as Conv[]); setMsgs((m.data ?? []) as Msg[])
  }, [gerir, sel])
  useAoVivo(['wa_mensagens', 'wa_conversas', 'wa_config'], carregar)
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [msgs.length, sel])
  useEffect(() => { if (sel) db.from('wa_conversas').update({ nao_lidas: 0 }).eq('telefone', sel).then(() => undefined) }, [sel, msgs.length])

  async function enviar(t: string, tel = sel) {
    if (!tel || !t.trim()) return
    await db.from('wa_mensagens').insert({ telefone: tel, direcao: 'out', texto: t.trim(), status: 'pendente', origem: 'humano' })
    await db.from('wa_conversas').upsert({ telefone: tel, humano: true, ultima_em: new Date().toISOString() }, { onConflict: 'telefone' })
    setTexto(''); carregar()
  }
  const base = (cfg?.link_base ?? window.location.origin).replace(/\/$/, '')
  const online = !!cfg?.agente_ping && Date.now() - new Date(cfg.agente_ping).getTime() < 90_000 && cfg.agente_status === 'conectado'
  const atual = convs.find((c) => c.telefone === sel)
  const lista = convs.filter((c) => !busca || (c.nome ?? '').toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(soDigitos(busca)))

  if (gerir && !cfg) return <Carregando />
  return (
    <div>
      <Cabecalho titulo="WhatsApp" subtitulo="Atendimento, bot de reservas e envio de cardápio"
        acoes={gerir ? <span className={`rounded-full px-3 py-1 text-sm ${online ? 'bg-emerald-100 text-emerald-800' : 'bg-alert-soft text-alert'}`}>{online ? `Conectado ${cfg?.agente_numero ?? ''}` : 'Agente offline'}</span> : undefined} />
      <div className="mb-4 flex gap-2">
        <button className={chipCls(aba === 'conversas')} onClick={() => setAba('conversas')}>Conversas</button>
        {gerir && <button className={chipCls(aba === 'bot')} onClick={() => setAba('bot')}>Bot</button>}
        {gerir && <button className={chipCls(aba === 'conexao')} onClick={() => setAba('conexao')}>Conexão</button>}
      </div>

      {aba === 'conversas' && (
        <div className="grid gap-4 md:grid-cols-[320px_1fr]">
          <section className={`${cartaoCls} space-y-2 p-3`}>
            <input className={inputCls} placeholder="Buscar nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <div className="flex gap-2"><input className={inputCls} inputMode="tel" placeholder="Nova conversa: telefone" value={novoTel} onChange={(e) => setNovoTel(mascaraTel(e.target.value))} />
              <button className={btnSecCls} onClick={() => { const d = soDigitos(novoTel); if (d.length >= 10) { setSel('55' + d.slice(-11)); setNovoTel('') } }}>Abrir</button></div>
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {!lista.length && <Vazio texto="Nenhuma conversa ainda." />}
              {lista.map((c) => (
                <button key={c.telefone} onClick={() => setSel(c.telefone)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${sel === c.telefone ? 'border-brand bg-brand-soft' : 'border-line'}`}>
                  <span><b className="block text-sm">{c.nome || mascaraTel(c.telefone)}</b><span className="text-xs text-ink-soft">{c.humano ? '👤 atendimento humano' : '🤖 bot'} · {new Date(c.ultima_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></span>
                  {c.nao_lidas > 0 && <span className="rounded-full bg-brand px-2 text-xs text-white">{c.nao_lidas}</span>}
                </button>
              ))}
            </div>
          </section>
          <section className={`${cartaoCls} flex min-h-[60vh] flex-col p-3`}>
            {!sel ? <Vazio texto="Selecione uma conversa." /> : (
              <>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <b>{atual?.nome || mascaraTel(sel)}</b>
                  <div className="flex flex-wrap gap-2">
                    <button className={btnSecCls + ' !min-h-[36px]'} onClick={() => enviar(`Nosso cardápio digital: ${base}/cardapio 🍽️`)}>Enviar cardápio</button>
                    <button className={btnSecCls + ' !min-h-[36px]'} onClick={() => enviar(`Reserve sua mesa por aqui: ${base}/reservar 📅`)}>Enviar link de reserva</button>
                    <button className={btnSecCls + ' !min-h-[36px]'} onClick={async () => { await db.from('wa_conversas').upsert({ telefone: sel, humano: !atual?.humano, estado: 'menu' }, { onConflict: 'telefone' }); carregar() }}>{atual?.humano ? 'Devolver ao bot' : 'Assumir atendimento'}</button>
                  </div>
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto rounded-lg bg-bg p-2">
                  {msgs.map((m) => (
                    <div key={m.id} className={`flex ${m.direcao === 'out' ? 'justify-end' : ''}`}>
                      <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-sm ${m.direcao === 'out' ? 'bg-emerald-100' : 'bg-surface ring-1 ring-line'}`}>
                        {m.texto}
                        <div className="mt-0.5 text-[10px] text-ink-soft">{m.origem} · {new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{m.direcao === 'out' ? ` · ${m.status}` : ''}{m.erro ? ` · ${m.erro}` : ''}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={fim} />
                </div>
                <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); enviar(texto) }}>
                  <input className={inputCls} placeholder="Digite uma mensagem…" value={texto} onChange={(e) => setTexto(e.target.value)} />
                  <button className={btnCls}>Enviar</button>
                </form>
                {gerir && !online && <p className="mt-1 text-xs text-alert">Agente offline: as mensagens ficam na fila e saem quando o agente conectar.</p>}
              </>
            )}
          </section>
        </div>
      )}

      {aba === 'bot' && cfg && <BotConfig cfg={cfg} recarregar={carregar} />}
      {aba === 'conexao' && cfg && <Conexao cfg={cfg} online={online} />}
    </div>
  )
}

function BotConfig({ cfg, recarregar }: { cfg: Cfg; recarregar: () => void }) {
  const [c, setC] = useState(cfg); const [msg, setMsg] = useState('')
  return (
    <section className={`${cartaoCls} space-y-3 p-4`}>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={c.bot_ativo} onChange={(e) => setC({ ...c, bot_ativo: e.target.checked })} />Bot ativo (responde automaticamente quando não há atendimento humano)</label>
      <label className="block text-sm">Endereço do site (links enviados ao cliente)<input className={inputCls} value={c.link_base} onChange={(e) => setC({ ...c, link_base: e.target.value })} /></label>
      <label className="block text-sm">Mensagem de boas-vindas<textarea className={inputCls} rows={3} value={c.boas_vindas} onChange={(e) => setC({ ...c, boas_vindas: e.target.value })} /></label>
      <label className="block text-sm">Texto da opção “Horários e endereço”<textarea className={inputCls} rows={3} value={c.texto_info} onChange={(e) => setC({ ...c, texto_info: e.target.value })} /></label>
      <div className="rounded-lg bg-bg p-3 text-sm text-ink-soft">Menu do bot: <b>1</b> Cardápio · <b>2</b> Fazer reserva (pergunta pessoas, data, horário, nome — usa a mesma agenda do sistema) · <b>3</b> Horários e endereço · <b>0</b> Falar com a equipe.</div>
      <button className={btnCls} onClick={async () => { const { error } = await db.from('wa_config').update({ bot_ativo: c.bot_ativo, link_base: c.link_base.trim(), boas_vindas: c.boas_vindas, texto_info: c.texto_info }).eq('id', 1); setMsg(error ? error.message : 'Salvo.'); recarregar() }}>Salvar</button>
      {msg && <span className="ml-2 text-sm text-brand">{msg}</span>}
    </section>
  )
}

function Conexao({ cfg, online }: { cfg: Cfg; online: boolean }) {
  const [img, setImg] = useState('')
  useEffect(() => { if (cfg.agente_qr && cfg.agente_status === 'aguardando_qr') QRCode.toDataURL(cfg.agente_qr, { width: 280, margin: 1 }).then(setImg); else setImg('') }, [cfg.agente_qr, cfg.agente_status])
  return (
    <section className={`${cartaoCls} space-y-3 p-4 text-sm`}>
      <p>Status: <b>{online ? 'conectado' : cfg.agente_status}</b>{cfg.agente_numero ? ` · ${cfg.agente_numero}` : ''}</p>
      {img && <div><img src={img} alt="QR Code do WhatsApp" className="rounded-lg border border-line" /><p className="mt-1 text-ink-soft">No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho → escaneie.</p></div>}
      <ol className="list-decimal space-y-1 pl-5 text-ink-soft">
        <li>Em <b>Configurações do tablet/PDV</b>, crie um dispositivo do tipo “agente de WhatsApp” e copie o token.</li>
        <li>No computador do restaurante, siga o passo a passo da pasta <code>agente-whatsapp/LEIA-ME.md</code> e inicie o agente com o token.</li>
        <li>O QR Code aparece aqui; escaneie com o WhatsApp do restaurante. Pronto: o agente fica online.</li>
      </ol>
      <p className="rounded-lg bg-amber-50 p-3 text-amber-900">Atenção: o WhatsApp Web automatizado não é oficial e há risco de bloqueio do número se houver envio em massa. Para campanhas grandes, prefira a API oficial do WhatsApp Business.</p>
    </section>
  )
}
