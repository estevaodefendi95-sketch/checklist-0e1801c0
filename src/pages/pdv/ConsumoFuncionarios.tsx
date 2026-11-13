import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db, supabase } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, chipCls, inputCls } from '../../components/Estado'
import { reais, lerNumero } from '../../lib/formato'
import { num } from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'

interface Func { id: string; nome: string; cargo: string | null; limite_mensal: number | null; ativo: boolean }
interface Cmd { id: string; numero: number; funcionario_id: string; status: string; aberta_em: string; fechada_em: string | null; desconto: number }
interface It { comanda_id: string; nome: string; qtd: number; preco_unit: number; status: string }

const mesAtual = () => new Date().toLocaleDateString('sv-SE').slice(0, 7)

export function ConsumoFuncionarios() {
  const { pode } = usePermissoes()
  const gerir = pode('pdv_gerir')
  const [aba, setAba] = useState<'lancar' | 'relatorio' | 'cadastro'>('lancar')
  const [funcs, setFuncs] = useState<Func[] | null>(null)
  const [cmds, setCmds] = useState<Cmd[]>([])
  const [itens, setItens] = useState<It[]>([])
  const [mes, setMes] = useState(mesAtual())
  const [pct, setPct] = useState('100')
  const [erro, setErro] = useState('')
  const nav = useNavigate()

  const carregar = useCallback(async () => {
    const ini = new Date(mes + '-01T00:00:00')
    const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 1)
    const [f, c, cf] = await Promise.all([
      db.from('pdv_funcionarios').select('*').order('nome'),
      db.from('pdv_comandas').select('id,numero,funcionario_id,status,aberta_em,fechada_em,desconto').not('funcionario_id', 'is', null).gte('aberta_em', ini.toISOString()).lt('aberta_em', fim.toISOString()).order('aberta_em', { ascending: false }),
      db.from('pdv_config').select('consumo_func_desconto_pct').eq('id', 1).maybeSingle(),
    ])
    const cs = (c.data ?? []) as Cmd[]
    setFuncs((f.data ?? []) as Func[]); setCmds(cs); setPct(String(cf.data?.consumo_func_desconto_pct ?? 100))
    if (cs.length) { const i = await db.from('pdv_pedido_itens').select('comanda_id,nome,qtd,preco_unit,status').in('comanda_id', cs.map((x) => x.id)); setItens((i.data ?? []) as It[]) } else setItens([])
  }, [mes])
  useEffect(() => { carregar() }, [carregar])

  const resumo = useMemo(() => {
    const m = new Map<string, { n: number; tabela: number; desc: number; folha: number; abertas: number }>()
    for (const c of cmds) {
      if (c.status === 'cancelada') continue
      const tab = itens.filter((i) => i.comanda_id === c.id && i.status !== 'cancelado').reduce((s, i) => s + num(i.qtd) * num(i.preco_unit), 0)
      const x = m.get(c.funcionario_id) ?? { n: 0, tabela: 0, desc: 0, folha: 0, abertas: 0 }
      x.n++; x.tabela += tab
      if (c.status === 'fechada') { x.desc += num(c.desconto); x.folha += Math.max(0, tab - num(c.desconto)) } else x.abertas++
      m.set(c.funcionario_id, x)
    }
    return m
  }, [cmds, itens])

  async function lancar(f: Func) {
    setErro('')
    const aberta = cmds.find((c) => c.funcionario_id === f.id && (c.status === 'aberta' || c.status === 'pedindo_conta'))
    if (aberta) return nav(`/pdv/comanda/${aberta.id}`)
    const { data, error } = await db.from('pdv_comandas').insert({
      funcionario_id: f.id, nome_cliente: f.nome, pessoas: 1, origem: 'sistema', taxa_servico_pct: 0, aberta_por: (await supabase.auth.getUser()).data.user?.id,
    }).select('id').single()
    if (error) return setErro(error.message)
    nav(`/pdv/comanda/${data.id}`)
  }
  async function salvarPct() {
    const v = lerNumero(pct)
    if (v == null || v < 0 || v > 100) return setErro('Informe um percentual entre 0 e 100.')
    const { error } = await db.from('pdv_config').update({ consumo_func_desconto_pct: v }).eq('id', 1)
    setErro(error?.message ?? '')
  }
  function csv() {
    const l = [['funcionario', 'comandas', 'valor_tabela', 'desconto', 'a_descontar_folha']]
    ;(funcs ?? []).forEach((f) => { const r = resumo.get(f.id); if (r) l.push([f.nome, String(r.n), r.tabela.toFixed(2), r.desc.toFixed(2), r.folha.toFixed(2)]) })
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + l.map((x) => x.join(';')).join('\n')], { type: 'text/csv' })); a.download = `consumo_funcionarios_${mes}.csv`; a.click()
  }

  if (!funcs) return <Carregando />
  const ativos = funcs.filter((f) => f.ativo)
  return (
    <div>
      <Cabecalho titulo="Consumo de funcionários" subtitulo="Consumação da equipe: baixa o estoque, não entra no caixa nem na nota fiscal" />
      {erro && <Erro texto={erro} />}
      <div className="mb-4 flex gap-2">
        <button className={chipCls(aba === 'lancar')} onClick={() => setAba('lancar')}>Lançar consumo</button>
        <button className={chipCls(aba === 'relatorio')} onClick={() => setAba('relatorio')}>Relatório do mês</button>
        {gerir && <button className={chipCls(aba === 'cadastro')} onClick={() => setAba('cadastro')}>Funcionários e regra</button>}
      </div>

      {aba === 'lancar' && (!ativos.length ? <Vazio texto={gerir ? 'Cadastre os funcionários na aba “Funcionários e regra”.' : 'Nenhum funcionário cadastrado. Peça a um gestor.'} /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {ativos.map((f) => {
            const r = resumo.get(f.id)
            const aberta = cmds.some((c) => c.funcionario_id === f.id && (c.status === 'aberta' || c.status === 'pedindo_conta'))
            const lim = f.limite_mensal != null && r ? r.tabela >= f.limite_mensal : false
            return (
              <button key={f.id} onClick={() => lancar(f)} className={`${cartaoCls} min-h-[96px] p-4 text-left active:scale-[0.98]`}>
                <div className="font-semibold">{f.nome}</div>
                <div className="text-xs text-ink-soft">{f.cargo ?? '—'}</div>
                <div className="mt-2 text-xs">{aberta ? <span className="text-brand">comanda aberta · continuar</span> : 'novo consumo'}</div>
                <div className={`text-xs ${lim ? 'text-alert' : 'text-ink-soft'}`}>mês: {reais(r?.tabela ?? 0)}{f.limite_mensal != null ? ` / limite ${reais(f.limite_mensal)}` : ''}</div>
              </button>
            )
          })}
        </div>
      ))}

      {aba === 'relatorio' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <input type="month" className={inputCls + ' !w-auto'} value={mes} onChange={(e) => setMes(e.target.value)} />
            <button className={btnSecCls} onClick={csv}>Exportar CSV</button>
          </div>
          <div className={`${cartaoCls} divide-y divide-line text-sm`}>
            <div className="grid grid-cols-5 gap-2 p-3 text-xs uppercase text-ink-soft"><span className="col-span-2">Funcionário</span><span>Tabela</span><span>Desconto</span><span>Folha</span></div>
            {funcs.filter((f) => resumo.has(f.id)).map((f) => { const r = resumo.get(f.id)!; return (
              <div key={f.id} className="grid grid-cols-5 gap-2 p-3">
                <span className="col-span-2"><b>{f.nome}</b><span className="block text-xs text-ink-soft">{r.n} comanda(s){r.abertas ? ` · ${r.abertas} em aberto` : ''}</span></span>
                <span>{reais(r.tabela)}</span><span>{reais(r.desc)}</span><b>{reais(r.folha)}</b>
              </div>) })}
            {!resumo.size && <p className="p-4 text-ink-soft">Sem consumo neste mês.</p>}
            {resumo.size > 0 && <div className="grid grid-cols-5 gap-2 p-3 font-semibold"><span className="col-span-2">Total</span><span>{reais([...resumo.values()].reduce((s, r) => s + r.tabela, 0))}</span><span>{reais([...resumo.values()].reduce((s, r) => s + r.desc, 0))}</span><span>{reais([...resumo.values()].reduce((s, r) => s + r.folha, 0))}</span></div>}
          </div>
        </div>
      )}

      {aba === 'cadastro' && gerir && (
        <div className="space-y-4">
          <section className={`${cartaoCls} space-y-2 p-4`}>
            <h3 className="font-semibold">Regra de consumação</h3>
            <p className="text-sm text-ink-soft">Percentual de desconto sobre o valor de tabela. 100% = cortesia; 50% = o funcionário paga metade (vai como desconto em folha).</p>
            <div className="flex gap-2"><input className={inputCls + ' !w-32'} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /><button className={btnCls} onClick={salvarPct}>Salvar</button></div>
          </section>
          <Cadastro funcs={funcs} recarregar={carregar} setErro={setErro} />
        </div>
      )}
    </div>
  )
}

function Cadastro({ funcs, recarregar, setErro }: { funcs: Func[]; recarregar: () => void; setErro: (e: string) => void }) {
  const [nome, setNome] = useState(''); const [cargo, setCargo] = useState(''); const [lim, setLim] = useState('')
  async function add() {
    if (!nome.trim()) return setErro('Informe o nome.')
    const { error } = await db.from('pdv_funcionarios').insert({ nome: nome.trim(), cargo: cargo.trim() || null, limite_mensal: lerNumero(lim) })
    if (error) return setErro(error.message)
    setNome(''); setCargo(''); setLim(''); setErro(''); recarregar()
  }
  return (
    <section className={`${cartaoCls} space-y-3 p-4`}>
      <h3 className="font-semibold">Funcionários</h3>
      <div className="grid gap-2 md:grid-cols-4">
        <input className={inputCls} placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <input className={inputCls} placeholder="Cargo (opcional)" value={cargo} onChange={(e) => setCargo(e.target.value)} />
        <input className={inputCls} inputMode="decimal" placeholder="Limite mensal R$ (opcional)" value={lim} onChange={(e) => setLim(e.target.value)} />
        <button className={btnCls} onClick={add}>Adicionar</button>
      </div>
      <ul className="divide-y divide-line text-sm">
        {funcs.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className={f.ativo ? '' : 'text-ink-soft line-through'}><b>{f.nome}</b> {f.cargo ? `· ${f.cargo}` : ''}{f.limite_mensal != null ? ` · limite ${reais(f.limite_mensal)}` : ''}</span>
            <span className="flex gap-2">
              <button className={btnSecCls + ' !min-h-[36px]'} onClick={async () => { await db.from('pdv_funcionarios').update({ ativo: !f.ativo }).eq('id', f.id); recarregar() }}>{f.ativo ? 'Desativar' : 'Reativar'}</button>
              <button className={btnPerigoCls + ' !min-h-[36px]'} onClick={async () => { if (window.confirm(`Remover ${f.nome}? O histórico de consumo continua nas comandas.`)) { await db.from('pdv_funcionarios').delete().eq('id', f.id); recarregar() } }}>Remover</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
