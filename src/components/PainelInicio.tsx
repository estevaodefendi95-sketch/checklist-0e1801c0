import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/supabase'
import { reais } from '../lib/formato'
import { Comanda, Item, idsConsumoInterno, num, rotuloForma, useAoVivo } from '../lib/pdv'
import { usePermissoes } from '../context/PermissoesContext'
import { Erro, cartaoCls } from './Estado'

/** O "dia" do bar vai das 4h às 4h: o movimento da madrugada ainda conta como o dia anterior. */
const VIRADA_H = 4
function inicioDoDia() {
  const d = new Date()
  if (d.getHours() < VIRADA_H) d.setDate(d.getDate() - 1)
  d.setHours(VIRADA_H, 0, 0, 0)
  return d
}
const isoLocal = (d: Date) => d.toLocaleDateString('sv-SE')

interface Dados {
  fat: number
  ticket: number
  porPessoa: number
  pessoas: number
  fechadas: number
  abertas: number
  emAberto: number
  semanaPassada: number | null
  formas: [string, number][]
  top: [string, number][]
  horas: [string, number][]
  reservas: { total: number; pessoas: number; proxima: string | null } | null
  aReceber: { n: number; valor: number; vencidas: number } | null
  estoqueBaixo: number | null
  caixaAberto: number | null
}

function Kpi({ rotulo, valor, apoio, to, tom }: { rotulo: string; valor: string; apoio?: string; to?: string; tom?: 'alerta' | 'ok' }) {
  const corpo = (
    <div className={`${cartaoCls} h-full p-4 transition-colors ${to ? 'hover:bg-paper-dim' : ''}`}>
      <p className="apoio">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tom === 'alerta' ? 'text-alert' : tom === 'ok' ? 'text-ok' : 'text-ink'}`}>{valor}</p>
      {apoio && <p className="mt-0.5 text-xs text-ink-soft">{apoio}</p>}
    </div>
  )
  return to ? <Link to={to} className="block">{corpo}</Link> : corpo
}

function Barras({ titulo, linhas, fmt }: { titulo: string; linhas: [string, number][]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...linhas.map((l) => l[1]))
  return (
    <section className={`${cartaoCls} p-4`}>
      <h3 className="subtitulo mb-3">{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="apoio">sem movimento ainda</p>
      ) : (
        <ul className="space-y-2">
          {linhas.map(([nome, v]) => (
            <li key={nome} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{nome}</span>
                <span className="shrink-0 tabular-nums text-ink-soft">{fmt(v)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-paper-dim">
                <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(3, (v / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Indicadores do dia, na abertura do sistema. Cada bloco só aparece para quem tem a permissão correspondente. */
export function PainelInicio() {
  const { pode } = usePermissoes()
  const vendas = pode('pdv_ver_vendas')
  const reservasOk = pode('pdv_ver_reservas')
  const caixaOk = pode('pdv_caixa') || pode('pdv_gerir')
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const ini = inicioDoDia()
    const fim = new Date(ini); fim.setDate(fim.getDate() + 1)
    const diaRef = isoLocal(ini)

    const c = vendas
      ? await db.from('pdv_comandas').select('*').gte('aberta_em', ini.toISOString()).lt('aberta_em', fim.toISOString())
      : { data: [], error: null }
    if (c.error) return setErro(c.error.message)
    const semFunc = ((c.data ?? []) as Comanda[]).filter((x) => !x.funcionario_id)
    const internos = await idsConsumoInterno(db, semFunc)   // família/casa: fora do faturamento
    const cs = semFunc.filter((x) => !internos.has(x.id))
    const ids = cs.map((x) => x.id)

    const semIni = new Date(ini); semIni.setDate(semIni.getDate() - 7)
    const semFim = new Date(semIni); semFim.setDate(semFim.getDate() + 1)

    const [tot, it, pg, semPass, res, ar, est, cx] = await Promise.all([
      ids.length ? db.from('pdv_comanda_totais').select('comanda_id,subtotal,total').in('comanda_id', ids) : { data: [] },
      ids.length ? db.from('pdv_pedido_itens').select('comanda_id,nome,qtd,preco_unit,status,tipo').in('comanda_id', ids) : { data: [] },
      ids.length ? db.from('pdv_pagamentos').select('comanda_id,forma,valor,troco').in('comanda_id', ids).eq('estornado', false).is('baixa_de', null) : { data: [] },
      vendas
        ? db.from('pdv_comandas').select('id,status,funcionario_id,desconto_detalhe').gte('aberta_em', semIni.toISOString()).lt('aberta_em', semFim.toISOString()).eq('status', 'fechada')
        : { data: [] },
      reservasOk ? db.from('reservas').select('hora,pessoas,status').eq('data', diaRef).in('status', ['pendente', 'confirmada', 'sentada']) : { data: null },
      caixaOk ? db.from('pdv_a_receber').select('valor,vencimento').eq('status', 'aberto') : { data: null },
      vendas || caixaOk ? db.rpc('estoque_alertas') : { data: null },
      caixaOk ? db.from('pdv_caixa_sessoes').select('id', { count: 'exact', head: true }).eq('status', 'aberto') : { count: null },
    ])

    const totPor = new Map(((tot.data ?? []) as { comanda_id: string; subtotal: number; total: number }[]).map((t) => [t.comanda_id, t]))
    const fechadas = cs.filter((x) => x.status === 'fechada')
    const abertas = cs.filter((x) => x.status === 'aberta' || x.status === 'pedindo_conta')
    const fat = fechadas.reduce((s, x) => s + num(totPor.get(x.id)?.total), 0)
    const emAberto = abertas.reduce((s, x) => s + num(totPor.get(x.id)?.subtotal), 0)
    const pessoas = fechadas.reduce((s, x) => s + x.pessoas, 0)
    const idsF = new Set(fechadas.map((x) => x.id))

    const formas: Record<string, number> = {}
    ;((pg.data ?? []) as { comanda_id: string; forma: string; valor: number; troco: number }[])
      .filter((p) => idsF.has(p.comanda_id))
      .forEach((p) => { formas[p.forma] = (formas[p.forma] ?? 0) + num(p.valor) - num(p.troco) })

    const prod: Record<string, number> = {}
    ;((it.data ?? []) as Item[])
      .filter((i) => idsF.has(i.comanda_id) && i.status !== 'cancelado' && i.tipo === 'produto')
      .forEach((i) => { prod[i.nome] = (prod[i.nome] ?? 0) + num(i.qtd) })

    const horas: Record<string, number> = {}
    fechadas.forEach((x) => {
      const h = String(new Date(x.aberta_em).getHours()).padStart(2, '0') + 'h'
      horas[h] = (horas[h] ?? 0) + num(totPor.get(x.id)?.total)
    })

    // mesmo dia da semana passada: só o faturamento, para dar noção de "melhor ou pior que o normal"
    let semanaPassada: number | null = null
    const semPassComandas = ((semPass.data ?? []) as { id: string; funcionario_id: string | null; desconto_detalhe?: unknown }[]).filter((x) => !x.funcionario_id)
    const internosSem = await idsConsumoInterno(db, semPassComandas)
    const idsSem = semPassComandas.filter((x) => !internosSem.has(x.id)).map((x) => x.id)
    if (vendas && idsSem.length) {
      const t = await db.from('pdv_comanda_totais').select('total').in('comanda_id', idsSem)
      semanaPassada = ((t.data ?? []) as { total: number }[]).reduce((s, x) => s + num(x.total), 0)
    } else if (vendas) semanaPassada = 0

    const agora = new Date().toTimeString().slice(0, 5)
    const rs = (res.data ?? null) as { hora: string; pessoas: number; status: string }[] | null
    const hoje = isoLocal(new Date())
    const arr = (ar.data ?? null) as { valor: number; vencimento: string | null }[] | null
    const alertas = (est.data ?? null) as { abaixo: boolean }[] | null

    setD({
      fat,
      ticket: fechadas.length ? fat / fechadas.length : 0,
      porPessoa: pessoas ? fat / pessoas : 0,
      pessoas,
      fechadas: fechadas.length,
      abertas: abertas.length,
      emAberto,
      semanaPassada,
      formas: Object.entries(formas).sort((a, b) => b[1] - a[1]),
      top: Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 6),
      horas: Object.entries(horas).sort((a, b) => a[0].localeCompare(b[0])),
      reservas: rs ? { total: rs.length, pessoas: rs.reduce((s, r) => s + r.pessoas, 0), proxima: rs.filter((r) => r.status !== 'sentada' && r.hora.slice(0, 5) >= agora).map((r) => r.hora.slice(0, 5)).sort()[0] ?? null } : null,
      aReceber: arr ? { n: arr.length, valor: arr.reduce((s, r) => s + num(r.valor), 0), vencidas: arr.filter((r) => r.vencimento && r.vencimento < hoje).length } : null,
      estoqueBaixo: alertas ? alertas.filter((a) => a.abaixo).length : null,
      caixaAberto: caixaOk ? (cx as { count: number | null }).count ?? 0 : null,
    })
    setErro('')
  }, [vendas, reservasOk, caixaOk])

  useAoVivo(['pdv_comandas', 'pdv_pagamentos', 'pdv_pedido_itens', 'reservas', 'pdv_a_receber'], carregar, 30000)

  if (!vendas && !reservasOk && !caixaOk) return null
  if (erro) return <div className="mb-6"><Erro texto={'Não foi possível carregar os indicadores: ' + erro} /></div>
  if (!d) return <p className="mb-6 text-sm text-ink-soft" role="status">Carregando indicadores…</p>

  const vs = d.semanaPassada && d.semanaPassada > 0 ? ((d.fat - d.semanaPassada) / d.semanaPassada) * 100 : null
  const apoioFat = vs == null ? `${d.fechadas} ${d.fechadas === 1 ? 'comanda fechada' : 'comandas fechadas'}` : `${vs >= 0 ? '+' : ''}${vs.toFixed(0)}% vs. mesmo dia da semana passada`

  return (
    <section className="mb-8" aria-label="Indicadores de hoje">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {vendas && <Kpi rotulo="Faturamento de hoje" valor={reais(d.fat)} apoio={apoioFat} to="/pdv/relatorios" tom={vs != null && vs >= 0 ? 'ok' : undefined} />}
        {vendas && <Kpi rotulo="Ticket médio" valor={reais(d.ticket)} apoio={d.pessoas ? `${reais(d.porPessoa)} por pessoa · ${d.pessoas} pessoas` : 'por comanda'} to="/pdv/relatorios" />}
        {vendas && <Kpi rotulo="Comandas abertas" valor={String(d.abertas)} apoio={d.abertas ? `${reais(d.emAberto)} em consumo` : 'nenhuma agora'} to="/pdv/comandas" />}
        {d.reservas && <Kpi rotulo="Reservas de hoje" valor={String(d.reservas.total)} apoio={d.reservas.total ? `${d.reservas.pessoas} pessoas${d.reservas.proxima ? ` · próxima ${d.reservas.proxima}` : ''}` : 'nenhuma'} to="/pdv/reservas" />}
        {d.aReceber && <Kpi rotulo="A receber" valor={reais(d.aReceber.valor)} apoio={d.aReceber.n ? `${d.aReceber.n} em aberto${d.aReceber.vencidas ? ` · ${d.aReceber.vencidas} vencida${d.aReceber.vencidas > 1 ? 's' : ''}` : ''}` : 'nada pendente'} to="/pdv/a-receber" tom={d.aReceber.vencidas ? 'alerta' : undefined} />}
        {d.estoqueBaixo != null && <Kpi rotulo="Estoque abaixo do mínimo" valor={String(d.estoqueBaixo)} apoio={d.estoqueBaixo ? 'itens para repor' : 'tudo em dia'} to="/estoque/alertas" tom={d.estoqueBaixo ? 'alerta' : 'ok'} />}
        {d.caixaAberto != null && <Kpi rotulo="Caixas abertos" valor={String(d.caixaAberto)} apoio={d.caixaAberto ? undefined : 'nenhum caixa aberto'} to="/pdv/caixa" />}
      </div>

      {vendas && (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Barras titulo="Vendas por hora" linhas={d.horas} fmt={reais} />
          <Barras titulo="Formas de pagamento" linhas={d.formas.map(([f, v]) => [rotuloForma(f), v])} fmt={reais} />
          <Barras titulo="Mais vendidos" linhas={d.top} fmt={(n) => `${n}×`} />
        </div>
      )}
    </section>
  )
}
