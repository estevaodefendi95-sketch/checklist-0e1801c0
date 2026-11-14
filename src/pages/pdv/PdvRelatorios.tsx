import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { Comanda, Item, Mesa, FORMAS, idsConsumoInterno, num, rotuloForma, hora } from '../../lib/pdv'
import { Link } from 'react-router-dom'
import { numero } from '../../lib/formato'
import { chipCls } from '../../components/Estado'
import { usePermissoes } from '../../context/PermissoesContext'

interface Pag { comanda_id: string; forma: string; valor: number; troco: number; tef_provedor: string | null; user_id: string | null; baixa_de?: string | null }
interface Aprov { acao: string; comanda_id: string | null; item_id: string | null; detalhe: string | null; motivo: string | null; solicitado_por: string | null; aprovado_por: string | null; criado_em: string }
interface Cons { insumo_id: string; quantidade: number }
interface Ins { id: string; nome: string; unidade: string; preco: number | null }

const hojeISO = () => new Date().toLocaleDateString('sv-SE')
const soma = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE') }

export function PdvRelatorios() {
  const { pode } = usePermissoes()
  const verCusto = pode('ver_custos')
  const [fichaDe, setFichaDe] = useState<Record<string, string | null>>({})
  const [de, setDe] = useState(hojeISO())
  const [ate, setAte] = useState(hojeISO())
  const [aba, setAba] = useState<'vendas' | 'estoque'>('vendas')
  const [cons, setCons] = useState<Cons[]>([])
  const [insumos, setInsumos] = useState<Record<string, Ins>>({})
  const [semFicha, setSemFicha] = useState<Set<string>>(new Set())
  const [operadores, setOperadores] = useState<Record<string, string>>({})
  const [corte, setCorte] = useState('')
  const [comandas, setComandas] = useState<Comanda[]>([])
  const [itens, setItens] = useState<Item[]>([])
  const [pags, setPags] = useState<Pag[]>([])
  const [mesas, setMesas] = useState<Record<string, Mesa>>({})
  const [catDe, setCatDe] = useState<Record<string, string>>({})
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const [aprovs, setAprovs] = useState<Aprov[]>([])
  const [fCliente, setFCliente] = useState('')
  const [fUser, setFUser] = useState('')
  const [fPapel, setFPapel] = useState<'qualquer' | 'abriu' | 'lancou' | 'fechou'>('qualquer')
  const [soCancel, setSoCancel] = useState(false)
  const [internas, setInternas] = useState(0)

  const carregar = useCallback(async () => {
    setPronto(false)
    const ini = new Date(de + 'T00:00:00').toISOString()
    const fim = new Date(soma(ate, 1) + 'T00:00:00').toISOString()
    const c = await db.from('pdv_comandas').select('*').gte('aberta_em', ini).lt('aberta_em', fim).order('aberta_em')
    if (c.error) { setErro(c.error.message); return setPronto(true) }
    const semFunc = ((c.data ?? []) as Comanda[]).filter((x) => !x.funcionario_id)
    const internos = await idsConsumoInterno(db, semFunc)   // família/casa: fora do faturamento
    const cs = semFunc.filter((x) => !internos.has(x.id))
    setInternas(semFunc.length - cs.length)
    setComandas(cs)
    const ids = cs.map((x) => x.id)
    const [i, p, m, pr, ct, cn, ins, cf, pf, ap] = await Promise.all([
      ids.length ? db.from('pdv_pedido_itens').select('*').in('comanda_id', ids) : { data: [] },
      ids.length ? db.from('pdv_pagamentos').select('comanda_id,forma,valor,troco,tef_provedor,user_id,baixa_de').in('comanda_id', ids).eq('estornado', false) : { data: [] },
      db.from('pdv_mesas').select('*'),
      db.from('pdv_produtos').select('id,categoria_id,ficha_id'),
      db.from('pdv_categorias').select('id,nome'),
      db.rpc('consumo_teorico', { p_inicio: de, p_fim: ate }),
      db.from('insumos').select('id,nome,unidade,preco'),
      db.from('pdv_config').select('estoque_auto_desde').eq('id', 1).maybeSingle(),
      db.from('profiles').select('id,nome'),
      ids.length ? db.from('pdv_aprovacoes').select('acao,comanda_id,item_id,detalhe,motivo,solicitado_por,aprovado_por,criado_em').in('comanda_id', ids) : { data: [] },
    ])
    setAprovs((ap.data ?? []) as Aprov[])
    setCons((cn.data ?? []) as Cons[])
    setInsumos(Object.fromEntries(((ins.data ?? []) as Ins[]).map((x) => [x.id, x])))
    setCorte(cf.data?.estoque_auto_desde ?? '')
    setOperadores(Object.fromEntries(((pf.data ?? []) as { id: string; nome: string }[]).map((x) => [x.id, x.nome])))
    setItens((i.data ?? []) as Item[])
    setPags((p.data ?? []) as Pag[])
    setMesas(Object.fromEntries(((m.data ?? []) as Mesa[]).map((x) => [x.id, x])))
    const nomeCat = Object.fromEntries(((ct.data ?? []) as { id: string; nome: string }[]).map((x) => [x.id, x.nome]))
    setFichaDe(Object.fromEntries(((pr.data ?? []) as { id: string; ficha_id: string | null }[]).map((x) => [x.id, x.ficha_id])))
    setSemFicha(new Set(((pr.data ?? []) as { id: string; ficha_id: string | null }[]).filter((x) => !x.ficha_id).map((x) => x.id)))
    setCatDe(Object.fromEntries(((pr.data ?? []) as { id: string; categoria_id: string | null }[]).map((x) => [x.id, x.categoria_id ? nomeCat[x.categoria_id] ?? '—' : 'Sem categoria'])))
    setErro('')
    setPronto(true)
  }, [de, ate])
  useEffect(() => { carregar() }, [carregar])

  const normal = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const cancelPorComanda = useMemo(() => {
    const m = new Set<string>()
    itens.forEach((i) => { if (i.status === 'cancelado') m.add(i.comanda_id) })
    comandas.forEach((c) => { if (c.status === 'cancelada') m.add(c.id) })
    return m
  }, [itens, comandas])
  // quem abriu, quem lançou itens e quem fechou cada comanda (dados antigos: quem fechou = quem recebeu o pagamento)
  const envolvidos = useCallback((c: Comanda): ['abriu' | 'lancou' | 'fechou', string][] => {
    const x = c as unknown as { aberta_por?: string; fechada_por?: string }
    const out: ['abriu' | 'lancou' | 'fechou', string][] = []
    if (x.aberta_por) out.push(['abriu', x.aberta_por])
    itens.filter((i) => i.comanda_id === c.id).forEach((i) => { const u = (i as unknown as { criado_por?: string }).criado_por; if (u) out.push(['lancou', u]) })
    const fech = x.fechada_por ?? pags.find((p) => p.comanda_id === c.id && p.user_id)?.user_id
    if (c.status === 'fechada' && fech) out.push(['fechou', fech])
    return out
  }, [itens, pags])
  const cF = useMemo(() => {
    const q = normal(fCliente.trim()), dig = fCliente.replace(/\D/g, '')
    return comandas.filter((c) => {
      if (fUser && !envolvidos(c).some(([papel, id]) => id === fUser && (fPapel === 'qualquer' || fPapel === papel))) return false
      if (soCancel && !cancelPorComanda.has(c.id)) return false
      if (q) {
        const nome = normal(c.nome_cliente ?? '')
        const okNome = nome.includes(q)
        const okTel = dig.length >= 3 && (c.telefone ?? '').replace(/\D/g, '').includes(dig)
        const okNum = /^\d+$/.test(q) && String(c.numero) === q
        if (!(okNome || okTel || okNum)) return false
      }
      return true
    })
  }, [comandas, fCliente, fUser, fPapel, soCancel, cancelPorComanda, envolvidos])
  const idsCF = useMemo(() => new Set(cF.map((c) => c.id)), [cF])
  const itF = useMemo(() => itens.filter((i) => idsCF.has(i.comanda_id)), [itens, idsCF])
  const pgF = useMemo(() => pags.filter((p) => idsCF.has(p.comanda_id) && !p.baixa_de), [pags, idsCF])
  const usuariosNoPeriodo = useMemo(() => {
    const ids = new Set<string>()
    comandas.forEach((c) => envolvidos(c).forEach(([, u]) => ids.add(u)))
    return [...ids].map((id) => ({ id, nome: operadores[id] ?? 'Usuário' })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [comandas, operadores, envolvidos])

  const r = useMemo(() => {
    const comandas = cF, itens = itF, pags = pgF
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
    const oper: Record<string, number> = {}
    pags.filter((p) => idsF.has(p.comanda_id) && !['a_receber', 'cortesia', 'folha'].includes(p.forma)).forEach((p) => { const k = operadores[p.user_id ?? ''] ?? 'Sem operador'; oper[k] = (oper[k] ?? 0) + num(p.valor) - num(p.troco) })
    const horas: Record<string, number> = {}
    fechadas.forEach((c) => { const h = String(new Date(c.aberta_em).getHours()).padStart(2, '0') + 'h'; horas[h] = (horas[h] ?? 0) + Math.max(0, bruto(c.id) * (1 + c.taxa_servico_pct / 100) - c.desconto) })
    const vendSemFicha: Record<string, number> = {}
    ativos.filter((i) => idsF.has(i.comanda_id) && i.tipo === 'produto' && i.produto_id && semFicha.has(i.produto_id)).forEach((i) => { vendSemFicha[i.nome] = (vendSemFicha[i.nome] ?? 0) + num(i.qtd) })
    const maq: Record<string, number> = {}
    pags.filter((p) => idsF.has(p.comanda_id) && (p.forma === 'credito' || p.forma === 'debito')).forEach((p) => { const k = `${p.tef_provedor ?? 'Sem maquininha'} · ${rotuloForma(p.forma)}`; maq[k] = (maq[k] ?? 0) + num(p.valor) - num(p.troco) })
    const prod: Record<string, { qtd: number; valor: number }> = {}
    const cat: Record<string, number> = {}
    ativos.filter((i) => idsF.has(i.comanda_id) && i.tipo === 'produto').forEach((i) => {
      prod[i.nome] = { qtd: (prod[i.nome]?.qtd ?? 0) + num(i.qtd), valor: (prod[i.nome]?.valor ?? 0) + i.qtd * i.preco_unit }
      const k = (i.produto_id && catDe[i.produto_id]) || 'Sem categoria'
      cat[k] = (cat[k] ?? 0) + i.qtd * i.preco_unit
    })
    const pessoas = fechadas.reduce((s, c) => s + c.pessoas, 0)
    const soTipo = (t: string) => ativos.filter((i) => idsF.has(i.comanda_id) && i.tipo === t).reduce((s, i) => s + i.qtd * i.preco_unit, 0)
    const couvert = soTipo('couvert')
    const rodizio = soTipo('rodizio')
    const cancel = itens.filter((i) => i.status === 'cancelado')
    const totC = (c: Comanda) => Math.max(0, bruto(c.id) * (1 + c.taxa_servico_pct / 100) - c.desconto)
    const faixas: Record<string, { n: number; v: number; p: number }> = {}
    const dias: Record<string, { n: number; v: number; p: number }> = {}
    const ORD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
    fechadas.forEach((c) => {
      const f = c.pessoas <= 1 ? '1 pessoa' : c.pessoas === 2 ? '2 pessoas' : c.pessoas <= 4 ? '3 a 4 pessoas' : c.pessoas <= 8 ? '5 a 8 pessoas' : '9+ pessoas'
      const d = ORD[new Date(c.aberta_em).getDay()]
      for (const [m, k] of [[faixas, f], [dias, d]] as const) { m[k] ??= { n: 0, v: 0, p: 0 }; m[k].n++; m[k].v += totC(c); m[k].p += c.pessoas }
    })
    // vendas por horário do pedido (itens de produto das comandas fechadas)
    const hv: Record<string, { itens: number; v: number; cmds: Set<string> }> = {}
    ativos.filter((i) => idsF.has(i.comanda_id) && i.tipo === 'produto').forEach((i) => {
      const k = String(new Date(i.criado_em).getHours()).padStart(2, '0') + 'h'
      hv[k] ??= { itens: 0, v: 0, cmds: new Set() }
      hv[k].itens += num(i.qtd); hv[k].v += i.qtd * i.preco_unit; hv[k].cmds.add(i.comanda_id)
    })
    // giro e pessoas por mesa no período (comandas fechadas)
    const pm: Record<string, { giros: number; pessoas: number; v: number; min: number }> = {}
    fechadas.filter((c) => c.mesa_id).forEach((c) => {
      const k = c.mesa_id as string
      pm[k] ??= { giros: 0, pessoas: 0, v: 0, min: 0 }
      pm[k].giros++; pm[k].pessoas += c.pessoas; pm[k].v += totC(c)
      pm[k].min += c.fechada_em ? Math.max(0, (new Date(c.fechada_em).getTime() - new Date(c.aberta_em).getTime()) / 60000) : 0
    })
    return { hv, pm, oper, horas, vendSemFicha, faixas, dias, ORD, mediaPessoas: fechadas.length ? pessoas / fechadas.length : 0, maq, couvert, rodizio, fechadas, abertas, canceladas, fat, servico, porForma, prod, cat, pessoas, cancel, bruto }
  }, [cF, itF, pgF, catDe, operadores, semFicha])

  function csv() {
    const linhas = [['comanda', 'mesa', 'abertura', 'fechamento', 'status', 'pessoas', 'subtotal', 'servico_pct', 'desconto']]
    cF.forEach((c) => linhas.push([String(c.numero), c.mesa_id ? mesas[c.mesa_id]?.numero ?? '' : 'balcao', c.aberta_em, c.fechada_em ?? '', c.status, String(c.pessoas), r.bruto(c.id).toFixed(2), String(c.taxa_servico_pct), String(c.desconto)]))
    const blob = new Blob(['﻿' + linhas.map((l) => l.join(';')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pdv_${de}_${ate}.csv`; a.click()
  }

  async function csvItens() {
    const custo: Record<string, number | null> = {}
    if (verCusto) {
      const f = await db.from('v_fichas_custo').select('id,custo_unitario')
      ;((f.data ?? []) as { id: string; custo_unitario: number | null }[]).forEach((x) => { custo[x.id] = x.custo_unitario })
    }
    const cab = ['data', 'comanda', 'mesa', 'produto', 'categoria', 'qtd', 'preco_unit', 'total', 'status', 'ficha_tecnica']
    if (verCusto) cab.push('custo_unit', 'custo_total', 'margem', 'margem_pct')
    const linhas = [cab]
    const ptv = (n: number) => n.toFixed(2).replace('.', ',')
    itF.forEach((i) => {
      const c = cF.find((x) => x.id === i.comanda_id)
      if (!c) return
      const fid = i.produto_id ? fichaDe[i.produto_id] : null
      const total = i.qtd * i.preco_unit
      const l = [i.criado_em.slice(0, 16).replace('T', ' '), String(c.numero), c.mesa_id ? String(mesas[c.mesa_id]?.numero ?? '') : 'balcao', '"' + i.nome.replace(/"/g, '""') + '"', (i.produto_id && catDe[i.produto_id]) || 'Sem categoria', String(i.qtd), ptv(i.preco_unit), ptv(total), i.status, fid ? 'sim' : 'nao']
      if (verCusto) {
        const cu = fid ? custo[fid] : null
        if (cu != null) { const ct = cu * i.qtd; l.push(ptv(cu), ptv(ct), ptv(total - ct), total > 0 ? ptv(((total - ct) / total) * 100) : '') } else l.push('', '', '', '')
      }
      linhas.push(l)
    })
    const blob = new Blob(['\ufeff' + linhas.map((l) => l.join(';')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pdv_itens_${de}_${ate}.csv`; a.click()
  }

  const topProd = Object.entries(r.prod).sort((a, b) => b[1].valor - a[1].valor).slice(0, 15)
  return (
    <div>
      <Cabecalho titulo="Relatório de vendas" subtitulo={`${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`}
        acoes={<><button className={btnSecCls} onClick={csv}>CSV comandas</button><button className={btnSecCls} onClick={csvItens}>CSV itens{verCusto ? ' + custo' : ''}</button></>} />
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <button className={btnSecCls} onClick={() => { setDe(hojeISO()); setAte(hojeISO()) }}>Hoje</button>
        <button className={btnSecCls} onClick={() => { setDe(soma(hojeISO(), -1)); setAte(soma(hojeISO(), -1)) }}>Ontem</button>
        <button className={btnSecCls} onClick={() => { setDe(soma(hojeISO(), -6)); setAte(hojeISO()) }}>7 dias</button>
        <button className={btnSecCls} onClick={() => { setDe(soma(hojeISO(), -29)); setAte(hojeISO()) }}>30 dias</button>
        <input type="date" className={inputCls + ' !w-auto'} value={de} onChange={(e) => setDe(e.target.value)} />
        <input type="date" className={inputCls + ' !w-auto'} value={ate} onChange={(e) => setAte(e.target.value)} />
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <div className="relative">
          <input className={inputCls + ' !pr-10'} type="search" placeholder="Buscar cliente (nome, telefone ou nº da comanda)" value={fCliente} onChange={(e) => setFCliente(e.target.value)} />
          {fCliente && <button aria-label="Limpar" className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-xl text-ink-soft" onClick={() => setFCliente('')}>×</button>}
        </div>
        <div className="flex gap-2">
          <select className={inputCls + ' !w-auto'} value={fPapel} onChange={(e) => setFPapel(e.target.value as typeof fPapel)} aria-label="Operação">
            <option value="qualquer">Qualquer operação</option>
            <option value="abriu">Abriu a comanda (check-in)</option>
            <option value="lancou">Lançou produto</option>
            <option value="fechou">Fechou a conta</option>
          </select>
          <select className={inputCls + ' !w-auto'} value={fUser} onChange={(e) => setFUser(e.target.value)} aria-label="Usuário">
            <option value="">Todos os usuários</option>
            {usuariosNoPeriodo.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <button className={chipCls(soCancel)} aria-pressed={soCancel} onClick={() => setSoCancel(!soCancel)}>Só com cancelamento</button>
      </div>
      {(fCliente || fUser || soCancel) && <p className="mb-3 text-sm text-ink-soft">Filtrado: {cF.length} de {comandas.length} comanda(s) no período.</p>}
      {erro && <Erro texto={erro} />}
      <div className="mb-4 flex gap-2">
        <button className={chipCls(aba === 'vendas')} onClick={() => setAba('vendas')}>Vendas</button>
        <button className={chipCls(aba === 'estoque')} onClick={() => setAba('estoque')}>Estoque (baixa automática)</button>
        <Link to="/pdv/consumo" className={chipCls(false)}>Consumo de funcionários</Link>
      </div>
      {!pronto ? <Carregando /> : aba === 'estoque' ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-brand-soft px-4 py-3 text-sm">Cada item vendido no PDV baixa o estoque pelos insumos da ficha técnica{corte ? ` (vale desde ${corte.split('-').reverse().join('/')})` : ''}. O saldo e os alertas de mínimo estão em <Link className="font-semibold text-brand underline" to="/estoque/alertas">Alertas de estoque</Link>.</p>
          <Bloco t="Consumo de insumos pelas vendas (inclui consumo de funcionários)">
            {[...cons].map((c) => ({ c, i: insumos[c.insumo_id] })).filter((x) => x.i).sort((a, b) => num(b.c.quantidade) * num(b.i.preco) - num(a.c.quantidade) * num(a.i.preco) || b.c.quantidade - a.c.quantidade).slice(0, 80).map(({ c, i }) => (
              <Linha key={c.insumo_id} a={i.nome} b={`${numero(num(c.quantidade))} ${i.unidade}${num(i.preco) > 0 ? ` · ${reais(num(c.quantidade) * num(i.preco))}` : ''}`} />
            ))}
            {!cons.length && <p className="text-sm text-ink-soft">Nenhum consumo no período (a baixa só conta vendas a partir da data de corte).</p>}
          </Bloco>
          {Object.keys(r.vendSemFicha).length > 0 && (
            <Bloco t="Vendidos sem ficha técnica (não baixam estoque)">
              {Object.entries(r.vendSemFicha).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Linha key={k} a={k} b={`${numero(v)} un.`} />)}
            </Bloco>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi t="Faturamento" v={reais(r.fat)} />
            <Kpi t="Comandas fechadas" v={String(r.fechadas.length)} />
            <Kpi t="Ticket médio" v={reais(r.fechadas.length ? r.fat / r.fechadas.length : 0)} />
            <Kpi t="Por pessoa" v={reais(r.pessoas ? r.fat / r.pessoas : 0)} />
            <Kpi t="Pessoas por comanda" v={r.mediaPessoas.toFixed(1).replace('.', ',')} />
            <Kpi t="Serviço (taxa)" v={reais(r.servico)} />
            <Kpi t="Couvert artístico" v={reais(r.couvert)} />
            <Kpi t="Rodízio" v={reais(r.rodizio)} />
            <Kpi t="Mesas abertas agora" v={String(r.abertas.length)} />
            <Kpi t="Comandas canceladas" v={String(r.canceladas.length)} />
            <Kpi t="Itens cancelados" v={String(r.cancel.length)} />
          </div>
          {internas > 0 && <p className="mb-4 text-xs text-ink-soft">Fora do faturamento: {internas} comanda(s) de consumo interno / família (e o consumo de funcionários, que fica na tela própria).</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Bloco t="Por forma de pagamento">
              {FORMAS.map((f) => <Linha key={f.v} a={rotuloForma(f.v)} b={reais(r.porForma[f.v] ?? 0)} />)}
              {(['a_receber', 'cortesia', 'folha'] as const).filter((k) => (r.porForma[k] ?? 0) > 0).map((k) => <Linha key={k} a={rotuloForma(k)} b={reais(r.porForma[k])} />)}
            </Bloco>
            <Bloco t="Recebido por operador de caixa">
              {Object.entries(r.oper).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Linha key={k} a={k} b={reais(v)} />)}
              {!Object.keys(r.oper).length && <p className="text-sm text-ink-soft">Sem recebimentos.</p>}
            </Bloco>
            <Bloco t="Vendas por horário (hora do pedido)">
              {(() => {
                const ent = Object.entries(r.hv).sort(), max = Math.max(1, ...ent.map(([, x]) => x.v))
                return ent.map(([k, x]) => (
                  <div key={k} className="py-1 text-sm">
                    <div className="flex justify-between"><span><b>{k}</b> · {x.itens} item(ns) · {x.cmds.size} comanda(s)</span><b>{reais(x.v)}</b></div>
                    <div className="mt-0.5 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${(x.v / max) * 100}%` }} /></div>
                  </div>
                ))
              })()}
              {!Object.keys(r.hv).length && <p className="text-sm text-ink-soft">Sem vendas no período.</p>}
            </Bloco>
            <Bloco t="Pessoas por mesa no período">
              {Object.entries(r.pm).sort((a, b) => b[1].pessoas - a[1].pessoas).map(([id, x]) => (
                <Linha key={id} a={`Mesa ${mesas[id]?.numero ?? '?'} · ${x.giros} giro(s) · ${x.pessoas} pessoa(s)`} b={`${reais(x.v)} · ${Math.round(x.min / Math.max(1, x.giros))} min/giro`} />
              ))}
              {!Object.keys(r.pm).length && <p className="text-sm text-ink-soft">Sem mesas fechadas no período.</p>}
            </Bloco>
            <Bloco t="Faturamento por hora de abertura">
              {Object.entries(r.horas).sort().map(([k, v]) => <Linha key={k} a={k} b={reais(v)} />)}
              {!Object.keys(r.horas).length && <p className="text-sm text-ink-soft">Sem comandas fechadas.</p>}
            </Bloco>
            <Bloco t="Cartão por maquininha (conferir com Sipag e Rede)">
              {Object.entries(r.maq).sort().map(([k, v]) => <Linha key={k} a={k} b={reais(v)} />)}
              {!Object.keys(r.maq).length && <p className="text-sm text-ink-soft">Sem pagamentos em cartão.</p>}
            </Bloco>
            <Bloco t="Ticket médio por tamanho do grupo">
              {Object.entries(r.faixas).sort().map(([k, v]) => <Linha key={k} a={`${k} · ${v.n} comanda(s)`} b={`${reais(v.v / v.n)} · ${reais(v.v / Math.max(1, v.p))}/pessoa`} />)}
              {!Object.keys(r.faixas).length && <p className="text-sm text-ink-soft">Sem comandas fechadas.</p>}
            </Bloco>
            <Bloco t="Ticket médio por dia da semana">
              {r.ORD.filter((d) => r.dias[d]).map((d) => <Linha key={d} a={`${d} · ${r.dias[d].n} comanda(s)`} b={`${reais(r.dias[d].v / r.dias[d].n)} · ${reais(r.dias[d].v / Math.max(1, r.dias[d].p))}/pessoa`} />)}
              {!Object.keys(r.dias).length && <p className="text-sm text-ink-soft">Sem comandas fechadas.</p>}
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
              {!cF.length ? <Vazio texto="Nenhuma comanda." /> : cF.slice().reverse().slice(0, 40).map((c) => (
                <Linha key={c.id} a={`#${c.numero} · ${c.mesa_id ? 'mesa ' + (mesas[c.mesa_id]?.numero ?? '?') : 'balcão'} · ${c.pessoas} pes. · ${hora(c.aberta_em)} · ${c.status}`} b={reais(r.bruto(c.id) * (1 + c.taxa_servico_pct / 100) - c.desconto)} />
              ))}
            </Bloco>
            <Bloco t="Itens lançados por usuário">
              {(() => {
                const m: Record<string, { n: number; v: number; c: number }> = {}
                itF.filter((i) => i.tipo === 'produto').forEach((i) => {
                  const k = operadores[(i as unknown as { criado_por?: string }).criado_por ?? ''] ?? 'Sistema / tablet'
                  m[k] ??= { n: 0, v: 0, c: 0 }
                  if (i.status === 'cancelado') m[k].c += num(i.qtd)
                  else { m[k].n += num(i.qtd); m[k].v += i.qtd * i.preco_unit }
                })
                const ent = Object.entries(m).sort((a, b) => b[1].v - a[1].v)
                return ent.length ? ent.map(([k, x]) => <Linha key={k} a={`${k} · ${x.n} item(ns)${x.c ? ` · ${x.c} cancelado(s)` : ''}`} b={reais(x.v)} />) : <p className="text-sm text-ink-soft">Sem itens.</p>
              })()}
            </Bloco>
            {(r.cancel.length > 0 || r.canceladas.length > 0) && (
              <div className="lg:col-span-2"><Bloco t={`Cancelamentos (${r.cancel.length} item(ns), ${r.canceladas.length} comanda(s))`}>
                {r.cancel.map((i) => {
                  const c = cF.find((x) => x.id === i.comanda_id)
                  const a = aprovs.find((x) => x.item_id === i.id)
                  const mot = (i as unknown as { cancelado_motivo?: string }).cancelado_motivo ?? a?.motivo
                  return (
                    <div key={i.id} className="py-2 text-sm">
                      <div className="flex justify-between gap-3"><span><b>{i.qtd}× {i.nome}</b> · #{c?.numero} {c?.mesa_id ? 'mesa ' + (mesas[c.mesa_id]?.numero ?? '?') : 'balcão'}{c?.nome_cliente ? ` · ${c.nome_cliente}` : ''}</span><b className="shrink-0">{reais(i.qtd * i.preco_unit)}</b></div>
                      <div className="text-xs text-ink-soft">Motivo: {mot || 'não informado'}{a ? ` · pedido por ${operadores[a.solicitado_por ?? ''] ?? '—'} · aprovado por ${operadores[a.aprovado_por ?? ''] ?? '—'} · ${hora(a.criado_em)}` : ' · sem registro de aprovação (anterior ao controle)'}</div>
                    </div>
                  )
                })}
                {r.canceladas.map((c) => {
                  const a = aprovs.find((x) => x.acao === 'cancelar_comanda' && x.comanda_id === c.id)
                  return (
                    <div key={c.id} className="py-2 text-sm">
                      <div className="flex justify-between gap-3"><span><b>Comanda #{c.numero} cancelada</b> · {c.mesa_id ? 'mesa ' + (mesas[c.mesa_id]?.numero ?? '?') : 'balcão'}{c.nome_cliente ? ` · ${c.nome_cliente}` : ''}</span><b className="shrink-0">{reais(itF.filter((i) => i.comanda_id === c.id).reduce((t, i) => t + i.qtd * i.preco_unit, 0))}</b></div>
                      <div className="text-xs text-ink-soft">{a ? `Motivo: ${a.motivo ?? '—'} · pedido por ${operadores[a.solicitado_por ?? ''] ?? '—'} · aprovado por ${operadores[a.aprovado_por ?? ''] ?? '—'} · ${hora(a.criado_em)}` : 'sem registro de aprovação (anterior ao controle)'}</div>
                    </div>
                  )
                })}
              </Bloco></div>
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
