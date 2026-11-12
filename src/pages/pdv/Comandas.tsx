import { useCallback, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Vazio, cartaoCls, chipCls, inputCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { useAoVivo } from '../../lib/pdv'

interface Linha { id: string; numero: number; mesa: string | null; nome_cliente: string | null; telefone: string | null; pessoas: number; status: string; aberta_em: string; fechada_em: string | null; total: number; pago: number; tem_couvert: boolean; tem_rodizio: boolean; cliente_id: string | null }
const STATUS: { v: string; r: string }[] = [
  { v: 'abertas', r: 'Abertas' }, { v: 'pedindo_conta', r: 'Aguardando pagamento' }, { v: 'fechada', r: 'Fechadas' }, { v: 'cancelada', r: 'Canceladas' }, { v: 'todas', r: 'Todas' },
]
const ROTULO: Record<string, string> = { aberta: 'Aberta', pedindo_conta: 'Aguardando pagamento', fechada: 'Fechada', cancelada: 'Cancelada' }
const COR: Record<string, string> = { aberta: 'bg-brand-soft text-brand', pedindo_conta: 'bg-alert-soft text-alert', fechada: 'bg-surface text-ink-soft ring-1 ring-line', cancelada: 'bg-surface text-ink-soft line-through ring-1 ring-line' }

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
      <input className={inputCls + ' mb-3'} placeholder="Buscar por nº (#123), nome, telefone ou mesa…" value={q} onChange={(e) => mudar('q', e.target.value)} />
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        {STATUS.map((s) => <button key={s.v} className={chipCls(st === s.v)} onClick={() => mudar('st', s.v === 'abertas' ? '' : s.v)}>{s.r}{s.v === 'pedindo_conta' ? ` (${cont((c) => c.status === 'pedindo_conta')})` : ''}</button>)}
      </div>
      <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
        {[['', 'Qualquer cobrança'], ['rodizio', `Rodízio (${cont((c) => c.tem_rodizio)})`], ['couvert', `Couvert artístico (${cont((c) => c.tem_couvert)})`], ['sem', 'Sem couvert/rodízio']].map(([v, r]) => <button key={v} className={chipCls(tipo === v)} onClick={() => mudar('tipo', v)}>{r}</button>)}
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['todos', 'Tudo']].map(([v, r]) => <button key={v} className={chipCls(per === v)} onClick={() => mudar('per', v === 'hoje' ? '' : v)}>{r}</button>)}
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
