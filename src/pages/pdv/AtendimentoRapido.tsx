import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/supabase'
import { Carregando, Erro, inputCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { cacheGravar, cacheLer, erroDeRede } from '../../lib/offline'
import { Comanda, Mesa, Sala, Totais, minutosDesde, num, useAoVivo } from '../../lib/pdv'
import { useAuth } from '../../context/AuthContext'
import { CheckinModal } from './CheckinRapido'

type Filtro = 'todas' | 'livres' | 'ocupadas' | 'conta' | 'minhas'
const COR: Record<string, string> = {
  livre: 'border-line bg-surface text-ink',
  aberta: 'border-emerald-500 bg-emerald-100 text-emerald-900',
  pedindo_conta: 'border-red-500 bg-red-100 text-red-800',
}
const tempo = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`)

/** Atendimento rápido (celular / maquininha): mesas em botões grandes → toca → lança pedido → vê a conta. */
export function AtendimentoRapido() {
  const nav = useNavigate()
  const { session, profile } = useAuth()
  const eu = session?.user.id
  const [salas, setSalas] = useState<Sala[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [comandas, setComandas] = useState<Comanda[]>([])
  const [totais, setTotais] = useState<Record<string, Totais>>({})
  const [salaId, setSalaId] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const [novo, setNovo] = useState<Mesa | null>(null)
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)

  const carregar = useCallback(async () => {
    const [s, m, c, t] = await Promise.all([
      db.from('pdv_salas').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_mesas').select('*').eq('ativo', true).order('numero'),
      db.from('pdv_comandas').select('*').in('status', ['aberta', 'pedindo_conta']).order('aberta_em'),
      db.from('pdv_comanda_totais').select('*'),
    ])
    const e = s.error || m.error || c.error || t.error
    const mapa = (l: Totais[]) => Object.fromEntries(l.map((x) => [x.comanda_id, x]))
    if (e && erroDeRede(e)) {
      const ch = cacheLer<{ s: Sala[]; m: Mesa[]; c: Comanda[]; t: Record<string, Totais> }>('salao')
      if (ch) {
        setSalas(ch.v.s); setMesas(ch.v.m); setComandas(ch.v.c); setTotais(ch.v.t); setPronto(true)
        setAviso('Sem conexão: mostrando as mesas de ' + Math.max(1, Math.round((Date.now() - ch.t) / 60000)) + ' min atrás. Você ainda pode abrir a comanda e lançar pedidos.')
        return
      }
    }
    if (e) { setErro(e.message); setPronto(true); return }
    setErro(''); setAviso('')
    cacheGravar('salao', { s: s.data ?? [], m: m.data ?? [], c: c.data ?? [], t: mapa((t.data ?? []) as Totais[]) })
    setSalas((s.data ?? []) as Sala[]); setMesas((m.data ?? []) as Mesa[]); setComandas((c.data ?? []) as Comanda[]); setTotais(mapa((t.data ?? []) as Totais[]))
    setPronto(true)
  }, [])
  useAoVivo(['pdv_comandas', 'pdv_pedido_itens', 'pdv_mesas'], carregar)

  const porMesa = useMemo(() => new Map(comandas.filter((c) => c.mesa_id).map((c) => [c.mesa_id!, c])), [comandas])
  const semMesa = comandas.filter((c) => !c.mesa_id)
  const minha = (c?: Comanda) => !!c && !!eu && (c as Comanda & { aberta_por?: string }).aberta_por === eu
  const nMinhas = comandas.filter((c) => minha(c)).length
  const nConta = comandas.filter((c) => c.status === 'pedindo_conta').length
  const q = busca.trim().toLowerCase()

  const visiveis = useMemo(() => mesas.filter((m) => {
    if (salaId && m.sala_id !== salaId) return false
    if (q && !m.numero.toLowerCase().includes(q)) return false
    const c = porMesa.get(m.id)
    if (filtro === 'livres') return !c
    if (filtro === 'ocupadas') return !!c
    if (filtro === 'conta') return c?.status === 'pedindo_conta'
    if (filtro === 'minhas') return minha(c)
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [mesas, salaId, q, filtro, porMesa, eu])
  const semMesaVis = semMesa.filter((c) => filtro === 'todas' || filtro === 'ocupadas' || (filtro === 'conta' && c.status === 'pedindo_conta') || (filtro === 'minhas' && minha(c)))

  function tocar(m: Mesa) {
    const c = porMesa.get(m.id)
    if (c) nav(`/pdv/comanda/${c.id}`)
    else setNovo(m)
  }

  if (!pronto) return <Carregando />
  const chips: { v: Filtro; r: string; n?: number }[] = [
    { v: 'todas', r: 'Todas' }, { v: 'minhas', r: 'Minhas', n: nMinhas }, { v: 'conta', r: 'Pediram conta', n: nConta }, { v: 'livres', r: 'Livres' }, { v: 'ocupadas', r: 'Ocupadas', n: comandas.length },
  ]
  return (
    <div className="pb-24">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Mesas</h1>
        <span className="text-sm text-ink-soft">{profile?.nome?.split(' ')[0]} · {comandas.length} aberta(s)</span>
      </div>
      {erro && <Erro texto={erro} />}
      {aviso && <p className="mb-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">{aviso}</p>}
      <input className={inputCls + ' mb-2 !min-h-[52px] text-lg'} inputMode="numeric" enterKeyHint="go" placeholder="Nº da mesa…" value={busca} onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { const m = mesas.find((x) => x.numero.toLowerCase() === q); if (m) tocar(m) } }} />
      <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {chips.map((c) => (
          <button key={c.v} onClick={() => setFiltro(c.v)} className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium ${filtro === c.v ? 'bg-brand text-brand-ink' : 'border border-line bg-surface text-ink'}`}>
            {c.r}{c.n ? ` · ${c.n}` : ''}
          </button>
        ))}
      </div>
      {salas.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ id: '', nome: 'Todas as salas' }, ...salas].map((s) => (
            <button key={s.id} onClick={() => setSalaId(s.id)} className={`min-h-[38px] shrink-0 rounded-lg px-3 text-sm ${salaId === s.id ? 'bg-brand-soft font-semibold text-brand' : 'text-ink-soft'}`}>{s.nome}</button>
          ))}
        </div>
      )}

      {semMesaVis.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Sem mesa (balcão)</p>
          <div className="grid grid-cols-2 gap-2">
            {semMesaVis.map((c) => (
              <button key={c.id} onClick={() => nav(`/pdv/comanda/${c.id}`)} className={`min-h-[76px] rounded-2xl border-2 p-2 text-left active:scale-[0.98] ${COR[c.status]}`}>
                <b className="block truncate text-base">#{c.numero} {c.nome_cliente ?? ''}</b>
                <span className="block text-sm font-semibold">{reais(num(totais[c.id]?.total))}</span>
                <span className="text-xs opacity-80">{tempo(minutosDesde(c.aberta_em))}{c.status === 'pedindo_conta' ? ' · conta' : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!visiveis.length ? <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">Nenhuma mesa nesse filtro.</p> : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {visiveis.map((m) => {
            const c = porMesa.get(m.id)
            const st = c ? c.status : 'livre'
            return (
              <button key={m.id} onClick={() => tocar(m)} className={`flex min-h-[96px] flex-col justify-between rounded-2xl border-2 p-2 text-left active:scale-[0.97] ${COR[st]}`}>
                <span className="flex items-start justify-between">
                  <b className="text-2xl leading-none">{m.numero}</b>
                  {c && minha(c) && <span className="rounded-full bg-black/10 px-1.5 text-[10px] font-semibold">minha</span>}
                </span>
                {c ? (
                  <span>
                    <span className="block text-base font-bold leading-tight">{reais(num(totais[c.id]?.total))}</span>
                    <span className="block text-[11px] opacity-80">{c.pessoas} pes. · {tempo(minutosDesde(c.aberta_em))}{st === 'pedindo_conta' ? ' · CONTA' : ''}</span>
                  </span>
                ) : <span className="text-xs text-ink-soft">livre · {m.capacidade} lug.</span>}
              </button>
            )
          })}
        </div>
      )}

      <button onClick={() => setNovo({ id: '', numero: 'Balcão' } as Mesa)} className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-[84px] z-20 flex min-h-[56px] items-center gap-2 rounded-full bg-brand px-5 text-base font-semibold text-brand-ink shadow-xl">+ Nova comanda</button>
      {novo && <CheckinModal mesas={mesas} mesaInicial={novo.id ? novo : null} onClose={() => setNovo(null)} onAberta={(id) => nav(`/pdv/comanda/${id}`)} />}
    </div>
  )
}
