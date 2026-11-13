import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { lerNumero } from '../../lib/formato'
import { Categoria, Produto, num } from '../../lib/pdv'
import { Modal } from './PdvCaixa'
import { Avisos, useSalvarMsg } from './PdvConfig'
import type { RegraDesconto } from './DescontosComanda'

const NOVA: RegraDesconto = { id: '', nome: '', pct: 10, escopo: 'todos', produto_ids: [], inclui_couvert: false, remove_servico: true, ativo: true, ordem: 0 }

/** Descontos automáticos usados no fechamento da conta (familiares, funcionários, parceiros…). */
export function ConfigDescontos() {
  const [regras, setRegras] = useState<RegraDesconto[]>([])
  const [prods, setProds] = useState<Produto[]>([])
  const [cats, setCats] = useState<Categoria[]>([])
  const [ed, setEd] = useState<RegraDesconto | null>(null)
  const [pctTxt, setPctTxt] = useState('')
  const [busca, setBusca] = useState('')
  const [pronto, setPronto] = useState(false)
  const s = useSalvarMsg()

  const carregar = useCallback(async () => {
    const [r, p, c] = await Promise.all([
      db.from('pdv_descontos_regras').select('*').order('ordem').order('nome'),
      db.from('pdv_produtos').select('id,nome,categoria_id,preco').eq('ativo', true).order('nome'),
      db.from('pdv_categorias').select('id,nome,ordem').eq('ativo', true).order('ordem'),
    ])
    setRegras(((r.data ?? []) as RegraDesconto[]).map((x) => ({ ...x, pct: num(x.pct) })))
    setProds((p.data ?? []) as Produto[])
    setCats((c.data ?? []) as Categoria[])
    setPronto(true)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const nomeProd = useMemo(() => Object.fromEntries(prods.map((p) => [p.id, p.nome])), [prods])
  const filtrados = useMemo(() => {
    const q = busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    return prods.filter((p) => !q || p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
  }, [prods, busca])

  function abrir(r: RegraDesconto) { setEd({ ...r }); setPctTxt(String(r.pct).replace('.', ',')); setBusca('') }
  async function salvar() {
    if (!ed) return
    const pct = lerNumero(pctTxt)
    if (!ed.nome.trim()) return s.falha('Dê um nome para o desconto.')
    if (pct == null || pct < 0 || pct > 100) return s.falha('Percentual entre 0 e 100.')
    if (ed.escopo === 'produtos' && !ed.produto_ids.length) return s.falha('Escolha ao menos um produto.')
    const dados = { nome: ed.nome.trim(), pct, escopo: ed.escopo, produto_ids: ed.escopo === 'produtos' ? ed.produto_ids : [], inclui_couvert: ed.inclui_couvert, remove_servico: ed.remove_servico, ativo: ed.ativo }
    const { error } = ed.id ? await db.from('pdv_descontos_regras').update(dados).eq('id', ed.id) : await db.from('pdv_descontos_regras').insert({ ...dados, ordem: regras.length + 1 })
    if (error) return s.falha(error.message)
    s.ok('Desconto salvo.'); setEd(null); carregar()
  }
  async function excluir(r: RegraDesconto) {
    if (!window.confirm(`Excluir o desconto "${r.nome}"? Contas já fechadas não mudam.`)) return
    const { error } = await db.from('pdv_descontos_regras').delete().eq('id', r.id)
    if (error) return s.falha(error.message)
    s.ok('Excluído.'); carregar()
  }
  async function ligar(r: RegraDesconto) {
    await db.from('pdv_descontos_regras').update({ ativo: !r.ativo }).eq('id', r.id)
    carregar()
  }
  const alternar = (id: string) => setEd((x) => x && ({ ...x, produto_ids: x.produto_ids.includes(id) ? x.produto_ids.filter((i) => i !== id) : [...x.produto_ids, id] }))

  if (!pronto) return <Carregando />
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Descontos automáticos</h2>
            <p className="text-sm text-ink-soft">Aparecem na hora de fechar a conta. Ex.: familiares 50% no consumo todo; funcionários 20% só em produtos escolhidos. Cada regra pode tirar a taxa de serviço.</p>
          </div>
          <button className={btnCls} onClick={() => abrir(NOVA)}>Novo desconto</button>
        </div>
        {!regras.length ? <p className="text-sm text-ink-soft">Nenhum desconto cadastrado.</p> : (
          <ul className="divide-y divide-line">
            {regras.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className={r.ativo ? '' : 'opacity-50'}>
                  <b>{r.nome} · {r.pct}%</b>
                  <p className="text-xs text-ink-soft">
                    {r.escopo === 'todos' ? 'Todo o consumo' : `${r.produto_ids.length} produto(s): ${r.produto_ids.slice(0, 3).map((i) => nomeProd[i] ?? '?').join(', ')}${r.produto_ids.length > 3 ? '…' : ''}`}
                    {r.inclui_couvert ? ' · inclui couvert/rodízio' : ''}{r.remove_servico ? ' · sem taxa de serviço' : ' · cobra serviço'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className={btnSecCls} onClick={() => ligar(r)}>{r.ativo ? 'Desligar' : 'Ligar'}</button>
                  <button className={btnSecCls} onClick={() => abrir(r)}>Editar</button>
                  <button className={btnPerigoCls} onClick={() => excluir(r)}>Excluir</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-ink-soft">No fechamento, quem tem permissão de caixa também pode retirar o couvert, tirar a taxa de serviço ou dar um desconto manual em % ou R$ (com motivo). Tudo fica registrado.</p>
      {ed && (
        <Modal titulo={ed.id ? 'Editar desconto' : 'Novo desconto'} fechar={() => setEd(null)}>
          <input className={inputCls} placeholder="Nome (ex.: Funcionário, Familiar)" value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} autoFocus />
          <label className="block text-sm">Percentual de desconto (%)
            <input className={inputCls} inputMode="decimal" value={pctTxt} onChange={(e) => setPctTxt(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" className={ed.escopo === 'todos' ? btnCls : btnSecCls} onClick={() => setEd({ ...ed, escopo: 'todos' })}>Todo o consumo</button>
            <button type="button" className={ed.escopo === 'produtos' ? btnCls : btnSecCls} onClick={() => setEd({ ...ed, escopo: 'produtos' })}>Só produtos escolhidos</button>
          </div>
          {ed.escopo === 'produtos' && (
            <div className="space-y-2">
              <input className={inputCls} type="search" placeholder={`Buscar produto… (${ed.produto_ids.length} escolhido(s))`} value={busca} onChange={(e) => setBusca(e.target.value)} />
              <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
                {filtrados.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-0">
                    <input type="checkbox" checked={ed.produto_ids.includes(p.id)} onChange={() => alternar(p.id)} />
                    <span className="flex-1">{p.nome}</span>
                    <span className="text-xs text-ink-soft">{cats.find((c) => c.id === p.categoria_id)?.nome ?? ''}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.inclui_couvert} onChange={(e) => setEd({ ...ed, inclui_couvert: e.target.checked })} /> Aplicar também no couvert e rodízio</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.remove_servico} onChange={(e) => setEd({ ...ed, remove_servico: e.target.checked })} /> Não cobrar taxa de serviço (10%)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.ativo} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} /> Ativo (aparece no fechamento)</label>
          <div className="flex gap-2">
            <button className={btnSecCls + ' flex-1'} onClick={() => setEd(null)}>Voltar</button>
            <button className={btnCls + ' flex-1'} onClick={salvar}>Salvar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
