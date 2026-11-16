import { useCallback, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, Erro, Vazio, cartaoCls, chipCls, inputCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { Comanda, Item, Mesa, Totais, num, useAoVivo } from '../../lib/pdv'

interface Pag { comanda_id: string; valor: number; criado_em: string }
type Filtro = 'todas' | 'abertas' | 'fechar' | 'fechadas'

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const ST: Record<string, { t: string; c: string }> = {
  aberta: { t: 'Em aberto', c: 'bg-emerald-100 text-emerald-800' },
  pedindo_conta: { t: 'Para fechar', c: 'bg-red-100 text-red-800' },
  fechada: { t: 'Fechada', c: 'bg-paper-dim text-ink-soft' },
  cancelada: { t: 'Cancelada', c: 'bg-alert-soft text-alert' },
}
const ST_ITEM: Record<string, string> = { enviado: 'enviado', preparando: 'preparando', pronto: 'pronto', entregue: 'entregue', cancelado: 'cancelado' }

function Cartao({ rotulo, valor, sub, destaque }: { rotulo: string; valor: string; sub?: string; destaque?: boolean }) {
  return (
    <div className={`${cartaoCls} min-w-0 p-4 ${destaque ? 'border-brand/40 bg-brand-soft' : ''}`}>
      <div className="text-xs font-medium text-ink-soft">{rotulo}</div>
      <div className="mt-1 truncate text-xl font-bold tabular-nums sm:text-2xl">{valor}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-soft">{sub}</div>}
    </div>
  )
}

/** Visão rápida do dia: faturado, em aberto, para fechar e a lista de comandas (somente leitura). */
export function ResumoDia() {
  const [comandas, setComandas] = useState<Comanda[]>([])
  const [mesas, setMesas] = useState<Record<string, string>>({})
  const [totais, setTotais] = useState<Record<string, Totais>>({})
  const [pags, setPags] = useState<Pag[]>([])
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const [de, setDe] = useState('00:00')
  const [ate, setAte] = useState('23:59')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [aberta, setAberta] = useState<string | null>(null)
  const [itens, setItens] = useState<Record<string, Item[]>>({})

  const carregar = useCallback(async () => {
    const ini = new Date(); ini.setHours(0, 0, 0, 0)
    const [c, m, t, p] = await Promise.all([
      db.from('pdv_comandas').select('*').or(`aberta_em.gte.${ini.toISOString()},status.in.(aberta,pedindo_conta)`).order('numero'),
      db.from('pdv_mesas').select('id,numero'),
      db.from('pdv_comanda_totais').select('*'),
      db.from('pdv_pagamentos').select('comanda_id,valor,criado_em').eq('estornado', false).gte('criado_em', ini.toISOString()),
    ])
    const e = c.error || m.error || t.error || p.error
    if (e) { setErro(e.message); setPronto(true); return }
    setErro('')
    setComandas((c.data ?? []) as Comanda[])
    setMesas(Object.fromEntries(((m.data ?? []) as Mesa[]).map((x) => [x.id, x.numero])))
    setTotais(Object.fromEntries(((t.data ?? []) as Totais[]).map((x) => [x.comanda_id, x])))
    setPags((p.data ?? []) as Pag[])
    setPronto(true)
  }, [])
  useAoVivo(['pdv_comandas', 'pdv_pedido_itens', 'pdv_pagamentos'], carregar, 15000)

  const carregarItens = useCallback(async (id: string) => {
    const { data } = await db.from('pdv_pedido_itens').select('*').eq('comanda_id', id).order('criado_em')
    setItens((x) => ({ ...x, [id]: (data ?? []) as Item[] }))
  }, [])
  useAoVivo(['pdv_pedido_itens'], () => { if (aberta) void carregarItens(aberta) }, 10000)

  const faixa = useMemo(() => {
    const dia = new Date(); const [h1, m1] = de.split(':').map(Number); const [h2, m2] = ate.split(':').map(Number)
    const a = new Date(dia); a.setHours(h1 || 0, m1 || 0, 0, 0)
    const b = new Date(dia); b.setHours(h2 ?? 23, m2 ?? 59, 59, 999)
    return { a: a.getTime(), b: b.getTime() }
  }, [de, ate])
  const naFaixa = (iso: string) => { const t = new Date(iso).getTime(); return t >= faixa.a && t <= faixa.b }

  const doPeriodo = useMemo(() => comandas.filter((c) => naFaixa(c.aberta_em) || c.status === 'aberta' || c.status === 'pedindo_conta'), [comandas, faixa]) // eslint-disable-line react-hooks/exhaustive-deps
  const validas = doPeriodo.filter((c) => c.status !== 'cancelada')
  const soma = (l: Comanda[]) => l.reduce((s, c) => s + num(totais[c.id]?.total), 0)
  const faturado = pags.filter((p) => naFaixa(p.criado_em)).reduce((s, p) => s + num(p.valor), 0)
  const emAberto = doPeriodo.filter((c) => c.status === 'aberta')
  const paraFechar = doPeriodo.filter((c) => c.status === 'pedindo_conta')
  const fechadas = doPeriodo.filter((c) => c.status === 'fechada')
  const totalCasa = soma(validas)
  const ticket = fechadas.length ? soma(fechadas) / fechadas.length : 0

  const lista = doPeriodo.filter((c) => (filtro === 'todas' ? true : filtro === 'abertas' ? c.status === 'aberta' : filtro === 'fechar' ? c.status === 'pedindo_conta' : c.status === 'fechada' || c.status === 'cancelada')).sort((a, b) => a.numero - b.numero)

  function abrir(id: string) {
    if (aberta === id) return setAberta(null)
    setAberta(id); void carregarItens(id)
  }
  const atalho = (a: string, b: string) => { setDe(a); setAte(b) }

  if (!pronto) return <Carregando />
  return (
    <div className="space-y-4">
      {erro && <Erro texto={erro} />}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">Horário</span>
        <input type="time" className={inputCls + ' !w-auto'} value={de} onChange={(e) => setDe(e.target.value)} />
        <span className="text-sm text-ink-soft">até</span>
        <input type="time" className={inputCls + ' !w-auto'} value={ate} onChange={(e) => setAte(e.target.value)} />
        <button className={chipCls(de === '00:00' && ate === '23:59')} onClick={() => atalho('00:00', '23:59')}>Dia todo</button>
        <button className={chipCls(de === '11:00' && ate === '16:00')} onClick={() => atalho('11:00', '16:00')}>Almoço</button>
        <button className={chipCls(de === '17:00' && ate === '23:59')} onClick={() => atalho('17:00', '23:59')}>Noite</button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 lg:grid-cols-4">
        <Cartao destaque rotulo="Faturado (recebido)" valor={reais(faturado)} sub={`${fechadas.length} comanda(s) fechada(s)`} />
        <Cartao rotulo="Em aberto" valor={reais(soma(emAberto))} sub={`${emAberto.length} comanda(s) em consumo`} />
        <Cartao rotulo="Para fechar" valor={reais(soma(paraFechar))} sub={`${paraFechar.length} esperando pagamento`} />
        <Cartao rotulo="Total da casa" valor={reais(totalCasa)} sub={fechadas.length ? `Ticket médio ${reais(ticket)}` : `${validas.length} comanda(s)`} />
      </div>

      <div className="flex flex-wrap gap-2">
        {([['todas', 'Todas', doPeriodo.length], ['abertas', 'Em aberto', emAberto.length], ['fechar', 'Para fechar', paraFechar.length], ['fechadas', 'Fechadas', fechadas.length]] as const).map(([v, t, n]) => (
          <button key={v} className={chipCls(filtro === v)} onClick={() => setFiltro(v)}>{t} · {n}</button>
        ))}
      </div>

      {!lista.length ? <Vazio texto="Nenhuma comanda neste filtro." /> : (
        <ul className={`${cartaoCls} divide-y divide-line overflow-hidden`}>
          {lista.map((c) => {
            const t = totais[c.id]; const st = ST[c.status] ?? ST.fechada
            const mesa = c.mesa_id ? mesas[c.mesa_id] : null
            const its = (itens[c.id] ?? []).filter((i) => i.status !== 'cancelado')
            return (
              <li key={c.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-dim" onClick={() => abrir(c.id)} aria-expanded={aberta === c.id}>
                  <span className="w-12 shrink-0 text-base font-bold tabular-nums">#{c.numero}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.nome_cliente || 'Sem nome'}{mesa ? ` · Mesa ${mesa}` : ' · Balcão'}</span>
                    <span className="block text-xs text-ink-soft">{hhmm(c.aberta_em)}{c.fechada_em ? ` – ${hhmm(c.fechada_em)}` : ''} · {c.pessoas} pessoa(s)</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">{reais(t?.total)}</span>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.c}`}>{st.t}</span>
                  </span>
                  <span className="text-ink-soft">{aberta === c.id ? '⌃' : '⌄'}</span>
                </button>
                {aberta === c.id && (
                  <div className="space-y-1 border-t border-line bg-paper-dim px-4 py-3 text-sm">
                    {!itens[c.id] ? <p className="text-ink-soft">Carregando…</p> : !its.length ? <p className="text-ink-soft">Nenhum item lançado.</p> : its.map((i) => (
                      <div key={i.id} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0"><span className="font-medium">{num(i.qtd)}× {i.nome}</span>{i.obs && <span className="block truncate text-xs text-ink-soft">{i.obs}</span>}<span className="text-xs text-ink-soft">{hhmm(i.criado_em)} · {ST_ITEM[i.status]}</span></span>
                        <span className="shrink-0 tabular-nums">{reais(num(i.qtd) * num(i.preco_unit))}</span>
                      </div>
                    ))}
                    <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-line pt-2 text-xs text-ink-soft">
                      <span>Subtotal {reais(t?.subtotal)} · Serviço {reais(t?.servico)}{num(c.desconto) > 0 ? ` · Desconto ${reais(c.desconto)}` : ''}</span>
                      <span>Pago {reais(t?.pago)}</span>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-ink-soft">Somente consulta: para lançar pedidos ou receber, abra a comanda no salão.</p>
    </div>
  )
}
