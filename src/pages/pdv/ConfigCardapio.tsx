import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais, lerNumero } from '../../lib/formato'
import { Avisos, Campo, useSalvarMsg } from './PdvConfig'
import { Modal } from './PdvCaixa'
import type { Faixa } from '../../lib/pdv'

export const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export interface Grupo { id: string; nome: string; tipo: 'acompanhamento' | 'combo' | 'informacao'; min_escolhas: number; max_escolhas: number; ativo: boolean; ordem: number }
export interface Opcao { id: string; grupo_id: string; nome: string; preco_adicional: number; ativo: boolean; ordem: number }
const TIPO: Record<Grupo['tipo'], string> = { acompanhamento: 'Acompanhamento', combo: 'Combo', informacao: 'Informação (ponto, gelo…)' }

export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]
const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** Resumo curto: agrupa os dias que têm as mesmas faixas. Vazio = sempre visível. */
export function rotuloHorario(h: Faixa[] | null | undefined) {
  if (!h?.length) return ''
  const porDia = new Map<number, string>()
  for (const d of ORDEM_DIAS) {
    const f = h.filter((x) => x.dia === d).sort((a, b) => a.inicio.localeCompare(b.inicio))
    if (f.length) porDia.set(d, f.map((x) => `${x.inicio}–${x.fim}`).join(', '))
  }
  const grupos = new Map<string, number[]>()
  porDia.forEach((s, d) => grupos.set(s, [...(grupos.get(s) ?? []), d]))
  return [...grupos].map(([s, ds]) => `${ds.length === 7 ? 'todos os dias' : ds.map((d) => DIAS[d]).join(' ')} ${s}`).join(' · ')
}

/** Editor por dia da semana, com mais de uma faixa por dia (como no Goomer). */
export function HorarioCampos({ v, onChange }: { v: Faixa[] | null | undefined; onChange: (h: Faixa[] | null) => void }) {
  const lista = v ?? []
  const emit = (n: Faixa[]) => onChange(n.length ? n : null)
  const add = (dia: number) => emit([...lista, { dia, inicio: '18:00', fim: '23:00' }])
  const mudar = (f: Faixa, p: Partial<Faixa>) => emit(lista.map((x) => (x === f ? { ...x, ...p } : x)))
  const tirar = (f: Faixa) => emit(lista.filter((x) => x !== f))
  const copiar = (dia: number) => {
    const base = lista.filter((x) => x.dia === dia)
    emit([...lista.filter((x) => x.dia === dia), ...ORDEM_DIAS.filter((d) => d !== dia).flatMap((d) => base.map((x) => ({ ...x, dia: d })))])
  }
  return (
    <div className="space-y-2 rounded-xl bg-surface p-3">
      <p className={`rounded-lg px-3 py-2 text-xs ${lista.length ? 'bg-amber-50 text-amber-900' : 'bg-brand-soft text-ink-soft'}`}>
        {lista.length ? 'Com horário definido, fica visível apenas nos períodos abaixo (fuso de Brasília).' : 'Sem horário definido, fica sempre visível. Toque em + para limitar a certos dias e horas.'}
      </p>
      {ORDEM_DIAS.map((dia) => {
        const f = lista.filter((x) => x.dia === dia).sort((a, b) => a.inicio.localeCompare(b.inicio))
        return (
          <div key={dia} className="space-y-1.5 border-b border-line pb-2 last:border-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{NOMES_DIAS[dia]}{!f.length && <span className="ml-2 text-xs font-normal text-ink-soft">{lista.length ? 'não aparece' : 'sempre'}</span>}</span>
              <span className="flex items-center gap-1.5">
                {f.length > 0 && <button type="button" className="text-xs text-brand underline" title="Copiar estas faixas para todos os dias" onClick={() => copiar(dia)}>copiar p/ todos</button>}
                <button type="button" className={btnSecCls + ' !min-h-[36px] !min-w-[36px] !px-0'} title="Adicionar faixa neste dia" onClick={() => add(dia)}>+</button>
              </span>
            </div>
            {f.map((x, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="time" className={inputCls + ' !min-h-[36px] min-w-0 flex-1 !px-2'} value={x.inicio} onChange={(e) => mudar(x, { inicio: e.target.value || '00:00' })} />
                <span className="text-xs text-ink-soft">até</span>
                <input type="time" className={inputCls + ' !min-h-[36px] min-w-0 flex-1 !px-2'} value={x.fim} onChange={(e) => mudar(x, { fim: e.target.value || '23:59' })} />
                <button type="button" className="h-9 w-9 shrink-0 rounded-full text-alert hover:bg-red-50" title="Remover faixa" onClick={() => tirar(x)}>✕</button>
              </div>
            ))}
          </div>
        )
      })}
      <p className="text-xs text-ink-soft">Se "até" for menor que o início, a faixa vale pela madrugada (ex.: 18:00 até 02:00).</p>
      {lista.length > 0 && <button type="button" className="text-xs text-alert" onClick={() => onChange(null)}>limpar (voltar a ficar sempre visível)</button>}
    </div>
  )
}

/** Relógio de acesso rápido: cinza = sem horário (sempre visível); âmbar = tem horário. */
export function RelogioHorario({ horarios, onClick }: { horarios: Faixa[] | null | undefined; onClick: () => void }) {
  const tem = !!horarios?.length
  return (
    <button type="button" onClick={onClick} title={tem ? `Visível só: ${rotuloHorario(horarios)}` : 'Sem horário: sempre visível. Toque para definir.'}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${tem ? 'border-amber-400 bg-amber-100 text-amber-800' : 'border-line bg-white text-ink-soft'}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    </button>
  )
}

/** Interruptor tipo pílula (Visível/Invisível, Disponível/Indisponível). */
export function Pilula({ on, onChange, sim, nao, titulo }: { on: boolean; onChange: (v: boolean) => void; sim: string; nao: string; titulo?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} title={titulo} onClick={() => onChange(!on)}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${on ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-line bg-surface text-ink-soft'}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-gray-400'}`} />{on ? sim : nao}
    </button>
  )
}

/** Escolhe quais grupos de opções o produto usa. */
export function GruposDoProduto({ produtoId }: { produtoId: string }) {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([db.from('pdv_grupos_opcoes').select('*').eq('ativo', true).order('ordem'), db.from('pdv_produto_grupos').select('grupo_id').eq('produto_id', produtoId)])
    setGrupos((a.data ?? []) as Grupo[]); setSel(new Set((b.data ?? []).map((x: { grupo_id: string }) => x.grupo_id)))
  }, [produtoId])
  useEffect(() => { carregar() }, [carregar])
  async function alternar(g: Grupo) {
    if (sel.has(g.id)) await db.from('pdv_produto_grupos').delete().eq('produto_id', produtoId).eq('grupo_id', g.id)
    else await db.from('pdv_produto_grupos').insert({ produto_id: produtoId, grupo_id: g.id, ordem: sel.size })
    carregar()
  }
  return (
    <div className="space-y-1 rounded-xl bg-surface p-3">
      <b className="text-sm">Opções deste produto</b>
      {!grupos.length ? <p className="text-xs text-ink-soft">Nenhum grupo criado. Crie em Configurações › Opções e combos.</p> : grupos.map((g) => (
        <label key={g.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.has(g.id)} onChange={() => alternar(g)} />{g.nome} <span className="text-xs text-ink-soft">({TIPO[g.tipo]})</span></label>
      ))}
    </div>
  )
}

/** Aba "Opções e combos": grupos (ponto da carne, acompanhamentos, combos) e suas opções. */
export function Opcoes() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [opcs, setOpcs] = useState<Opcao[]>([])
  const [ed, setEd] = useState<Partial<Grupo> | null>(null)
  const [nova, setNova] = useState<Record<string, { nome: string; preco: string }>>({})
  const [pronto, setPronto] = useState(false)
  const s = useSalvarMsg()
  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([db.from('pdv_grupos_opcoes').select('*').order('ordem').order('nome'), db.from('pdv_opcoes').select('*').order('ordem')])
    setGrupos((a.data ?? []) as Grupo[]); setOpcs((b.data ?? []) as Opcao[]); setPronto(true)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function salvarGrupo() {
    if (!ed?.nome?.trim()) return s.falha('Informe o nome do grupo.')
    const min = Number(ed.min_escolhas ?? 0), max = Math.max(1, Number(ed.max_escolhas ?? 1))
    if (min > max) return s.falha('O mínimo não pode ser maior que o máximo.')
    const { id, ...resto } = ed
    const dados = { ...resto, nome: ed.nome.trim(), tipo: ed.tipo ?? 'informacao', min_escolhas: min, max_escolhas: max }
    const { error } = id ? await db.from('pdv_grupos_opcoes').update(dados).eq('id', id) : await db.from('pdv_grupos_opcoes').insert({ ...dados, ordem: grupos.length })
    if (error) return s.falha(error.message)
    setEd(null); s.ok(); carregar()
  }
  async function removerGrupo(g: Grupo) {
    if (!window.confirm(`Remover o grupo "${g.nome}" e suas opções? Produtos deixam de oferecê-lo.`)) return
    const { error } = await db.from('pdv_grupos_opcoes').delete().eq('id', g.id)
    if (error) s.falha(error.message); else carregar()
  }
  async function addOpcao(g: Grupo) {
    const n = nova[g.id]
    if (!n?.nome?.trim()) return
    const { error } = await db.from('pdv_opcoes').insert({ grupo_id: g.id, nome: n.nome.trim(), preco_adicional: lerNumero(n.preco ?? '') ?? 0, ordem: opcs.filter((o) => o.grupo_id === g.id).length })
    if (error) return s.falha(error.message)
    setNova((x) => ({ ...x, [g.id]: { nome: '', preco: '' } })); carregar()
  }
  async function updOpcao(o: Opcao, p: Partial<Opcao>) {
    setOpcs((x) => x.map((k) => (k.id === o.id ? { ...k, ...p } : k)))
    const { error } = await db.from('pdv_opcoes').update(p).eq('id', o.id)
    if (error) s.falha(error.message)
  }
  async function delOpcao(o: Opcao) { await db.from('pdv_opcoes').delete().eq('id', o.id); carregar() }
  async function modelo(t: 'ponto' | 'acomp') {
    const g = t === 'ponto'
      ? { nome: 'Ponto da carne', tipo: 'informacao', min_escolhas: 1, max_escolhas: 1, ops: ['Mal passado', 'Ao ponto para mal', 'Ao ponto', 'Ao ponto para bem', 'Bem passado'] }
      : { nome: 'Acompanhamento', tipo: 'acompanhamento', min_escolhas: 1, max_escolhas: 1, ops: ['Arroz', 'Batata frita', 'Farofa', 'Salada'] }
    const { data, error } = await db.from('pdv_grupos_opcoes').insert({ nome: g.nome, tipo: g.tipo, min_escolhas: g.min_escolhas, max_escolhas: g.max_escolhas, ordem: grupos.length }).select('id').single()
    if (error) return s.falha(error.message)
    await db.from('pdv_opcoes').insert(g.ops.map((nome, i) => ({ grupo_id: data.id, nome, ordem: i })))
    s.ok('Grupo criado. Agora vincule aos produtos (Produtos › editar › Opções).'); carregar()
  }
  if (!pronto) return <Carregando />
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <p className="rounded-xl bg-brand-soft p-3 text-sm">
        Crie <b>grupos de opções</b> e vincule aos produtos. <b>Informação</b> = ponto da carne, sem gelo; <b>Acompanhamento</b> = arroz, batata (pode ter valor adicional);
        <b> Combo</b> = escolha da bebida/sobremesa do combo. O que o cliente escolher vai impresso na cozinha/bar junto ao item e no tablet.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className={btnCls} onClick={() => setEd({ tipo: 'informacao', min_escolhas: 0, max_escolhas: 1, ativo: true })}>Novo grupo</button>
        <button className={btnSecCls} onClick={() => modelo('ponto')}>+ Modelo: ponto da carne</button>
        <button className={btnSecCls} onClick={() => modelo('acomp')}>+ Modelo: acompanhamentos</button>
      </div>
      {!grupos.length ? <Vazio texto="Nenhum grupo de opções ainda." /> : grupos.map((g) => (
        <section key={g.id} className={`${cartaoCls} space-y-2 p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button className="text-left" onClick={() => setEd(g)}><b>{g.nome}</b> <span className="text-sm text-ink-soft">· {TIPO[g.tipo]} · escolher {g.min_escolhas === g.max_escolhas ? g.min_escolhas : `${g.min_escolhas} a ${g.max_escolhas}`}{!g.ativo && ' · inativo'}</span></button>
            <button className={btnPerigoCls + ' !min-h-[36px]'} onClick={() => removerGrupo(g)}>remover</button>
          </div>
          <ul className="divide-y divide-line text-sm">
            {opcs.filter((o) => o.grupo_id === g.id).map((o) => (
              <li key={o.id} className={`flex flex-wrap items-center gap-2 py-1.5 ${o.ativo ? '' : 'opacity-50'}`}>
                <input className={inputCls + ' !min-h-[36px] flex-1'} defaultValue={o.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== o.nome && updOpcao(o, { nome: e.target.value.trim() })} />
                <span className="text-ink-soft">+ R$</span>
                <input className={inputCls + ' !min-h-[36px] !w-24'} inputMode="decimal" defaultValue={Number(o.preco_adicional) ? String(o.preco_adicional).replace('.', ',') : ''} placeholder="0,00"
                  onBlur={(e) => { const v = lerNumero(e.target.value) ?? 0; if (v !== Number(o.preco_adicional)) updOpcao(o, { preco_adicional: v }) }} />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={o.ativo} onChange={(e) => updOpcao(o, { ativo: e.target.checked })} />ativa</label>
                <button className="text-xs text-alert" onClick={() => delOpcao(o)}>excluir</button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input className={inputCls + ' !min-h-[40px]'} placeholder="Nova opção (ex.: Bem passado)" value={nova[g.id]?.nome ?? ''} onChange={(e) => setNova((x) => ({ ...x, [g.id]: { nome: e.target.value, preco: x[g.id]?.preco ?? '' } }))} />
            <input className={inputCls + ' !min-h-[40px] !w-28'} inputMode="decimal" placeholder="+ R$" value={nova[g.id]?.preco ?? ''} onChange={(e) => setNova((x) => ({ ...x, [g.id]: { nome: x[g.id]?.nome ?? '', preco: e.target.value } }))} />
            <button className={btnSecCls} onClick={() => addOpcao(g)}>Adicionar</button>
          </div>
        </section>
      ))}
      {ed && (
        <Modal titulo={ed.id ? 'Editar grupo' : 'Novo grupo'} fechar={() => setEd(null)}>
          <Campo r="Nome"><input className={inputCls} value={ed.nome ?? ''} onChange={(e) => setEd({ ...ed, nome: e.target.value })} placeholder="Ponto da carne, Acompanhamento, Escolha a bebida…" /></Campo>
          <Campo r="Tipo"><select className={inputCls} value={ed.tipo} onChange={(e) => setEd({ ...ed, tipo: e.target.value as Grupo['tipo'] })}>{(Object.keys(TIPO) as Grupo['tipo'][]).map((t) => <option key={t} value={t}>{TIPO[t]}</option>)}</select></Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo r="Mínimo (0 = opcional)"><input className={inputCls} inputMode="numeric" value={ed.min_escolhas ?? 0} onChange={(e) => setEd({ ...ed, min_escolhas: Number(e.target.value) || 0 })} /></Campo>
            <Campo r="Máximo"><input className={inputCls} inputMode="numeric" value={ed.max_escolhas ?? 1} onChange={(e) => setEd({ ...ed, max_escolhas: Number(e.target.value) || 1 })} /></Campo>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.ativo ?? true} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} />Ativo</label>
          <button className={btnCls} onClick={salvarGrupo}>Salvar</button>
        </Modal>
      )}
    </div>
  )
}

export const precoTxt = (n: number) => reais(n)
