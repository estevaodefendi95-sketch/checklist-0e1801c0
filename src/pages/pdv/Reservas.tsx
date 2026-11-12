import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, chipCls, inputCls } from '../../components/Estado'
import { lerNumero } from '../../lib/formato'
import { Faixa, Mesa, useAoVivo } from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'
import { Modal } from './PdvCaixa'
import { CheckinModal, mascaraTel, soDigitos } from './CheckinRapido'
import { HorarioCampos } from './ConfigCardapio'

interface Res { id: string; nome: string; telefone: string; pessoas: number; data: string; hora: string; duracao_min: number; mesa_id: string | null; status: string; origem: string; ocasiao: string | null; observacao: string | null; comanda_id: string | null }
interface Cfg { ativo_online: boolean; confirmacao_automatica: boolean; duracao_min: number; intervalo_min: number; capacidade_pessoas: number; max_pessoas: number; antecedencia_horas: number; dias_futuro: number; horarios: Faixa[] }
const ST: Record<string, { r: string; cor: string }> = {
  pendente: { r: 'Pendente', cor: 'bg-amber-100 text-amber-800' }, confirmada: { r: 'Confirmada', cor: 'bg-emerald-100 text-emerald-800' }, sentada: { r: 'Na casa', cor: 'bg-sky-100 text-sky-800' },
  concluida: { r: 'Concluída', cor: 'bg-surface text-ink-soft ring-1 ring-line' }, cancelada: { r: 'Cancelada', cor: 'bg-surface text-ink-soft line-through ring-1 ring-line' }, nao_compareceu: { r: 'Não veio', cor: 'bg-alert-soft text-alert' },
}
const ATIVAS = ['pendente', 'confirmada', 'sentada']
const iso = (d: Date) => d.toLocaleDateString('en-CA')
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function Reservas() {
  const { pode } = usePermissoes()
  const [aba, setAba] = useState<'agenda' | 'config'>('agenda')
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [dia, setDia] = useState(iso(new Date()))
  const [lista, setLista] = useState<Res[] | null>(null)
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [bloq, setBloq] = useState<Set<string>>(new Set())
  const [filtro, setFiltro] = useState('ativas')
  const [ed, setEd] = useState<Partial<Res> | null>(null)
  const [sentar, setSentar] = useState<Res | null>(null)
  const nav = useNavigate()

  const carregar = useCallback(async () => {
    const ini = iso(new Date(mes.getFullYear(), mes.getMonth(), 1)), fim = iso(new Date(mes.getFullYear(), mes.getMonth() + 1, 0))
    const [r, m, c, b] = await Promise.all([
      db.from('reservas').select('*').gte('data', ini).lte('data', fim).order('hora'),
      db.from('pdv_mesas').select('*').eq('ativo', true).order('numero'),
      db.from('reservas_config').select('*').eq('id', 1).single(),
      db.from('reservas_bloqueios').select('data'),
    ])
    setLista((r.data ?? []) as Res[]); setMesas((m.data ?? []) as Mesa[]); setCfg(c.data as Cfg); setBloq(new Set(((b.data ?? []) as { data: string }[]).map((x) => x.data)))
  }, [mes])
  useAoVivo(['reservas'], carregar)

  const porDia = useMemo(() => {
    const m = new Map<string, { n: number; pessoas: number; pend: number }>()
    ;(lista ?? []).filter((r) => ATIVAS.includes(r.status)).forEach((r) => { const x = m.get(r.data) ?? { n: 0, pessoas: 0, pend: 0 }; x.n++; x.pessoas += r.pessoas; if (r.status === 'pendente') x.pend++; m.set(r.data, x) })
    return m
  }, [lista])
  const doDia = useMemo(() => (lista ?? []).filter((r) => r.data === dia && (filtro === 'todas' || (filtro === 'ativas' ? ATIVAS.includes(r.status) : r.status === filtro))), [lista, dia, filtro])
  const celulas = useMemo(() => {
    const pri = mes.getDay(), n = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
    return [...Array(pri).fill(null), ...Array.from({ length: n }, (_, i) => iso(new Date(mes.getFullYear(), mes.getMonth(), i + 1)))] as (string | null)[]
  }, [mes])

  async function mudar(r: Res, status: string) {
    await db.from('reservas').update({ status, atualizado_em: new Date().toISOString() }).eq('id', r.id); carregar()
  }
  const wa = (r: Res, txt: string) => window.open(`https://wa.me/55${soDigitos(r.telefone).slice(-11)}?text=${encodeURIComponent(txt)}`, '_blank')
  const msgConf = (r: Res) => `Olá ${r.nome.split(' ')[0]}! Sua reserva no Paggio está confirmada: ${new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} às ${r.hora.slice(0, 5)}, ${r.pessoas} pessoa(s). Qualquer mudança é só avisar por aqui. Até lá! 🍽️`

  if (!lista || !cfg) return <Carregando />
  const tot = doDia.filter((r) => ATIVAS.includes(r.status)).reduce((s, r) => s + r.pessoas, 0)
  const grupos = [...new Set(doDia.map((r) => r.hora.slice(0, 5)))]
  return (
    <div>
      <Cabecalho titulo="Reservas" subtitulo="Calendário, confirmações e check-in a partir da reserva"
        acoes={<button className={btnCls} onClick={() => setEd({ data: dia, hora: '20:00', pessoas: 2, status: 'confirmada' })}>Nova reserva</button>} />
      <div className="mb-4 flex gap-2">
        <button className={chipCls(aba === 'agenda')} onClick={() => setAba('agenda')}>Agenda</button>
        {pode('pdv_gerir') && <button className={chipCls(aba === 'config')} onClick={() => setAba('config')}>Configurações</button>}
      </div>
      {aba === 'config' && pode('pdv_gerir') ? <Config cfg={cfg} bloq={bloq} recarregar={carregar} /> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
          <section className={`${cartaoCls} p-3`}>
            <div className="mb-2 flex items-center justify-between">
              <button className={btnSecCls + ' !min-h-[36px] !px-3'} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button>
              <b className="capitalize">{MESES[mes.getMonth()]} {mes.getFullYear()}</b>
              <button className={btnSecCls + ' !min-h-[36px] !px-3'} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-soft">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {celulas.map((d, i) => {
                if (!d) return <span key={i} />
                const x = porDia.get(d), lot = x ? x.pessoas / cfg.capacidade_pessoas : 0
                return (
                  <button key={d} onClick={() => setDia(d)} className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border text-sm ${d === dia ? 'border-brand bg-brand-soft font-semibold' : 'border-line'} ${bloq.has(d) ? 'opacity-40' : ''} ${d === iso(new Date()) ? 'ring-1 ring-brand' : ''}`}>
                    {Number(d.slice(8))}
                    {x && <span className={`text-[10px] leading-none ${lot > 1.5 ? 'text-alert' : 'text-ink-soft'}`}>{x.pessoas}p</span>}
                    {x?.pend ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" /> : null}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-ink-soft">Números = pessoas reservadas no dia. Ponto laranja = há reserva pendente.</p>
          </section>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</h2>
              <span className="text-sm text-ink-soft">{doDia.filter((r) => ATIVAS.includes(r.status)).length} reserva(s) · {tot} pessoa(s){bloq.has(dia) ? ' · DIA BLOQUEADO' : ''}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto">
              {[['ativas', 'Ativas'], ['pendente', 'Pendentes'], ['sentada', 'Na casa'], ['cancelada', 'Canceladas'], ['nao_compareceu', 'Não vieram'], ['todas', 'Todas']].map(([v, r]) => <button key={v} className={chipCls(filtro === v)} onClick={() => setFiltro(v)}>{r}</button>)}
            </div>
            {!doDia.length ? <Vazio texto="Nenhuma reserva neste dia." /> : grupos.map((h) => (
              <div key={h}>
                <div className="mb-1 text-sm font-semibold text-ink-soft">{h}</div>
                <div className="space-y-2">
                  {doDia.filter((r) => r.hora.slice(0, 5) === h).map((r) => (
                    <div key={r.id} className={`${cartaoCls} space-y-2 p-3`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><b>{r.nome}</b> · {r.pessoas} pessoa(s){r.mesa_id ? ` · mesa ${mesas.find((m) => m.id === r.mesa_id)?.numero ?? ''}` : ''}
                          <div className="text-xs text-ink-soft">{mascaraTel(r.telefone)} · via {r.origem}{r.ocasiao ? ` · 🎉 ${r.ocasiao}` : ''}{r.observacao ? ` · ${r.observacao}` : ''}</div></div>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${ST[r.status]?.cor}`}>{ST[r.status]?.r}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {r.status === 'pendente' && <button className={btnCls + ' !min-h-[38px]'} onClick={async () => { await mudar(r, 'confirmada'); wa(r, msgConf(r)) }}>Confirmar</button>}
                        {['pendente', 'confirmada'].includes(r.status) && <button className={btnCls + ' !min-h-[38px]'} onClick={() => setSentar(r)}>Check-in</button>}
                        {r.status === 'sentada' && r.comanda_id && <button className={btnSecCls + ' !min-h-[38px]'} onClick={() => nav(`/pdv/comanda/${r.comanda_id}`)}>Abrir comanda</button>}
                        {['pendente', 'confirmada'].includes(r.status) && <button className={btnSecCls + ' !min-h-[38px]'} onClick={() => wa(r, msgConf(r))}>WhatsApp</button>}
                        <button className={btnSecCls + ' !min-h-[38px]'} onClick={() => setEd(r)}>Editar</button>
                        {['pendente', 'confirmada'].includes(r.status) && <button className={btnPerigoCls + ' !min-h-[38px]'} onClick={() => mudar(r, 'nao_compareceu')}>Não veio</button>}
                        {['pendente', 'confirmada'].includes(r.status) && <button className={btnPerigoCls + ' !min-h-[38px]'} onClick={() => window.confirm('Cancelar esta reserva?') && mudar(r, 'cancelada')}>Cancelar</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
      {ed && <Form r={ed} mesas={mesas} fechar={() => setEd(null)} salvo={() => { setEd(null); carregar() }} />}
      {sentar && (
        <CheckinModal mesas={mesas} mesaInicial={mesas.find((m) => m.id === sentar.mesa_id) ?? null} nomeInicial={sentar.nome} telInicial={sentar.telefone} onClose={() => setSentar(null)}
          onAberta={async (cid) => { await db.from('reservas').update({ status: 'sentada', comanda_id: cid, atualizado_em: new Date().toISOString() }).eq('id', sentar.id); setSentar(null); nav(`/pdv/comanda/${cid}`) }} />
      )}
    </div>
  )
}

function Form({ r, mesas, fechar, salvo }: { r: Partial<Res>; mesas: Mesa[]; fechar: () => void; salvo: () => void }) {
  const [f, setF] = useState({ nome: r.nome ?? '', telefone: mascaraTel(r.telefone ?? ''), pessoas: String(r.pessoas ?? 2), data: r.data ?? iso(new Date()), hora: (r.hora ?? '20:00').slice(0, 5), mesa_id: r.mesa_id ?? '', ocasiao: r.ocasiao ?? '', observacao: r.observacao ?? '' })
  const [slots, setSlots] = useState<{ hora: string; livre: boolean; restante: number }[]>([])
  const [forcar, setForcar] = useState(false)
  const [erro, setErro] = useState('')
  const pessoas = Math.max(1, Math.floor(lerNumero(f.pessoas) ?? 1))
  useEffect(() => { db.rpc('reservas_slots', { p_data: f.data, p_pessoas: pessoas }).then(({ data }: { data: typeof slots | null }) => setSlots(data ?? [])) }, [f.data, pessoas])
  async function salvar() {
    setErro('')
    if (!f.nome.trim()) return setErro('Informe o nome.')
    if (soDigitos(f.telefone).length < 10) return setErro('Informe o telefone com DDD.')
    if (r.id) {
      const { error } = await db.from('reservas').update({ nome: f.nome.trim(), telefone: soDigitos(f.telefone).slice(-11), pessoas, data: f.data, hora: f.hora, mesa_id: f.mesa_id || null, ocasiao: f.ocasiao || null, observacao: f.observacao || null, atualizado_em: new Date().toISOString() }).eq('id', r.id)
      return error ? setErro(error.message) : salvo()
    }
    const { error } = await db.rpc('reserva_criar', { p_nome: f.nome, p_telefone: f.telefone, p_pessoas: pessoas, p_data: f.data, p_hora: f.hora, p_origem: 'sistema', p_ocasiao: f.ocasiao, p_obs: f.observacao, p_mesa: f.mesa_id || null, p_forcar: forcar })
    if (error) return setErro(error.message + (error.message.includes('disponível') ? ' (marque "forçar horário" para ignorar a lotação).' : ''))
    salvo()
  }
  return (
    <Modal titulo={r.id ? 'Editar reserva' : 'Nova reserva'} fechar={fechar}>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">Telefone *<input className={inputCls} inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: mascaraTel(e.target.value) })} /></label>
        <label className="text-sm">Nome *<input className={inputCls} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
        <label className="text-sm">Pessoas<input className={inputCls} inputMode="numeric" value={f.pessoas} onChange={(e) => setF({ ...f, pessoas: e.target.value })} /></label>
        <label className="text-sm">Data<input type="date" className={inputCls} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
      </div>
      <div>
        <div className="mb-1 text-sm">Horário</div>
        <div className="flex flex-wrap gap-1.5">
          {slots.map((s) => <button key={s.hora} type="button" disabled={!s.livre && !forcar} className={chipCls(f.hora === s.hora) + (!s.livre ? ' line-through opacity-50' : '')} onClick={() => setF({ ...f, hora: s.hora })}>{s.hora}</button>)}
          <input type="time" className={inputCls + ' !w-28 !min-h-[40px]'} value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />
        </div>
        {!slots.length && <p className="mt-1 text-xs text-ink-soft">Sem horários configurados/livres neste dia — use o campo de hora e marque “forçar”.</p>}
      </div>
      <label className="text-sm">Mesa (opcional)<select className={inputCls} value={f.mesa_id} onChange={(e) => setF({ ...f, mesa_id: e.target.value })}><option value="">A definir</option>{mesas.map((m) => <option key={m.id} value={m.id}>Mesa {m.numero} · {m.capacidade} lug.</option>)}</select></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">Ocasião<input className={inputCls} placeholder="Aniversário…" value={f.ocasiao} onChange={(e) => setF({ ...f, ocasiao: e.target.value })} /></label>
        <label className="text-sm">Observação<input className={inputCls} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></label>
      </div>
      {!r.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={forcar} onChange={(e) => setForcar(e.target.checked)} />Forçar horário (ignorar lotação e janela de horários)</label>}
      {erro && <p className="rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">{erro}</p>}
      <button className={btnCls} onClick={salvar}>Salvar reserva</button>
    </Modal>
  )
}

function Config({ cfg, bloq, recarregar }: { cfg: Cfg; bloq: Set<string>; recarregar: () => void }) {
  const [c, setC] = useState(cfg)
  const [msg, setMsg] = useState('')
  const [novo, setNovo] = useState(''); const [mot, setMot] = useState('')
  const num = (k: keyof Cfg, r: string) => <label className="text-sm">{r}<input className={inputCls} inputMode="numeric" defaultValue={String(c[k])} onChange={(e) => setC({ ...c, [k]: lerNumero(e.target.value) ?? 0 })} /></label>
  async function salvar() {
    const { error } = await db.from('reservas_config').update({ ...c, horarios: c.horarios ?? [] }).eq('id', 1)
    setMsg(error ? error.message : 'Configurações salvas.'); recarregar()
  }
  const base = window.location.origin
  return (
    <div className="space-y-4">
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <h3 className="font-semibold">Regras</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {num('capacidade_pessoas', 'Capacidade simultânea (pessoas)')}{num('duracao_min', 'Duração da reserva (min)')}{num('intervalo_min', 'Intervalo entre horários (15/30/60)')}
          {num('max_pessoas', 'Máx. pessoas online')}{num('antecedencia_horas', 'Antecedência mínima (horas)')}{num('dias_futuro', 'Aceitar até (dias à frente)')}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.ativo_online} onChange={(e) => setC({ ...c, ativo_online: e.target.checked })} />Aceitar reservas online (site e WhatsApp)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={c.confirmacao_automatica} onChange={(e) => setC({ ...c, confirmacao_automatica: e.target.checked })} />Confirmar automaticamente (desmarque para aprovar uma a uma)</label>
        <div><div className="mb-1 text-sm font-medium">Horários em que aceita reservas (horário de chegada)</div><HorarioCampos v={c.horarios} onChange={(h) => setC({ ...c, horarios: h ?? [] })} /></div>
        <button className={btnCls} onClick={salvar}>Salvar</button>{msg && <span className="ml-2 text-sm text-brand">{msg}</span>}
      </section>
      <section className={`${cartaoCls} space-y-2 p-4`}>
        <h3 className="font-semibold">Dias bloqueados (feriado, evento fechado)</h3>
        <div className="flex flex-wrap gap-2"><input type="date" className={inputCls + ' !w-44'} value={novo} onChange={(e) => setNovo(e.target.value)} /><input className={inputCls + ' !w-56'} placeholder="Motivo" value={mot} onChange={(e) => setMot(e.target.value)} />
          <button className={btnSecCls} onClick={async () => { if (novo) { await db.from('reservas_bloqueios').insert({ data: novo, motivo: mot || null }); setNovo(''); setMot(''); recarregar() } }}>Bloquear dia</button></div>
        <div className="flex flex-wrap gap-2">{[...bloq].sort().map((d) => <button key={d} className="rounded-full bg-alert-soft px-3 py-1 text-sm text-alert" onClick={async () => { await db.from('reservas_bloqueios').delete().eq('data', d); recarregar() }}>{new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')} ✕</button>)}</div>
      </section>
      <section className={`${cartaoCls} space-y-1 p-4 text-sm`}>
        <h3 className="font-semibold">Links públicos</h3>
        <p>Reservas: <code>{base}/reservar</code> <button className="text-brand" onClick={() => navigator.clipboard?.writeText(`${base}/reservar`)}>copiar</button></p>
        <p>Cardápio digital: <code>{base}/cardapio</code> <button className="text-brand" onClick={() => navigator.clipboard?.writeText(`${base}/cardapio`)}>copiar</button></p>
        <p className="text-xs text-ink-soft">Use no Instagram, Google Meu Negócio e na bio do WhatsApp. O bot do WhatsApp envia esses mesmos links.</p>
      </section>
    </div>
  )
}
