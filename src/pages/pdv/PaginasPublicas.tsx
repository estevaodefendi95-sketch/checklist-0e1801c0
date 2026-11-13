import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../integrations/supabase/client'
import { CardapioCliente, type CardCat, type CardProd, type CardTema } from '../../components/CardapioCliente'

async function chamar<T>(corpo: Record<string, unknown>): Promise<T & { erro?: string }> {
  const { data, error } = await supabase.functions.invoke('pdv-publico', { body: corpo })
  if (error) return { erro: 'Sem conexão. Tente de novo em instantes.' } as T & { erro?: string }
  return data
}

/** /cardapio — cardápio digital só para consulta (link enviado pelo WhatsApp, Instagram, etc.). */
export function CardapioPublico() {
  const [d, setD] = useState<{ tema: CardTema; boas_vindas: string | null; categorias: CardCat[]; produtos: CardProd[]; erro?: string } | null>(null)
  const [lateral, setLateral] = useState(() => window.innerWidth >= 768)
  useEffect(() => { chamar<NonNullable<typeof d>>({ acao: 'menu' }).then(setD) }, [])
  useEffect(() => { const f = () => setLateral(window.innerWidth >= 768); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  if (!d) return <p className="p-6 text-center">Carregando…</p>
  if (d.erro) return <p className="p-6 text-center">{d.erro}</p>
  return (
    <div className="mx-auto h-[100dvh] max-w-5xl">
      <CardapioCliente somenteLeitura tema={{ colunas: 2, ...d.tema }} boasVindas={d.boas_vindas} categorias={d.categorias} produtos={d.produtos} lateral={lateral} qtdDe={() => 0} onAdd={() => {}} onMenos={() => {}}
        acoes={<a href="/reservar" className="rounded-full border border-white/60 px-3 py-1.5 text-xs">Reservar mesa</a>} />
    </div>
  )
}

const OCASIOES = ['', 'Aniversário', 'Comemoração', 'Encontro de amigos', 'Negócios', 'Outra']
interface Slot { hora: string; livre: boolean; restante: number }
const hojeISO = () => new Date().toLocaleDateString('en-CA')

/** /reservar — reserva online: escolhe pessoas, dia e horário livre. */
export function ReservarPublico() {
  const [cfg, setCfg] = useState<{ tema: CardTema; ativo_online: boolean; max_pessoas: number; dias_futuro: number; confirmacao_automatica: boolean } | null>(null)
  const [pessoas, setPessoas] = useState(2)
  const [data, setData] = useState('')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [hora, setHora] = useState('')
  const [nome, setNome] = useState(''); const [tel, setTel] = useState(''); const [oc, setOc] = useState(''); const [obs, setObs] = useState('')
  const [erro, setErro] = useState(''); const [env, setEnv] = useState(false)
  const [ok, setOk] = useState<{ status: string } | null>(null)
  useEffect(() => { chamar<NonNullable<typeof cfg>>({ acao: 'config' }).then((c) => setCfg(c as typeof cfg)) }, [])
  useEffect(() => {
    if (!data) return
    let vivo = true
    chamar<{ slots: Slot[] }>({ acao: 'slots', data, pessoas }).then((r) => { if (vivo) { setSlots(r.slots ?? []); setHora((h) => (r.slots ?? []).some((s) => s.hora === h && s.livre) ? h : '') } })
    return () => { vivo = false }
  }, [data, pessoas])
  const max = useMemo(() => new Date(Date.now() + (cfg?.dias_futuro ?? 60) * 864e5).toLocaleDateString('en-CA'), [cfg])
  if (!cfg) return <p className="p-6 text-center">Carregando…</p>
  // falha de rede ou erro do servidor: a resposta vem sem o tema
  if (!cfg.tema) return <p className="p-6 text-center">{(cfg as { erro?: string }).erro ?? 'Sem conexão. Tente de novo em instantes.'}</p>
  const p = cfg.tema.primaria ?? '#7a1f2b', f = cfg.tema.fundo ?? '#faf7f2', t = cfg.tema.texto ?? '#222'
  const inp = 'w-full rounded-xl border border-black/15 bg-white p-3 text-base'

  async function enviar() {
    setErro('')
    if (!data || !hora) return setErro('Escolha o dia e o horário.')
    if (!nome.trim()) return setErro('Informe seu nome.')
    if (tel.replace(/\D/g, '').length < 10) return setErro('Informe seu telefone com DDD.')
    setEnv(true)
    const r = await chamar<{ ok?: boolean; status: string }>({ acao: 'reservar', nome, telefone: tel, pessoas, data, hora, ocasiao: oc, obs })
    setEnv(false)
    if (r.erro || !r.ok) return setErro(r.erro ?? 'Não foi possível reservar.')
    setOk({ status: r.status })
  }
  return (
    <div className="min-h-screen" style={{ background: f, color: t }}>
      <header className="px-5 py-6 text-white" style={{ background: p }}>
        <div className="mx-auto max-w-lg"><div className="text-xs uppercase tracking-[0.2em] opacity-80">Reservas</div><h1 className="text-2xl font-semibold">{cfg.tema.titulo || 'Paggio'}</h1></div>
      </header>
      <main className="mx-auto max-w-lg space-y-5 p-5">
        {ok ? (
          <div className="space-y-3 rounded-2xl bg-white p-6 text-center shadow">
            <div className="text-5xl">{ok.status === 'confirmada' ? '✅' : '📝'}</div>
            <h2 className="text-xl font-semibold">{ok.status === 'confirmada' ? 'Reserva confirmada!' : 'Pedido de reserva recebido'}</h2>
            <p>{new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às {hora} · {pessoas} pessoa(s)</p>
            {ok.status !== 'confirmada' && <p className="text-sm opacity-70">Nossa equipe confirma pelo WhatsApp em breve.</p>}
            <a href="/cardapio" className="inline-block rounded-xl px-5 py-3 font-semibold text-white" style={{ background: p }}>Ver o cardápio</a>
          </div>
        ) : !cfg.ativo_online ? (
          <p className="rounded-2xl bg-white p-6 text-center shadow">As reservas online estão indisponíveis no momento. Fale com a gente pelo WhatsApp.</p>
        ) : (
          <>
            <section className="space-y-2 rounded-2xl bg-white p-4 shadow">
              <h2 className="font-semibold">1. Quantas pessoas?</h2>
              <div className="flex items-center justify-center gap-5">
                <button className="h-12 w-12 rounded-full border text-2xl" onClick={() => setPessoas((n) => Math.max(1, n - 1))}>−</button>
                <b className="w-12 text-center text-3xl">{pessoas}</b>
                <button className="h-12 w-12 rounded-full text-2xl text-white" style={{ background: p }} onClick={() => setPessoas((n) => Math.min(cfg.max_pessoas, n + 1))}>+</button>
              </div>
              <p className="text-center text-xs opacity-60">Para mais de {cfg.max_pessoas} pessoas, fale com a gente.</p>
            </section>
            <section className="space-y-2 rounded-2xl bg-white p-4 shadow">
              <h2 className="font-semibold">2. Qual dia?</h2>
              <input type="date" className={inp} min={hojeISO()} max={max} value={data} onChange={(e) => setData(e.target.value)} />
              {data && slots && (
                slots.length === 0 ? <p className="text-sm opacity-70">Sem horários neste dia. Escolha outra data.</p> : (
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {slots.map((s) => (
                      <button key={s.hora} disabled={!s.livre} onClick={() => setHora(s.hora)} className={`rounded-xl border-2 py-2.5 text-sm font-semibold ${!s.livre ? 'border-black/10 text-black/30 line-through' : hora === s.hora ? 'text-white' : 'border-black/15'}`} style={hora === s.hora ? { background: p, borderColor: p } : undefined}>{s.hora}</button>
                    ))}
                  </div>
                )
              )}
            </section>
            <section className="space-y-3 rounded-2xl bg-white p-4 shadow">
              <h2 className="font-semibold">3. Seus dados</h2>
              <input className={inp} placeholder="Nome *" value={nome} onChange={(e) => setNome(e.target.value)} />
              <input className={inp} inputMode="tel" placeholder="Telefone (WhatsApp) *" value={tel} onChange={(e) => setTel(e.target.value)} />
              <select className={inp} value={oc} onChange={(e) => setOc(e.target.value)}>{OCASIOES.map((o) => <option key={o} value={o}>{o || 'Ocasião (opcional)'}</option>)}</select>
              <input className={inp} placeholder="Observação (opcional): cadeirão, alergia…" value={obs} onChange={(e) => setObs(e.target.value)} />
            </section>
            {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
            <button disabled={env} onClick={enviar} className="w-full rounded-xl py-4 text-lg font-semibold text-white disabled:opacity-50" style={{ background: p }}>Reservar mesa</button>
          </>
        )}
      </main>
    </div>
  )
}
