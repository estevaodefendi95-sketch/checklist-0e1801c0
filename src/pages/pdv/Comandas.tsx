import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Vazio, cartaoCls, inputCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { useAoVivo } from '../../lib/pdv'

interface Linha { id: string; numero: number; mesa: string | null; nome_cliente: string | null; telefone: string | null; pessoas: number; status: string; aberta_em: string; fechada_em: string | null; total: number; pago: number; tem_couvert: boolean; tem_rodizio: boolean; cliente_id: string | null }
const STATUS: { v: string; r: string }[] = [
  { v: 'abertas', r: 'Abertas' }, { v: 'pedindo_conta', r: 'Aguardando pagamento' }, { v: 'fechada', r: 'Fechadas' }, { v: 'cancelada', r: 'Canceladas' }, { v: 'todas', r: 'Todas' },
]
const ROTULO: Record<string, string> = { aberta: 'Aberta', pedindo_conta: 'Aguardando pagamento', fechada: 'Fechada', cancelada: 'Cancelada' }
const COR: Record<string, string> = { aberta: 'bg-brand-soft text-brand', pedindo_conta: 'bg-alert-soft text-alert', fechada: 'bg-surface text-ink-soft ring-1 ring-line', cancelada: 'bg-surface text-ink-soft line-through ring-1 ring-line' }

function Seg({ opcoes, valor, onChange, pequeno, className = '' }: { opcoes: { v: string; r: string; n?: number }[]; valor: string; onChange: (v: string) => void; pequeno?: boolean; className?: string }) {
  return (
    <div className={`max-w-full overflow-x-auto ${className}`}>
      <div role="tablist" className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1">
        {opcoes.map((o) => {
          const on = valor === o.v
          return (
            <button key={o.v} role="tab" aria-selected={on} onClick={() => onChange(o.v)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm transition-colors ${pequeno ? 'min-h-[34px]' : 'min-h-[40px]'} ${on ? 'bg-brand-soft font-semibold text-brand shadow-sm' : 'text-ink-soft hover:text-ink'}`}>
              {o.r}
              {o.n !== undefined && <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${on ? 'bg-brand/15' : 'bg-line/60'}`}>{o.n}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Busca de comandas com filtros por situação, rodízio e couvert artístico. */
export function Comandas() {
  const [sp, setSp] = useSearchParams()
  const [lista, setLista] = useState<Linha[] | null>(null)
  const q = sp.get('q') ?? ''
  const st = sp.get('st') ?? 'abertas'
  const tipo = sp.get('tipo') ?? ''
  const per = sp.get('per') ?? 'hoje'
  const mudar = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }) }

  const carregar = useCallback(async () => {
    const desde = per === 'hoje' ? new Date(new Date().setHours(0, 0, 0, 0)) : per === '7d' ? new Date(Date.now() - 7 * 864e5) : per === '30d' ? new Date(Date.now() - 30 * 864e5) : null
    let qy = db.from('v_comandas_busca').select('*').order('aberta_em', { ascending: false }).limit(400)
    if (desde) qy = qy.gte('aberta_em', desde.toISOString())
    const { data } = await qy
    setLista((data ?? []) as Linha[])
  }, [per])
  useAoVivo(['pdv_comandas', 'pdv_pedido_itens'], carregar)

  const vis = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (lista ?? []).filter((c) => {
      if (st === 'abertas' && !['aberta', 'pedindo_conta'].includes(c.status)) return false
      if (!['abertas', 'todas'].includes(st) && c.status !== st) return false
      if (tipo === 'rodizio' && !c.tem_rodizio) return false
      if (tipo === 'couvert' && !c.tem_couvert) return false
      if (tipo === 'sem' && (c.tem_rodizio || c.tem_couvert)) return false
      if (!t) return true
      return String(c.numero) === t.replace('#', '') || (c.nome_cliente ?? '').toLowerCase().includes(t) || (c.telefone ?? '').includes(t.replace(/\D/g, '') || '§') || (c.mesa ?? '').toLowerCase() === t || `mesa ${c.mesa ?? ''}`.toLowerCase() === t
    })
  }, [lista, q, st, tipo])
  const soma = vis.reduce((s, c) => s + Number(c.total), 0)
  const cont = (f: (c: Linha) => boolean) => (lista ?? []).filter(f).length

  if (!lista) return <Carregando />
  return (
    <div>
      <Cabecalho titulo="Comandas" subtitulo={`${vis.length} comanda(s) · ${reais(soma)}`} voltar={{ para: '/pdv', rotulo: 'Salão' }} />
      <div className="relative mb-3">
        <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input className={inputCls + ' !pl-10'} placeholder="Buscar por nº (#123), nome, telefone ou mesa…" value={q} onChange={(e) => mudar('q', e.target.value)} />
      </div>
      <Seg className="mb-3" valor={st} onChange={(v) => mudar('st', v === 'abertas' ? '' : v)}
        opcoes={STATUS.map((s) => ({ v: s.v, r: s.r, n: s.v === 'pedindo_conta' ? cont((c) => c.status === 'pedindo_conta') : s.v === 'abertas' ? cont((c) => ['aberta', 'pedindo_conta'].includes(c.status)) : undefined }))} />
      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Cobrança</div>
          <Seg pequeno valor={tipo} onChange={(v) => mudar('tipo', v)} opcoes={[{ v: '', r: 'Todas' }, { v: 'rodizio', r: 'Rodízio', n: cont((c) => c.tem_rodizio) }, { v: 'couvert', r: 'Couvert', n: cont((c) => c.tem_couvert) }, { v: 'sem', r: 'Nenhuma' }]} />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">Período</div>
          <Seg pequeno valor={per === 'hoje' ? 'hoje' : per} onChange={(v) => mudar('per', v === 'hoje' ? '' : v)} opcoes={[{ v: 'hoje', r: 'Hoje' }, { v: '7d', r: '7 dias' }, { v: '30d', r: '30 dias' }, { v: 'todos', r: 'Tudo' }]} />
        </div>
        {(st !== 'abertas' || tipo || per !== 'hoje' || q) && <button className="mb-1 text-sm text-brand underline" onClick={() => setSp(new URLSearchParams(), { replace: true })}>Limpar filtros</button>}
      </div>
      {!vis.length ? <Vazio texto="Nenhuma comanda com esses filtros." /> : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {vis.map((c) => (
            <Link key={c.id} to={`/pdv/comanda/${c.id}`} className={`${cartaoCls} block p-3`}>
              <div className="flex items-start justify-between gap-2">
                <b>#{c.numero} · {c.nome_cliente ?? 'Sem nome'}</b>
                <span className={`rounded-full px-2 py-0.5 text-xs ${COR[c.status] ?? ''}`}>{ROTULO[c.status] ?? c.status}</span>
              </div>
              <div className="mt-1 text-sm text-ink-soft">{c.mesa ? `Mesa ${c.mesa}` : 'Sem mesa'} · {c.pessoas} pessoa(s){c.telefone ? ` · ${c.telefone}` : ''}</div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <span>{new Date(c.aberta_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                {c.tem_rodizio && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">rodízio</span>}
                {c.tem_couvert && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">couvert</span>}
                <span className="ml-auto text-sm font-semibold text-ink">{reais(Number(c.total))}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
