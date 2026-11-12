import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { Comanda, Item, Mesa, FORMAS, num, rotuloForma, hora } from '../../lib/pdv'

interface Pag { comanda_id: string; forma: string; valor: number; troco: number }

const hojeISO = () => new Date().toLocaleDateString('sv-SE')
const soma = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE') }

export function PdvRelatorios() {
  const [de, setDe] = useState(hojeISO())
  const [ate, setAte] = useState(hojeISO())
  const [comandas, setComandas] = useState<Comanda[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [pags, setPags] = useState<Pag[]>([])
  const [mesas, setMesas] = useState<Record<string, Mesa>>({})
  const [catDe, setCatDe] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)

  const carregar = useCallback(async () => {
    setPronto(false)
    const ini = new Date(de + 'T00:00:00').toISOString()
    const fim = new Date(soma(ate, 1) + 'T00:00:00').toISOString()
    const c = await db.from('pdv_comandas').select('*').gte('aberta_em', ini).lt('aberta_em', fim).order('aberta_em')
    if (c.error) { setErro(c.error.message); return setPronto(true) }
    const cs = (c.data ?? []) as Comanda[]
    setComandas(cs)
    const ids = cs.map((x) => x.id)
    const [i, p, m, pr, ct] = await Promise.all([
      ids.length ? db.from('pdv_pedido_itens').select('*').in('comanda_id', ids) : { data: [] },
      ids.length ? db.from('pdv_pagamentos').select('comanda_id,forma,valor,troco').in('comanda_id', ids).eq('estornado', false) : { data: [] },
      db.from('pdv_mesas').select('*'),
      db.from('pdv_produtos').select('id,categoria_id'),
      db.from('pdv_categorias').select('id,nome'),
    ])
    setItens((i.data ?? []) as Item[])
    setPags((p.data ?? []) as Pag[])
    setMesas(Object.fromEntries(((m.data ?? []) as Mesa[]).map((x) => [x.id, x])))
    const nomeCat = Object.fromEntries(((ct.data ?? []) as { id: string; nome: string }[]).map((x) => [x.id, x.nome]))
    setCatDe(Object.fromEntries(((pr.data ?? []) as { id: string; categoria_id: string | null }[]).map((x) => [x.id, x.categoria_id ? nomeCat[x.categoria_id] ?? '—' : 'Sem categoria'])))
    setErro('')
    setPronto(true)
  }, [de, ate])
  useEffect(() => { carregar() }, [carregar])

  const r = useMemo(() => {
    const fechadas = comandas.filter((c) => c.status === 'fechada')
    const abertas = comandas.filter((c) => c.status === 'aberta' || c.status === 'pedindo_conta')
    const canceladas = comandas.filter((c) => c.status === 'cancelada')
    const ativos = itens.filter((i) => i.status !== 'cancelado')
    const bruto = (cid: string) => ativos.filter((i) => i.comanda_id === cid).reduce((s, i) => s + i.qtd * i.preco_unit, 0)
    const fat = fechadas.reduce((s, c) => Math.max(0, s + bruto(c.id) * (1 + c.taxa_servico_pct / 100) - c.desconto), 0)
    const servico = fechadas.reduce((s, c) => s + bruto(c.id) * c.taxa_servico_pct / 100, 0)
    const idsF = new Set(fechadas.map((c) => c.id))
    const porForma: Record<string, number> = {}
    pags.filter((p) => idsF.has(p.comanda_id)).forEach((p) => (porForma[p.forma] = (porForma[p.forma] ?? 0) + num(p.valor) - num(p.troco)))
    const prod: Record<string, { qtd: number; valor: number }> = {}
    const cat: Record<string, number> = {}
    ativos.filter((i) => idsF.has(i.comanda_id)).forEach((i) => {
      prod[i.nome] = { qtd: (prod[i.nome]?.qtd ?? 0) + num(i.qtd), valor: (prod[i.nome]?.valor ?? 0) + i.qtd * i.preco_unit }
      const k = (i.produto_id && catDe[i.produto_id]) || 'Sem categoria'
      cat[k] = (cat[k] ?? 0) + i.qtd * i.preco_unit
    })
    const pessoas = fechadas.reduce((s, c) => s + c.pessoas, 0)
    const cancel = itens.filter((i) => i.status === 'cancelado')
    return { fechadas, abertas, canceladas, fat, servico, porForma, prod, cat, pessoas, cancel, bruto }
  }, [comandas, itens, pags, catDe])

  function csv() {
    const linhas = [['comanda', 'mesa', 'abertura', 'fechamento', 'status', 'pessoas', 'subtotal', 'servico_pct', 'desconto']]
    comandas.forEach((c) => linhas.push([String(c.numero), c.mesa_id ? mesas[c.mesa_id]?.numero ?? '' : 'balcao', c.aberta_em, c.fechada_em ?? '', c.status, String(c.pessoas), r.bruto(c.id).toFixed(2), String(c.taxa_servico_pct), String(c.desconto)]))
    const blob = new Blob(['﻿' + linhas.map((l) => l.join(';')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pdv_${de}_${ate}.csv`; a.click()
  }

  const topProd = Object.entries(r.prod).sort((a, b) => b[1].valor - a[1].valor).slice(0, 15)
  return (
    <div>
      <Cabecalho titulo="Relatórios do PDV" subtitulo={`${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`}
        acoes={<button className={btnSecCls} onClick={csv}>Exportar CSV</button>} />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <button className={btnSecCls} onClick={() => { setDe(hojeISO()); setAte(hojeISO()) }}>Hoje</button>
        <button className={btnSecCls} onClick={() => { setDe(soma(hojeISO(), -1)); setAte(soma(hojeISO(), -1)) }}>Ontem</button>
        <button className={btnSecCls} onClick={() => { setDe(soma(hojeISO(), -6)); setAte(hojeISO()) }}>7 dias</button>
        <button className={btnSecCls} onClick={() => { setDe(soma(hojeISO(), -29)); setAte(hojeISO()) }}>30 dias</button>
        <input type="date" className={inputCls + ' !w-auto'} value={de} onChange={(e) => setDe(e.target.value)} />
        <input type="date" className={inputCls + ' !w-auto'} value={ate} onChange={(e) => setAte(e.target.value)} />
      </div>
      {erro && <Erro texto={erro} />}
      {!pronto ? <Carregando /> : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi t="Faturamento" v={reais(r.fat)} />
            <Kpi t="Comandas fechadas" v={String(r.fechadas.length)} />
            <Kpi t="Ticket médio" v={reais(r.fechadas.length ? r.fat / r.fechadas.length : 0)} />
            <Kpi t="Por pessoa" v={reais(r.pessoas ? r.fat / r.pessoas : 0)} />
            <Kpi t="Serviço (taxa)" v={reais(r.servico)} />
            <Kpi t="Mesas abertas agora" v={String(r.abertas.length)} />
            <Kpi t="Comandas canceladas" v={String(r.canceladas.length)} />
            <Kpi t="Itens cancelados" v={String(r.cancel.length)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Bloco t="Por forma de pagamento">
              {FORMAS.map((f) => <Linha key={f.v} a={rotuloForma(f.v)} b={reais(r.porForma[f.v] ?? 0)} />)}
            </Bloco>
            <Bloco t="Por categoria">
              {Object.entries(r.cat).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Linha key={k} a={k} b={reais(v)} />)}
              {!Object.keys(r.cat).length && <p className="text-sm text-ink-soft">Sem vendas no período.</p>}
            </Bloco>
            <Bloco t="Mais vendidos (valor)">
              {topProd.map(([k, v]) => <Linha key={k} a={`${v.qtd}× ${k}`} b={reais(v.valor)} />)}
              {!topProd.length && <p className="text-sm text-ink-soft">Sem vendas no período.</p>}
            </Bloco>
            <Bloco t="Comandas do período">
              {!comandas.length ? <Vazio texto="Nenhuma comanda." /> : comandas.slice().reverse().slice(0, 40).map((c) => (
                <Linha key={c.id} a={`#${c.numero} · ${c.mesa_id ? 'mesa ' + (mesas[c.mesa_id]?.numero ?? '?') : 'balcão'} · ${hora(c.aberta_em)} · ${c.status}`} b={reais(r.bruto(c.id) * (1 + c.taxa_servico_pct / 100) - c.desconto)} />
              ))}
            </Bloco>
            {r.cancel.length > 0 && (
              <Bloco t="Itens cancelados">
                {r.cancel.map((i) => <Linha key={i.id} a={`${i.qtd}× ${i.nome}`} b={reais(i.qtd * i.preco_unit)} />)}
              </Bloco>
            )}
          </div>
        </>
      )}
    </div>
  )
}
const Kpi = ({ t, v }: { t: string; v: string }) => (
  <div className={`${cartaoCls} p-4`}><div className="text-xs uppercase tracking-wide text-ink-soft">{t}</div><div className="mt-1 text-xl font-semibold">{v}</div></div>
)
const Bloco = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section className={`${cartaoCls} p-4`}><h2 className="mb-2 font-semibold">{t}</h2><div className="divide-y divide-line">{children}</div></section>
)
const Linha = ({ a, b }: { a: string; b: string }) => <div className="flex justify-between gap-3 py-2 text-sm"><span>{a}</span><b className="shrink-0">{b}</b></div>
