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

interface Pag { id: string; forma: string; valor: number; troco: number; tef_status: string | null; tef_nsu: string | null; estornado: boolean; criado_em: string }

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
  const [cat, setCat] = useState<string>('todas')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [fim, setFim] = useState(false)
  const [carrinho, setCarrinho] = useState<{ p: Produto; qtd: number; obs: string }[]>([])
  const [aba, setAba] = useState<'pedido' | 'pagamento'>('pedido')
  const [forma, setForma] = useState<string>('credito')
  const [valor, setValor] = useState('')
  const [nsu, setNsu] = useState('')
  const [recebido, setRecebido] = useState('')

  const carregar = useCallback(async () => {
    if (!id) return
    const [cm, it, pg, tt, ct, pr, ss] = await Promise.all([
      db.from('pdv_comandas').select('*').eq('id', id).single(),
      db.from('pdv_pedido_itens').select('*').eq('comanda_id', id).order('criado_em'),
      db.from('pdv_pagamentos').select('*').eq('comanda_id', id).order('criado_em'),
      db.from('pdv_comanda_totais').select('*').eq('comanda_id', id).single(),
      db.from('pdv_categorias').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_produtos').select('*').eq('ativo', true).order('ordem').order('nome'),
      db.from('pdv_caixa_sessoes').select('*').eq('status', 'aberto').limit(1),
    ])
    if (cm.error) return setErro(cm.error.message)
    const cmd = cm.data as TComanda
    setC(cmd)
    if (cmd.mesa_id) setMesa(((await db.from('pdv_mesas').select('*').eq('id', cmd.mesa_id).single()).data as Mesa) ?? null)
    setItens((it.data ?? []) as Item[])
    setPags((pg.data ?? []) as Pag[])
    setTot(tt.data as Totais)
    setCats((ct.data ?? []) as Categoria[])
    setProds((pr.data ?? []) as Produto[])
    setSessao((ss.data?.[0] as Sessao) ?? null)
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

  function add(p: Produto) {
    setCarrinho((cs) => {
      const i = cs.findIndex((x) => x.p.id === p.id && !x.obs)
      if (i >= 0) return cs.map((x, k) => (k === i ? { ...x, qtd: x.qtd + 1 } : x))
      return [...cs, { p, qtd: 1, obs: '' }]
    })
  }
  async function enviar() {
    if (!c || !carrinho.length) return
    setErro('')
    const uid = (await supabase.auth.getUser()).data.user?.id
    const { error } = await db.from('pdv_pedido_itens').insert(
      carrinho.map((x) => ({
        comanda_id: c.id, produto_id: x.p.id, nome: x.p.nome, qtd: x.qtd, preco_unit: x.p.preco,
        obs: x.obs.trim() || null, destino: x.p.destino, origem: 'sistema', criado_por: uid,
      }))
    )
    if (error) return setErro(error.message)
    setCarrinho([])
    setMsg('Pedido enviado para as impressoras.')
    carregar()
  }
  async function cancelarItem(i: Item) {
    const motivo = window.prompt(`Cancelar "${i.nome}"? Informe o motivo:`)
    if (!motivo) return
    const { error } = await db.from('pdv_pedido_itens').update({ status: 'cancelado', cancelado_motivo: motivo }).eq('id', i.id)
    if (error) setErro(error.message)
    else carregar()
  }
  async function statusItem(i: Item, status: Item['status']) {
    await db.from('pdv_pedido_itens').update({ status }).eq('id', i.id)
    carregar()
  }
  async function pedirConta() {
    if (!c || !tot) return
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
  async function pagar() {
    if (!c) return
    if (!sessao) return setErro('Abra o caixa antes de receber pagamentos (PDV · Caixa).')
    const v = lerNumero(valor || String(restante))
    if (!v || v <= 0) return setErro('Informe o valor.')
    let troco = 0
    let aplicado = v
    if (forma === 'dinheiro') {
      const rec = lerNumero(recebido || String(v)) ?? v
      aplicado = Math.min(v, restante)
      troco = Math.max(0, rec - aplicado)
      if (rec < aplicado) return setErro('Valor recebido menor que o valor a pagar.')
    } else if (v > restante + 0.005) return setErro('Valor acima do restante da conta.')
    const cartao = forma === 'credito' || forma === 'debito'
    const { error } = await db.from('pdv_pagamentos').insert({
      comanda_id: c.id, sessao_id: sessao.id, forma, valor: forma === 'dinheiro' ? aplicado + troco : aplicado, troco,
      tef_provedor: cartao ? 'manual' : null, tef_status: cartao ? 'aprovado' : null, tef_nsu: nsu.trim() || null,
      user_id: (await supabase.auth.getUser()).data.user?.id,
    })
    if (error) return setErro(error.message)
    setValor(''); setNsu(''); setRecebido(''); setErro('')
    if (troco > 0) setMsg(`Troco: ${reais(troco)}`)
    carregar()
  }
  async function estornar(p: Pag) {
    if (!window.confirm(`Estornar ${rotuloForma(p.forma)} de ${reais(p.valor - p.troco)}?`)) return
    await db.from('pdv_pagamentos').update({ estornado: true }).eq('id', p.id)
    carregar()
  }
  async function fechar() {
    if (!c) return
    if (restante > 0.005) return setErro(`Falta receber ${reais(restante)}.`)
    if (itens.some((i) => i.status !== 'cancelado') === false && !window.confirm('Comanda sem itens. Fechar mesmo assim?')) return
    const { error } = await db.from('pdv_comandas').update({ status: 'fechada', fechada_em: new Date().toISOString(), sessao_id: sessao?.id ?? null }).eq('id', c.id)
    if (error) return setErro(error.message)
    // NFC-e automática se configurada
    const { data: fc } = await db.from('pdv_fiscal_config').select('ativo,emitir_automatico').maybeSingle()
    if (fc?.ativo && fc?.emitir_automatico) await supabase.functions.invoke('pdv-fiscal', { body: { acao: 'emitir', comanda_id: c.id } })
    nav('/pdv')
  }
  async function cancelarComanda() {
    if (!c || !window.confirm('Cancelar a comanda inteira? Só é permitido sem pagamentos.')) return
    if (pags.some((p) => !p.estornado)) return setErro('Estorne os pagamentos antes de cancelar.')
    await db.from('pdv_pedido_itens').update({ status: 'cancelado', cancelado_motivo: 'comanda cancelada' }).eq('comanda_id', c.id)
    await db.from('pdv_comandas').update({ status: 'cancelada', fechada_em: new Date().toISOString() }).eq('id', c.id)
    nav('/pdv')
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
  const totCarrinho = carrinho.reduce((s, x) => s + x.qtd * x.p.preco, 0)

  return (
    <div>
      <Cabecalho
        voltar={{ para: '/pdv', rotulo: 'Salão' }}
        titulo={`${mesa ? `Mesa ${mesa.numero}` : 'Balcão'} · #${c.numero}`}
        subtitulo={`${c.nome_cliente ?? 'Sem nome'} · ${c.pessoas} pessoa(s) · aberta às ${hora(c.aberta_em)}${c.status === 'pedindo_conta' ? ' · PEDIU A CONTA' : ''}${!aberta ? ` · ${c.status.toUpperCase()}` : ''}`}
      />
      {erro && <Erro texto={erro} />}
      {msg && <p className="mb-3 rounded-xl bg-brand-soft px-4 py-2 text-sm text-brand" onClick={() => setMsg('')}>{msg}</p>}

      <div className="mb-4 flex gap-2">
        <button className={aba === 'pedido' ? btnCls : btnSecCls} onClick={() => setAba('pedido')}>Pedido</button>
        <button className={aba === 'pagamento' ? btnCls : btnSecCls} onClick={() => setAba('pagamento')}>Conta e pagamento</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {aba === 'pedido' && aberta ? (
          <section>
            <input className={`${inputCls} mb-3`} placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              <button className={cat === 'todas' ? btnCls : btnSecCls} onClick={() => setCat('todas')}>Todas</button>
              {cats.map((k) => (
                <button key={k.id} className={cat === k.id ? btnCls : btnSecCls} onClick={() => setCat(k.id)}>{k.nome}</button>
              ))}
            </div>
            {!lista.length ? (
              <Vazio texto="Nenhum produto. Cadastre em PDV · Configurações › Produtos." />
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {lista.map((p) => (
                  <button key={p.id} onClick={() => add(p)} className={`${cartaoCls} min-h-[84px] p-3 text-left active:scale-[0.98]`}>
                    <div className="text-sm font-semibold leading-tight">{p.nome}</div>
                    <div className="mt-1 text-sm text-brand">{reais(p.preco)}</div>
                    <div className="text-[11px] uppercase text-ink-soft">{p.destino}</div>
                  </button>
                ))}
              </div>
            )}
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
                  <label className="block text-sm">NSU / comprovante da maquininha
                    <input className={inputCls} value={nsu} onChange={(e) => setNsu(e.target.value)} />
                  </label>
                )}
                <button className={btnCls} onClick={pagar}>Registrar pagamento</button>
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
                    <span>{rotuloForma(p.forma)} {p.tef_nsu ? `· NSU ${p.tef_nsu}` : ''}</span>
                    <span className="flex items-center gap-2">
                      {reais(p.valor - p.troco)}
                      {aberta && !p.estornado && pode('pdv_caixa') && <button className="text-alert" onClick={() => estornar(p)}>estornar</button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <Vazio texto="Comanda encerrada." />
        )}

        <aside className={`${cartaoCls} h-fit space-y-3 p-4`}>
          {carrinho.length > 0 && (
            <div className="space-y-2 rounded-xl bg-brand-soft p-3">
              <b className="text-sm">A enviar ({qtdCarrinho})</b>
              {carrinho.map((x, i) => (
                <div key={i} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span>{x.qtd}× {x.p.nome}</span>
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
                    <span className={i.status === 'cancelado' ? 'line-through opacity-60' : ''}>{i.qtd}× {i.nome}{i.obs ? <em className="block text-xs text-ink-soft">{i.obs}</em> : null}</span>
                    <span>{reais(i.qtd * i.preco_unit)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 ${ST_COR[i.status]}`}>{i.status}</span>
                    <span className="text-ink-soft">{i.destino} · {i.origem} · {hora(i.criado_em)}</span>
                    {aberta && i.status === 'pronto' && <button className="text-brand" onClick={() => statusItem(i, 'entregue')}>entregue</button>}
                    {aberta && i.status !== 'cancelado' && <button className="text-alert" onClick={() => cancelarItem(i)}>cancelar</button>}
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
            <div className="flex justify-between"><dt>Pago</dt><dd>{reais(num(tot?.pago))}</dd></div>
            <div className="flex justify-between font-semibold"><dt>Restante</dt><dd>{reais(restante)}</dd></div>
          </dl>
          {aberta && (
            <div className="flex flex-wrap gap-2">
              <button className={btnSecCls} onClick={pedirConta}>Imprimir pré-conta</button>
              {pode('pdv_caixa') && <button className={btnCls} onClick={fechar}>Fechar comanda</button>}
              {pode('pdv_caixa') && <button className={btnPerigoCls} onClick={cancelarComanda}>Cancelar</button>}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
