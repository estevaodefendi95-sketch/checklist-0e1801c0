import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, supabase } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais, lerNumero } from '../../lib/formato'
import {
  Categoria, Comanda as TComanda, FORMAS, Item, Mesa, Produto, Sessao, Totais, enfileirar, hora, num, rotuloForma, useAoVivo,
} from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'
import { PerfisCheckin, usePerfisCobrancas } from './PerfisCheckin'
import { Modal } from './PdvCaixa'
import { Grupo, Opcao } from './ConfigCardapio'
import { EmitirFiscal } from './FiscalRapido'
import { AprovacaoAdmin, AcaoAprovada } from '../../components/AprovacaoAdmin'
import { cacheGravar, cacheLer, enfileirarPedido, erroDeRede, useFila } from '../../lib/offline'

interface Pag { tef_provedor: string | null; id: string; forma: string; valor: number; troco: number; tef_status: string | null; tef_nsu: string | null; estornado: boolean; criado_em: string }

const ST_COR: Record<string, string> = {
  enviado: 'bg-brand-soft text-brand', preparando: 'bg-amber-100 text-amber-800', pronto: 'bg-emerald-100 text-emerald-800',
  entregue: 'bg-surface text-ink-soft', cancelado: 'bg-alert-soft text-alert line-through',
}

export function Comanda() {
  const { id } = useParams()
  const nav = useNavigate()
  const { pode } = usePermissoes()
  const [c, setC] = useState<TComanda | null>(null)
  const [mesa, setMesa] = useState<Mesa | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [pags, setPags] = useState<Pag[]>([])
  const [tot, setTot] = useState<Totais | null>(null)
  const [cats, setCats] = useState<Categoria[]>([])
  const [prods, setProds] = useState<Produto[]>([])
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [func, setFunc] = useState<{ nome: string; pct: number } | null>(null)
  const [cat, setCat] = useState<string>('todas')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [fim, setFim] = useState(false)
  const [carrinho, setCarrinho] = useState<{ p: Produto; qtd: number; obs: string; opcoes: Opcao[] }[]>([])
  const [grupos, setGrupos] = useState<(Grupo & { opcoes: Opcao[]; produtos: string[] })[]>([])
  const [esc, setEsc] = useState<{ p: Produto; sel: Record<string, string[]> } | null>(null)
  const [pessoasEd, setPessoasEd] = useState<string | null>(null)
  const [fiscalFim, setFiscalFim] = useState(false)
  const [aba, setAba] = useState<'pedido' | 'pagamento'>('pedido')
  const [forma, setForma] = useState<string>('credito')
  const [valor, setValor] = useState('')
  const [nsu, setNsu] = useState('')
  const [maq, setMaq] = useState(() => { try { return localStorage.getItem('pdv-maquininha') || 'Sipag' } catch { return 'Sipag' } })
  const [recebido, setRecebido] = useState('')
  const [editPerfis, setEditPerfis] = useState<Record<string, number> | null>(null)
  const [selCob, setSelCob] = useState<string[]>([])
  const { perfis, cobrancas } = usePerfisCobrancas()
  const fila = useFila().filter((p) => p.comanda_id === id)
  const [offline, setOffline] = useState(false)
  const [aprov, setAprov] = useState<{ titulo: string; descricao?: string; acao: AcaoAprovada; id: string; pedirMotivo: boolean; depois?: () => void } | null>(null)

  const carregar = useCallback(async () => {
    if (!id) return
    const [cm, it, pg, tt, ct, pr, ss, gr, op, pgr] = await Promise.all([
      db.from('pdv_comandas').select('*').eq('id', id).single(),
      db.from('pdv_pedido_itens').select('*').eq('comanda_id', id).order('criado_em'),
      db.from('pdv_pagamentos').select('*').eq('comanda_id', id).order('criado_em'),
      db.from('pdv_comanda_totais').select('*').eq('comanda_id', id).single(),
      db.from('pdv_categorias').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_produtos').select('*').eq('ativo', true).order('ordem').order('nome'),
      db.from('pdv_caixa_sessoes').select('*').eq('status', 'aberto'),
      db.from('pdv_grupos_opcoes').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_opcoes').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_produto_grupos').select('produto_id,grupo_id,ordem').order('ordem'),
    ])
    if (cm.error) {
      const ch = cacheLer<any>('comanda:' + id)
      if (ch && erroDeRede(cm.error)) {
        const v = ch.v
        setOffline(true); setC(v.c); setMesa(v.mesa); setItens(v.itens); setTot(v.tot); setPags(v.pags)
        setCats(v.cats); setProds(v.prods); setGrupos(v.grupos); setSessao(v.sessao); setFunc(v.func); setFim(true)
        return
      }
      return setErro(cm.error.message)
    }
    setOffline(false)
    const cmd = cm.data as TComanda
    setC(cmd)
    if (cmd.mesa_id) setMesa(((await db.from('pdv_mesas').select('*').eq('id', cmd.mesa_id).single()).data as Mesa) ?? null)
    setItens((it.data ?? []) as Item[])
    setPags((pg.data ?? []) as Pag[])
    setTot(tt.data as Totais)
    setCats((ct.data ?? []) as Categoria[])
    setProds((pr.data ?? []) as Produto[])
    const uid = (await supabase.auth.getUser()).data.user?.id
    setSessao(((ss.data ?? []) as Sessao[]).find((x) => x.aberto_por === uid) ?? null)
    if (cmd.funcionario_id) {
      const [fu, cf] = await Promise.all([db.from('pdv_funcionarios').select('nome').eq('id', cmd.funcionario_id).maybeSingle(), db.from('pdv_config').select('consumo_func_desconto_pct').eq('id', 1).maybeSingle()])
      setFunc({ nome: fu.data?.nome ?? 'Funcionário', pct: num(cf.data?.consumo_func_desconto_pct ?? 100) })
    } else setFunc(null)
    const gruposCarregados = ((gr.data ?? []) as Grupo[]).map((g) => ({
      ...g, opcoes: ((op.data ?? []) as Opcao[]).filter((o) => o.grupo_id === g.id),
      produtos: ((pgr.data ?? []) as { produto_id: string; grupo_id: string }[]).filter((x) => x.grupo_id === g.id).map((x) => x.produto_id),
    }))
    setGrupos(gruposCarregados)
    cacheGravar('comanda:' + id, {
      c: cmd, mesa: ((cmd.mesa_id && (await db.from('pdv_mesas').select('*').eq('id', cmd.mesa_id).single()).data) as Mesa) ?? null,
      itens: it.data ?? [], tot: tt.data, pags: pg.data ?? [], cats: ct.data ?? [], prods: pr.data ?? [], grupos: gruposCarregados,
      sessao: ((ss.data ?? []) as Sessao[]).find((x) => x.aberto_por === uid) ?? null, func: null,
    })
    setFim(true)
  }, [id])
  useAoVivo(['pdv_pedido_itens', 'pdv_pagamentos', 'pdv_comandas'], carregar, 10000)

  const aberta = c && (c.status === 'aberta' || c.status === 'pedindo_conta')
  const restante = Math.max(0, num(tot?.total) - num(tot?.pago))
  const lista = useMemo(() => {
    const q = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return prods.filter(
      (p) =>
        p.disponivel &&
        (cat === 'todas' || p.categoria_id === cat) &&
        (!q || p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
    )
  }, [prods, cat, busca])

  const gruposDe = (p: Produto) => grupos.filter((g) => g.produtos.includes(p.id) && g.opcoes.length)
  function add(p: Produto) {
    if (gruposDe(p).length) return setEsc({ p, sel: {} })
    setCarrinho((cs) => {
      const i = cs.findIndex((x) => x.p.id === p.id && !x.obs && !x.opcoes.length)
      if (i >= 0) return cs.map((x, k) => (k === i ? { ...x, qtd: x.qtd + 1 } : x))
      return [...cs, { p, qtd: 1, obs: '', opcoes: [] }]
    })
  }
  function toggleOpc(g: Grupo & { opcoes: Opcao[] }, o: Opcao) {
    setEsc((x) => {
      if (!x) return x
      const at = x.sel[g.id] ?? []
      const novo = at.includes(o.id) ? at.filter((i) => i !== o.id) : g.max_escolhas === 1 ? [o.id] : at.length < g.max_escolhas ? [...at, o.id] : at
      return { ...x, sel: { ...x.sel, [g.id]: novo } }
    })
  }
  function confirmarEsc() {
    if (!esc) return
    for (const g of gruposDe(esc.p)) if ((esc.sel[g.id]?.length ?? 0) < g.min_escolhas) return setErro(`Escolha "${g.nome}" (mínimo ${g.min_escolhas}).`)
    const ops = gruposDe(esc.p).flatMap((g) => g.opcoes.filter((o) => (esc.sel[g.id] ?? []).includes(o.id)))
    setCarrinho((cs) => [...cs, { p: esc.p, qtd: 1, obs: '', opcoes: ops }])
    setEsc(null); setErro('')
  }
  const precoLinha = (x: { p: Produto; opcoes: Opcao[] }) => Number(x.p.preco) + x.opcoes.reduce((s, o) => s + Number(o.preco_adicional), 0)
  async function enviar() {
    if (!c || !carrinho.length) return
    setErro('')
    const uid = ((await supabase.auth.getSession()).data.session?.user.id) ?? undefined
    const linhas = carrinho.map((x) => ({
      comanda_id: c.id, produto_id: x.p.id, nome: x.p.nome, qtd: x.qtd, preco_unit: precoLinha(x),
      opcoes: x.opcoes.map((o) => ({ id: o.id, nome: o.nome, preco: Number(o.preco_adicional) })), obs: x.obs.trim() || null, destino: x.p.destino, origem: 'sistema', criado_por: uid,
    }))
    const guardar = () => {
      enfileirarPedido(c.id, linhas)
      setCarrinho([])
      setMsg('Sem conexão: pedido guardado no aparelho. Ele vai para a cozinha sozinho quando a internet voltar.')
    }
    if (!navigator.onLine) return guardar()
    const { error } = await db.from('pdv_pedido_itens').insert(linhas)
    if (error) {
      if (erroDeRede(error)) return guardar()
      return setErro(error.message)
    }
    setCarrinho([])
    setMsg('Pedido enviado para as impressoras.')
    carregar()
  }
  function cancelarItem(i: Item) {
    if (semRede()) return
    setAprov({ titulo: `Cancelar "${i.nome}"`, descricao: `${i.qtd}× ${i.nome}. Só um administrador pode aprovar.`, acao: 'cancelar_item', id: i.id, pedirMotivo: true })
  }
  async function statusItem(i: Item, status: Item['status']) {
    await db.from('pdv_pedido_itens').update({ status }).eq('id', i.id)
    carregar()
  }
  const semRede = () => (offline || !navigator.onLine) && (setErro('Sem conexão: esta ação precisa de internet.'), true)
  async function pedirConta() {
    if (!c || !tot || semRede()) return
    const ativos = itens.filter((i) => i.status !== 'cancelado')
    const r = await enfileirar(db, 'caixa', 'conta', {
      mesa: mesa?.numero ?? 'Balcão', comanda: c.numero, cliente: c.nome_cliente, pessoas: c.pessoas,
      itens: ativos.map((i) => ({ nome: i.nome, qtd: i.qtd, preco: i.preco_unit })),
      subtotal: tot.subtotal, servico: tot.servico, desconto: c.desconto, total: tot.total,
      taxa_servico_pct: c.taxa_servico_pct, por_pessoa: c.pessoas > 1 ? Math.round((num(tot.total) / c.pessoas) * 100) / 100 : null,
    }, c.id)
    await db.from('pdv_comandas').update({ status: 'pedindo_conta' }).eq('id', c.id)
    setErro(r.erro ?? '')
    if (!r.erro) setMsg('Pré-conta enviada à impressora do caixa.')
    carregar()
  }
  const fail = (m: string) => { setErro(m); return false }
  async function pagar(restanteTudo = false): Promise<boolean> {
    if (!c) return false
    if (semRede()) return false
    if (!sessao) return fail('Abra o seu caixa do dia antes de receber pagamentos (PDV · Caixa).')
    const v = restanteTudo ? restante : lerNumero(valor || String(restante))
    if (!v || v <= 0) return fail('Informe o valor.')
    let troco = 0
    let aplicado = v
    if (forma === 'dinheiro') {
      const rec = lerNumero(recebido || String(v)) ?? v
      aplicado = Math.min(v, restante)
      troco = Math.max(0, rec - aplicado)
      if (rec < aplicado) return fail('Valor recebido menor que o valor a pagar.')
    } else if (v > restante + 0.005) return fail('Valor acima do restante da conta.')
    const cartao = forma === 'credito' || forma === 'debito'
    const { error } = await db.from('pdv_pagamentos').insert({
      comanda_id: c.id, sessao_id: sessao.id, forma, valor: forma === 'dinheiro' ? aplicado + troco : aplicado, troco,
      tef_provedor: cartao ? maq : null, tef_status: cartao ? 'aprovado' : null, tef_nsu: nsu.trim() || null,
      user_id: (await supabase.auth.getUser()).data.user?.id,
    })
    if (error) return fail(error.message)
    setValor(''); setNsu(''); setRecebido(''); setErro('')
    if (troco > 0) setMsg(`Troco: ${reais(troco)}`)
    carregar()
    return true
  }
  function estornar(p: Pag) {
    if (semRede()) return
    setAprov({ titulo: 'Estornar pagamento', descricao: `${rotuloForma(p.forma)} de ${reais(p.valor - p.troco)}. Só um administrador pode aprovar.`, acao: 'estornar', id: p.id, pedirMotivo: false })
  }
  async function fechar() {
    if (!c) return
    if (restante > 0.005) {
      // falta receber: oferece registrar o restante na forma de pagamento escolhida e fechar de uma vez
      if (!sessao) return setErro('Abra o seu caixa do dia antes de receber (PDV · Caixa).')
      if (!window.confirm(`Falta receber ${reais(restante)}.\nRegistrar ${reais(restante)} em ${rotuloForma(forma)} e fechar a comanda?`)) return
      setValor(String(restante).replace('.', ','))
      const ok = await pagar(true)
      if (!ok) return
    }
    if (itens.some((i) => i.status !== 'cancelado') === false && !window.confirm('Comanda sem itens. Fechar mesmo assim?')) return
    const { error } = await db.from('pdv_comandas').update({ status: 'fechada', fechada_em: new Date().toISOString(), sessao_id: sessao?.id ?? null }).eq('id', c.id)
    if (error) return setErro(error.message)
    // Conta fechada: abre a emissão rápida do cupom fiscal (CPF/CNPJ do cliente ou sem identificação)
    const { data: fc } = await db.from('pdv_fiscal_config').select('ativo').maybeSingle()
    if (fc?.ativo && pode('pdv_caixa')) { setFiscalFim(true); carregar(); return }
    nav('/pdv')
  }
  async function finalizarConsumo() {
    if (!c || !func) return
    const sub = num(tot?.subtotal)
    if (sub <= 0) return setErro('Comanda sem itens.')
    const desc = Math.round(sub * func.pct) / 100
    const folha = Math.round((sub - desc) * 100) / 100
    if (!window.confirm(`Finalizar consumo de ${func.nome}?\nValor de tabela ${reais(sub)} · desconto ${reais(desc)}${folha > 0 ? ` · a descontar em folha ${reais(folha)}` : ''}`)) return
    const e1 = await db.from('pdv_comandas').update({ desconto: desc, taxa_servico_pct: 0 }).eq('id', c.id)
    if (e1.error) return setErro(e1.error.message)
    if (folha > 0) {
      const e2 = await db.from('pdv_pagamentos').insert({ comanda_id: c.id, sessao_id: sessao?.id ?? null, forma: 'folha', valor: folha, troco: 0, user_id: (await supabase.auth.getUser()).data.user?.id })
      if (e2.error) return setErro(e2.error.message)
    }
    const e3 = await db.from('pdv_comandas').update({ status: 'fechada', fechada_em: new Date().toISOString(), sessao_id: sessao?.id ?? null }).eq('id', c.id)
    if (e3.error) return setErro(e3.error.message)
    nav('/pdv/consumo')
  }
  function cancelarComanda() {
    if (!c || semRede()) return
    if (pags.some((p) => !p.estornado)) return setErro('Estorne os pagamentos antes de cancelar.')
    setAprov({ titulo: `Cancelar a comanda ${c.numero}`, descricao: 'Todos os itens serão cancelados. Só um administrador pode aprovar.', acao: 'cancelar_comanda', id: c.id, pedirMotivo: true, depois: () => nav('/pdv') })
  }
  async function salvarPessoas() {
    if (!c || pessoasEd == null) return
    const n = Math.min(500, Math.max(1, Math.floor(Number(pessoasEd) || 0)))
    const { error } = await db.from('pdv_comandas').update({ pessoas: n }).eq('id', c.id)
    if (error) return setErro(error.message)
    setPessoasEd(null); setErro(''); carregar()
  }
  async function abrirPerfis() {
    const { data } = await db.from('pdv_comanda_perfis').select('perfil_id,qtd').eq('comanda_id', id)
    const { data: ja } = await db.from('pdv_pedido_itens').select('cobranca_id').eq('comanda_id', id).in('tipo', ['couvert', 'rodizio']).neq('status', 'cancelado')
    setSelCob([...new Set((ja ?? []).map((x: { cobranca_id: string | null }) => x.cobranca_id).filter(Boolean) as string[])])
    setEditPerfis(Object.fromEntries((data ?? []).map((x: { perfil_id: string; qtd: number }) => [x.perfil_id, x.qtd])))
  }
  async function salvarPerfis() {
    if (!c || !editPerfis) return
    const r = await db.rpc('pdv_aplicar_perfis', { p_comanda: c.id, p_perfis: Object.entries(editPerfis).map(([perfil_id, qtd]) => ({ perfil_id, qtd })), p_cobrancas: selCob })
    if (r.error) return setErro(r.error.message)
    setEditPerfis(null); setErro(''); carregar()
  }
  async function ajusteConta(campo: 'desconto' | 'taxa_servico_pct') {
    if (!c) return
    const t = window.prompt(campo === 'desconto' ? 'Desconto em R$:' : 'Serviço em % (0 para retirar):', String(campo === 'desconto' ? c.desconto : c.taxa_servico_pct))
    const v = t == null ? null : lerNumero(t)
    if (v == null || v < 0) return
    await db.from('pdv_comandas').update({ [campo]: v }).eq('id', c.id)
    carregar()
  }

  if (!fim) return erro ? <Erro texto={erro} /> : <Carregando />
  if (!c) return <Vazio texto="Comanda não encontrada." />
  const qtdCarrinho = carrinho.reduce((s, x) => s + x.qtd, 0)
  const totCarrinho = carrinho.reduce((s, x) => s + x.qtd * precoLinha(x), 0)

  return (
    <div>
      <Cabecalho
        voltar={{ para: '/pdv', rotulo: 'Salão' }}
        titulo={`${mesa ? `Mesa ${mesa.numero}` : 'Balcão'} · #${c.numero}`}
        subtitulo={`${func ? `Consumo de ${func.nome}` : c.nome_cliente ?? 'Sem nome'} · ${c.pessoas} pessoa(s)${c.pessoas > 0 && num(tot?.total) > 0 ? ` (${reais(num(tot?.total) / c.pessoas)} por pessoa)` : ''} · aberta às ${hora(c.aberta_em)}${c.status === 'pedindo_conta' ? ' · PEDIU A CONTA' : ''}${!aberta ? ` · ${c.status.toUpperCase()}` : ''}`}
      />
      {aba === 'pedido' && aberta && qtdCarrinho > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 flex gap-2 px-3 lg:hidden">
          <button className={btnSecCls + ' !bg-surface shadow-lg'} onClick={() => document.getElementById('resumo-comanda')?.scrollIntoView({ behavior: 'smooth' })}>Revisar</button>
          <button className={btnCls + ' flex-1 shadow-lg'} onClick={enviar}>Enviar {qtdCarrinho} {qtdCarrinho === 1 ? 'item' : 'itens'} · {reais(totCarrinho)}</button>
        </div>
      )}
      {erro && <Erro texto={erro} />}
      {aprov && (
        <AprovacaoAdmin titulo={aprov.titulo} descricao={aprov.descricao} acao={aprov.acao} id={aprov.id} pedirMotivo={aprov.pedirMotivo}
          onFechar={() => setAprov(null)} onOk={() => { const d = aprov.depois; setAprov(null); setMsg('Aprovado pelo administrador.'); if (d) d(); else carregar() }} />
      )}
      {offline && <p className="mb-3 rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-900">Mostrando a última versão salva desta comanda. Você pode lançar pedidos; pagamento e fechamento precisam de internet.</p>}
      {fila.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <b>Aguardando conexão ({fila.reduce((n, p) => n + p.linhas.length, 0)} item/itens):</b>{' '}
          {fila.flatMap((p) => p.linhas).map((l) => `${l.qtd}× ${l.nome}`).join(', ')}
        </div>
      )}
      {msg && <p className="mb-3 rounded-xl bg-brand-soft px-4 py-2 text-sm text-brand" onClick={() => setMsg('')}>{msg}</p>}

      <div className="mb-4 flex gap-2">
        <button className={aba === 'pedido' ? btnCls : btnSecCls} onClick={() => setAba('pedido')}>Pedido</button>
        <button className={aba === 'pagamento' ? btnCls : btnSecCls} onClick={() => setAba('pagamento')}>Conta e pagamento</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {aba === 'pedido' && aberta ? (
          <section>
            <div className="sticky top-0 z-10 -mx-4 mb-3 bg-paper px-4 pb-1 pt-1 md:-mx-6 md:px-6 lg:static lg:mx-0 lg:p-0">
            <input className={`${inputCls} mb-2`} placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button className={cat === 'todas' ? btnCls : btnSecCls} onClick={() => setCat('todas')}>Todas</button>
              {cats.map((k) => (
                <button key={k.id} className={(cat === k.id ? btnCls : btnSecCls) + ' shrink-0 whitespace-nowrap'} onClick={() => setCat(k.id)}>{k.nome}</button>
              ))}
            </div>
            </div>
            {!lista.length ? (
              <Vazio texto="Nenhum produto. Cadastre em PDV · Configurações › Produtos." />
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {lista.map((p) => (
                  <button key={p.id} onClick={() => add(p)} className={`${cartaoCls} relative min-h-[88px] p-3 text-left active:scale-[0.98] ${carrinho.some((x) => x.p.id === p.id) ? 'ring-2 ring-brand' : ''}`}>
                    {carrinho.some((x) => x.p.id === p.id) && <span className="absolute right-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold text-brand-ink">{carrinho.filter((x) => x.p.id === p.id).reduce((a, x) => a + x.qtd, 0)}</span>}
                    <div className="pr-6 text-sm font-semibold leading-tight">{p.nome}</div>
                    <div className="mt-1 text-sm text-brand">{reais(p.preco)}</div>
                    <div className="text-[11px] uppercase text-ink-soft">{p.destino}{gruposDe(p).length ? ' · opções' : ''}</div>
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : aba === 'pagamento' && c.funcionario_id ? (
          <section className={`${cartaoCls} space-y-3 p-4`}>
            <h2 className="font-semibold">Consumo de funcionário</h2>
            <p className="text-sm text-ink-soft">{func?.nome}: {func?.pct ?? 100}% de desconto sobre o valor de tabela. Não entra no caixa nem na nota fiscal.</p>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt>Valor de tabela</dt><dd>{reais(num(tot?.subtotal))}</dd></div>
              <div className="flex justify-between"><dt>Desconto ({func?.pct ?? 100}%)</dt><dd>− {reais(num(tot?.subtotal) * (func?.pct ?? 100) / 100)}</dd></div>
              <div className="flex justify-between font-semibold"><dt>A descontar em folha</dt><dd>{reais(num(tot?.subtotal) - num(tot?.subtotal) * (func?.pct ?? 100) / 100)}</dd></div>
            </dl>
            {aberta && <button className={btnCls} onClick={finalizarConsumo}>Finalizar consumo</button>}
          </section>
        ) : aba === 'pagamento' ? (
          <section className={`${cartaoCls} space-y-3 p-4`}>
            <h2 className="font-semibold">Receber</h2>
            {aberta ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {FORMAS.map((f) => (
                    <button key={f.v} className={forma === f.v ? btnCls : btnSecCls} onClick={() => setForma(f.v)}>{f.r}</button>
                  ))}
                </div>
                <label className="block text-sm">Valor (restante {reais(restante)})
                  <input className={inputCls} inputMode="decimal" placeholder={restante.toFixed(2).replace('.', ',')} value={valor} onChange={(e) => setValor(e.target.value)} />
                </label>
                {forma === 'dinheiro' && (
                  <label className="block text-sm">Valor recebido
                    <input className={inputCls} inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} />
                  </label>
                )}
                {(forma === 'credito' || forma === 'debito') && (
                  <div className="flex gap-2">
                    {['Sipag', 'Rede', 'Outra'].map((m) => (
                      <button key={m} type="button" className={maq === m ? btnCls : btnSecCls} onClick={() => { setMaq(m); try { localStorage.setItem('pdv-maquininha', m) } catch { /* ignora */ } }}>{m}</button>
                    ))}
                  </div>
                )}
                {(forma === 'credito' || forma === 'debito') && (
                  <label className="block text-sm">NSU / comprovante da maquininha
                    <input className={inputCls} value={nsu} onChange={(e) => setNsu(e.target.value)} />
                  </label>
                )}
                <button className={btnCls} onClick={() => pagar()}>Registrar pagamento</button>
                {!sessao && <p className="text-sm text-alert">Caixa fechado: abra em PDV · Caixa para receber.</p>}
              </>
            ) : (
              <p className="text-sm text-ink-soft">Comanda encerrada.</p>
            )}
            <h3 className="pt-2 text-sm font-semibold">Pagamentos</h3>
            {!pags.length ? <p className="text-sm text-ink-soft">Nenhum pagamento.</p> : (
              <ul className="divide-y divide-line text-sm">
                {pags.map((p) => (
                  <li key={p.id} className={`flex items-center justify-between py-2 ${p.estornado ? 'opacity-50 line-through' : ''}`}>
                    <span>{rotuloForma(p.forma)}{p.tef_provedor ? ` · ${p.tef_provedor}` : ''} {p.tef_nsu ? `· NSU ${p.tef_nsu}` : ''}</span>
                    <span className="flex items-center gap-2">
                      {reais(p.valor - p.troco)}
                      {aberta && !p.estornado && pode('pdv_caixa') && <button className="text-alert" onClick={() => estornar(p)}>estornar</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(pode('pdv_caixa') || pode('pdv_fiscal')) && <div className="border-t border-line pt-3"><EmitirFiscal comandaId={c.id} docInicial={c.cpf_cnpj_nota} compacto /></div>}
          </section>
        ) : (
          <Vazio texto="Comanda encerrada." />
        )}

        <aside id="resumo-comanda" className={`${cartaoCls} h-fit space-y-3 p-4`}>
          {carrinho.length > 0 && (
            <div className="space-y-2 rounded-xl bg-brand-soft p-3">
              <b className="text-sm">A enviar ({qtdCarrinho})</b>
              {carrinho.map((x, i) => (
                <div key={i} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>{x.qtd}× {x.p.nome}{x.opcoes.length ? <em className="block text-xs text-ink-soft">{x.opcoes.map((o) => o.nome).join(', ')}</em> : null}</span>
                    <span className="flex gap-1">
                      <button className={btnSecCls + ' !min-h-[32px] !px-2'} onClick={() => setCarrinho((cs) => cs.map((k, j) => (j === i ? { ...k, qtd: Math.max(0, k.qtd - 1) } : k)).filter((k) => k.qtd > 0))}>−</button>
                      <button className={btnSecCls + ' !min-h-[32px] !px-2'} onClick={() => setCarrinho((cs) => cs.map((k, j) => (j === i ? { ...k, qtd: k.qtd + 1 } : k)))}>+</button>
                    </span>
                  </div>
                  <input className={inputCls + ' mt-1 !min-h-[36px]'} placeholder="Observação (ponto, sem cebola…)" value={x.obs} onChange={(e) => setCarrinho((cs) => cs.map((k, j) => (j === i ? { ...k, obs: e.target.value } : k)))} />
                </div>
              ))}
              <button className={btnCls + ' w-full'} onClick={enviar}>Enviar · {reais(totCarrinho)}</button>
            </div>
          )}
          <h2 className="font-semibold">Consumo</h2>
          {!itens.length ? <p className="text-sm text-ink-soft">Nenhum item lançado.</p> : (
            <ul className="divide-y divide-line text-sm">
              {itens.map((i) => (
                <li key={i.id} className="py-2">
                  <div className="flex justify-between gap-2">
                    <span className={i.status === 'cancelado' ? 'line-through opacity-60' : ''}>{i.qtd}× {i.nome}{i.opcoes?.length ? <em className="block text-xs text-ink-soft">{i.opcoes.map((o) => o.nome).join(', ')}</em> : null}{i.obs ? <em className="block text-xs text-ink-soft">{i.obs}</em> : null}</span>
                    <span>{reais(i.qtd * i.preco_unit)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 ${ST_COR[i.status]}`}>{i.status}</span>
                    <span className="text-ink-soft">{i.destino} · {i.origem} · {hora(i.criado_em)}</span>
                    {aberta && i.status === 'pronto' && <button className="text-brand" onClick={() => statusItem(i, 'entregue')}>entregue</button>}
                    {aberta && i.status !== 'cancelado' && i.tipo === 'produto' && <button className="text-alert" onClick={() => cancelarItem(i)}>cancelar</button>}
                    {i.tipo !== 'produto' && <span className="rounded-full bg-paper-dim px-2 py-0.5">{i.tipo}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <dl className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{reais(num(tot?.subtotal))}</dd></div>
            <div className="flex justify-between"><dt>Serviço {c.taxa_servico_pct}%{aberta && <button className="ml-1 text-brand" onClick={() => ajusteConta('taxa_servico_pct')}>alterar</button>}</dt><dd>{reais(num(tot?.servico))}</dd></div>
            <div className="flex justify-between"><dt>Desconto{aberta && pode('pdv_caixa') && <button className="ml-1 text-brand" onClick={() => ajusteConta('desconto')}>alterar</button>}</dt><dd>−{reais(c.desconto)}</dd></div>
            <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{reais(num(tot?.total))}</dd></div>
            <div className="flex items-center justify-between text-ink-soft"><dt>{c.pessoas} pessoa(s){aberta && <button className="ml-1 text-brand" onClick={() => setPessoasEd(String(c.pessoas))}>alterar</button>}</dt><dd>{reais(num(tot?.total) / Math.max(1, c.pessoas))} / pessoa</dd></div>
            <div className="flex justify-between"><dt>Pago</dt><dd>{reais(num(tot?.pago))}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Restante</dt><dd>{reais(restante)}</dd></div>
          </dl>
          {!aberta && c.status === 'fechada' && (pode('pdv_caixa') || pode('pdv_fiscal')) && <button className={btnSecCls + ' w-full'} onClick={() => setAba('pagamento')}>Cupom fiscal desta comanda</button>}
          {erro && <p className="rounded-xl bg-alert-soft px-3 py-2 text-sm text-alert">{erro}</p>}
          {aberta && (
            <div className="flex flex-wrap gap-2">
              <button className={btnSecCls} onClick={abrirPerfis}>Pessoas e perfis</button>
              <button className={btnSecCls} onClick={pedirConta}>Imprimir pré-conta</button>
              {pode('pdv_caixa') && <button className={btnCls} onClick={fechar}>Fechar comanda</button>}
              {pode('pdv_caixa') && <button className={btnPerigoCls} onClick={cancelarComanda}>Cancelar</button>}
            </div>
          )}
        </aside>
      </div>
      {esc && (
        <Modal titulo={esc.p.nome} fechar={() => setEsc(null)}>
          {gruposDe(esc.p).map((g) => (
            <fieldset key={g.id} className="space-y-1">
              <legend className="font-medium">{g.nome} <span className="text-xs text-ink-soft">{g.min_escolhas > 0 ? 'obrigatório' : 'opcional'}{g.max_escolhas > 1 ? ` · até ${g.max_escolhas}` : ''}</span></legend>
              <div className="grid grid-cols-2 gap-2">
                {g.opcoes.map((o) => {
                  const on = (esc.sel[g.id] ?? []).includes(o.id)
                  return <button key={o.id} type="button" className={on ? btnCls : btnSecCls} onClick={() => toggleOpc(g, o)}>{o.nome}{Number(o.preco_adicional) > 0 ? ` +${reais(Number(o.preco_adicional))}` : ''}</button>
                })}
              </div>
            </fieldset>
          ))}
          <button className={btnCls + ' w-full'} onClick={confirmarEsc}>Adicionar ao pedido</button>
        </Modal>
      )}
      {pessoasEd != null && (
        <Modal titulo="Quantas pessoas na comanda?" fechar={() => setPessoasEd(null)}>
          <input className={inputCls} inputMode="numeric" autoFocus value={pessoasEd} onChange={(e) => setPessoasEd(e.target.value)} />
          <p className="text-xs text-ink-soft">Usado no ticket médio por pessoa e na divisão da conta. Para recalcular couvert/rodízio, use "Pessoas e perfis".</p>
          <button className={btnCls} onClick={salvarPessoas}>Salvar</button>
        </Modal>
      )}
      {fiscalFim && (
        <Modal titulo="Comanda fechada · cupom fiscal" fechar={() => nav('/pdv')}>
          <EmitirFiscal comandaId={c.id} docInicial={c.cpf_cnpj_nota} compacto />
          <button className={btnSecCls + ' w-full'} onClick={() => nav('/pdv')}>Concluir e voltar ao salão</button>
        </Modal>
      )}
      {editPerfis && (
        <Modal titulo="Pessoas e perfis (couvert / rodízio)" fechar={() => setEditPerfis(null)}>
          <PerfisCheckin perfis={perfis} cobrancas={cobrancas} qtds={editPerfis} onChange={setEditPerfis} sel={selCob} onSel={setSelCob} />
          <p className="text-xs text-ink-soft">Ao salvar, o couvert e o rodízio marcados são recalculados para estes perfis; os desmarcados saem da comanda.</p>
          <button className={btnCls} onClick={salvarPerfis}>Salvar</button>
        </Modal>
      )}
    </div>
  )
}
