import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { noHorarios, type Faixa } from '../../lib/pdv'
import { Avisos, Campo, useSalvarMsg } from './PdvConfig'

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const ICONES: Record<string, string> = { cardapio: '🍽️', bebidas: '🥤', sobremesas: '🍰', alcoolicas: '🍸', destaques: '⭐', ofertas: '🏷️' }
const NOMES_ICONE: Record<string, string> = { cardapio: 'Pratos', bebidas: 'Bebidas', sobremesas: 'Sobremesas', alcoolicas: 'Bebidas alcoólicas', destaques: 'Destaques', ofertas: 'Ofertas' }

interface Menu { id: string; nome: string; icone: string; ordem: number; visivel: boolean; horarios: Faixa[] | null; ativo: boolean }
interface Cat { id: string; nome: string; ordem: number; visivel_tablet: boolean; horarios: Faixa[] | null; menu_id: string | null }

export function resumoHorario(h: Faixa[] | null | undefined) {
  if (!h?.length) return 'Sempre'
  const dias = [...new Set(h.map((f) => f.dia))].sort()
  const f = h[0]
  return `${dias.length === 7 ? 'Todos os dias' : dias.map((d) => DIAS[d].slice(0, 3)).join(', ')} · ${f.inicio.slice(0, 5)}–${f.fim.slice(0, 5)}${h.length > 1 && new Set(h.map((x) => x.inicio + x.fim)).size > 1 ? ' …' : ''}`
}

/** Editor de horário por dia da semana (várias faixas por dia). Sem faixas = sempre ativo. */
export function HorariosEditor({ valor, onChange }: { valor: Faixa[] | null; onChange: (v: Faixa[] | null) => void }) {
  const faixas = valor ?? []
  const set = (n: Faixa[]) => onChange(n.length ? n : null)
  const add = (dia: number) => set([...faixas, { dia, inicio: '10:00', fim: '23:00' }])
  const upd = (i: number, p: Partial<Faixa>) => set(faixas.map((f, k) => (k === i ? { ...f, ...p } : f)))
  const del = (i: number) => set(faixas.filter((_, k) => k !== i))
  function copiar(dia: number) {
    const base = faixas.filter((f) => f.dia === dia)
    if (!base.length) return
    set([...faixas.filter((f) => f.dia === dia), ...DIAS.flatMap((_, d) => (d === dia ? [] : base.map((f) => ({ ...f, dia: d }))))])
  }
  return (
    <div className="space-y-2">
      <p className="rounded-lg bg-brand-soft p-2 text-xs text-ink-soft"><b>Sem horário definido</b>, fica sempre ativo. <b>Com horário</b>, só aparece no tablet dentro do período. Fim menor que o início vira a madrugada (ex.: 18:00 → 02:00).</p>
      {DIAS.map((nome, dia) => {
        const doDia = faixas.map((f, i) => ({ f, i })).filter((x) => x.f.dia === dia)
        return (
          <div key={dia} className="flex flex-wrap items-center gap-2 border-b border-line pb-2 text-sm">
            <span className="w-20 font-medium">{nome}</span>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              {!doDia.length && <span className="text-xs text-ink-soft">{faixas.length ? 'Fechado' : 'Sempre'}</span>}
              {doDia.map(({ f, i }) => (
                <span key={i} className="flex items-center gap-1">
                  <input type="time" className={inputCls + ' !w-28'} value={f.inicio.slice(0, 5)} onChange={(e) => upd(i, { inicio: e.target.value })} />
                  <span>até</span>
                  <input type="time" className={inputCls + ' !w-28'} value={f.fim.slice(0, 5)} onChange={(e) => upd(i, { fim: e.target.value })} />
                  <button type="button" className={btnSecCls + ' !min-h-[36px] !px-2'} onClick={() => del(i)} aria-label="Remover faixa">−</button>
                </span>
              ))}
            </div>
            <button type="button" className={btnSecCls + ' !min-h-[36px] !px-2'} onClick={() => add(dia)} aria-label="Adicionar faixa">+</button>
            {!!doDia.length && <button type="button" className={btnSecCls + ' !min-h-[36px] !px-2 text-xs'} onClick={() => copiar(dia)}>Copiar p/ todos</button>}
          </div>
        )
      })}
      <div className="flex justify-between">
        <button type="button" className={btnSecCls} onClick={() => onChange(null)}>Sempre ativo (limpar)</button>
        <button type="button" className={btnSecCls} onClick={() => onChange(DIAS.map((_, dia) => ({ dia, inicio: '10:00', fim: '23:30' })))}>Todos os dias 10:00–23:30</button>
      </div>
    </div>
  )
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onFechar}>
      <div className={`${cartaoCls} max-h-[90vh] w-full max-w-xl space-y-3 overflow-y-auto p-5`} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{titulo}</h3>
        {children}
      </div>
    </div>
  )
}

type Filtro = 'todas' | 'visiveis' | 'invisiveis' | 'horario' | string // string = id do menu

export function CardapioTablet() {
  const [menus, setMenus] = useState<Menu[] | null>(null)
  const [cats, setCats] = useState<Cat[]>([])
  const [qtd, setQtd] = useState<Record<string, number>>({})
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [relogioCat, setRelogioCat] = useState<Cat | null>(null)
  const [relogioMenu, setRelogioMenu] = useState<Menu | null>(null)
  const [edMenu, setEdMenu] = useState<Partial<Menu> | null>(null)
  const [rascunho, setRascunho] = useState<Faixa[] | null>(null)
  const s = useSalvarMsg()

  const carregar = useCallback(async () => {
    const [m, c, p] = await Promise.all([
      db.from('pdv_menus').select('*').eq('ativo', true).order('ordem').order('criado_em'),
      db.from('pdv_categorias').select('id,nome,ordem,visivel_tablet,horarios,menu_id').eq('ativo', true).order('ordem'),
      db.from('pdv_produtos').select('categoria_id').eq('ativo', true),
    ])
    setMenus((m.data ?? []) as Menu[]); setCats((c.data ?? []) as Cat[])
    const q: Record<string, number> = {}
    for (const x of (p.data ?? []) as { categoria_id: string | null }[]) if (x.categoria_id) q[x.categoria_id] = (q[x.categoria_id] ?? 0) + 1
    setQtd(q)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const menuPorId = useMemo(() => new Map((menus ?? []).map((m) => [m.id, m])), [menus])
  const menuNoAr = (m: Menu | undefined) => !m || (m.visivel && noHorarios(m.horarios))
  const noAr = (c: Cat) => c.visivel_tablet && noHorarios(c.horarios) && menuNoAr(c.menu_id ? menuPorId.get(c.menu_id) : undefined)

  const lista = cats.filter((c) => filtro === 'todas' || (filtro === 'visiveis' ? c.visivel_tablet : filtro === 'invisiveis' ? !c.visivel_tablet : filtro === 'horario' ? !!c.horarios?.length : c.menu_id === filtro))

  async function patchCat(c: Cat, p: Partial<Cat>) {
    const r = await db.from('pdv_categorias').update(p).eq('id', c.id)
    if (r.error) s.falha(r.error.message); else { s.ok(); carregar() }
  }
  async function patchMenu(m: Menu, p: Partial<Menu>) {
    const r = await db.from('pdv_menus').update(p).eq('id', m.id)
    if (r.error) s.falha(r.error.message); else { s.ok(); carregar() }
  }
  async function salvarMenu() {
    if (!edMenu?.nome?.trim()) return s.falha('Dê um nome ao menu.')
    const dados = { nome: edMenu.nome.trim(), icone: edMenu.icone ?? 'cardapio', visivel: edMenu.visivel !== false }
    const r = edMenu.id ? await db.from('pdv_menus').update(dados).eq('id', edMenu.id) : await db.from('pdv_menus').insert({ ...dados, ordem: (menus?.length ?? 0) + 1 })
    if (r.error) s.falha(r.error.message); else { s.ok(); setEdMenu(null); carregar() }
  }
  async function apagarMenu(m: Menu) {
    if (!window.confirm(`Excluir o menu "${m.nome}"? As categorias dele ficam sem menu (sempre visíveis).`)) return
    const r = await db.from('pdv_menus').delete().eq('id', m.id)
    if (r.error) s.falha(r.error.message); else { s.ok(); carregar() }
  }
  async function moverMenu(m: Menu, d: -1 | 1) {
    if (!menus) return
    const i = menus.findIndex((x) => x.id === m.id), o = menus[i + d]
    if (!o) return
    await Promise.all([db.from('pdv_menus').update({ ordem: i + d + 1 }).eq('id', m.id), db.from('pdv_menus').update({ ordem: i + 1 }).eq('id', o.id)])
    carregar()
  }
  async function salvarRelogio() {
    const faixas = rascunho?.length ? rascunho : null
    if (relogioCat) await patchCat(relogioCat, { horarios: faixas })
    if (relogioMenu) await patchMenu(relogioMenu, { horarios: faixas })
    setRelogioCat(null); setRelogioMenu(null)
  }

  if (!menus) return <Carregando />
  const chip = (v: Filtro, r: string, n?: number) => (
    <button key={v} className={filtro === v ? btnCls : btnSecCls} onClick={() => setFiltro(v)}>{r}{n !== undefined ? ` (${n})` : ''}</button>
  )

  return (
    <div className="space-y-4">
      <Avisos s={s} />

      <section className={`${cartaoCls} space-y-3 p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div><h2 className="font-semibold">Menus do cardápio</h2><p className="text-xs text-ink-soft">Agrupam as categorias (ex.: Pratos, Bebidas, Sobremesas). Cada menu pode ser escondido ou ter horário próprio; as categorias dentro dele seguem o menu.</p></div>
          <button className={btnCls} onClick={() => setEdMenu({ icone: 'cardapio', visivel: true })}>Novo menu</button>
        </div>
        {!menus.length ? <Vazio texto="Nenhum menu criado. Sem menus, todas as categorias aparecem juntas." /> : (
          <ul className="space-y-2">
            {menus.map((m, i) => {
              const ar = menuNoAr(m)
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft text-xl">{ICONES[m.icone] ?? '🍽️'}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <b>{m.nome}</b>
                    <div className="text-xs text-ink-soft">{cats.filter((c) => c.menu_id === m.id).length} categoria(s) · Horário: {resumoHorario(m.horarios)} · {ar ? 'no ar agora' : 'fora do ar agora'}</div>
                  </div>
                  <button className={m.visivel ? btnCls : btnSecCls} onClick={() => patchMenu(m, { visivel: !m.visivel })}>{m.visivel ? 'Visível' : 'Invisível'}</button>
                  <button className={btnSecCls} onClick={() => { setRascunho(m.horarios); setRelogioMenu(m) }}>🕒 Horário</button>
                  <button className={btnSecCls + ' !min-h-[38px]'} disabled={i === 0} onClick={() => moverMenu(m, -1)}>↑</button>
                  <button className={btnSecCls + ' !min-h-[38px]'} disabled={i === menus.length - 1} onClick={() => moverMenu(m, 1)}>↓</button>
                  <button className={btnSecCls} onClick={() => setEdMenu(m)}>Editar</button>
                  <button className={btnPerigoCls} onClick={() => apagarMenu(m)}>Excluir</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className={`${cartaoCls} space-y-3 p-4`}>
        <div><h2 className="font-semibold">Categorias — visão rápida</h2><p className="text-xs text-ink-soft">Veja de uma vez o que está no ar. Mude o menu, a visibilidade e o horário de cada categoria aqui mesmo.</p></div>
        <div className="flex flex-wrap gap-2">
          {chip('todas', 'Todas', cats.length)}
          {chip('visiveis', 'Visíveis', cats.filter((c) => c.visivel_tablet).length)}
          {chip('invisiveis', 'Invisíveis', cats.filter((c) => !c.visivel_tablet).length)}
          {chip('horario', 'Com horário', cats.filter((c) => c.horarios?.length).length)}
          {menus.map((m) => chip(m.id, `Menu: ${m.nome}`, cats.filter((c) => c.menu_id === m.id).length))}
        </div>
        {!lista.length ? <Vazio texto="Nenhuma categoria neste filtro." /> : (
          <ul className="space-y-2">
            {lista.map((c) => {
              const ar = noAr(c), n = qtd[c.id] ?? 0
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                  <div className="min-w-0 flex-1 text-sm">
                    <b>{c.nome}</b>
                    <div className="text-xs text-ink-soft">{n ? `${n} produto(s)` : 'Nenhum produto'} · Horário: {resumoHorario(c.horarios)}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${!n ? 'bg-line text-ink-soft' : ar ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {!n ? 'Vazia' : ar ? 'No ar agora' : !c.visivel_tablet ? 'Escondida' : 'Fora do horário'}
                  </span>
                  <select className={inputCls + ' !w-44'} value={c.menu_id ?? ''} onChange={(e) => patchCat(c, { menu_id: e.target.value || null })} aria-label="Menu da categoria">
                    <option value="">Sem menu</option>{menus.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  <button className={c.visivel_tablet ? btnCls : btnSecCls} onClick={() => patchCat(c, { visivel_tablet: !c.visivel_tablet })}>{c.visivel_tablet ? 'Visível' : 'Invisível'}</button>
                  <button className={c.horarios?.length ? btnCls : btnSecCls} onClick={() => { setRascunho(c.horarios); setRelogioCat(c) }}>🕒 Horário</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {(relogioCat || relogioMenu) && (
        <Modal titulo={`Horários ativos — ${relogioCat?.nome ?? relogioMenu?.nome}`} onFechar={() => { setRelogioCat(null); setRelogioMenu(null) }}>
          <HorariosEditor valor={rascunho} onChange={setRascunho} />
          <div className="flex justify-end gap-2"><button className={btnSecCls} onClick={() => { setRelogioCat(null); setRelogioMenu(null) }}>Fechar</button><button className={btnCls} onClick={salvarRelogio}>Salvar</button></div>
        </Modal>
      )}
      {edMenu && (
        <Modal titulo={edMenu.id ? 'Editar menu' : 'Novo menu'} onFechar={() => setEdMenu(null)}>
          <Campo r="Nome"><input className={inputCls} value={edMenu.nome ?? ''} onChange={(e) => setEdMenu({ ...edMenu, nome: e.target.value })} /></Campo>
          <Campo r="Ícone">
            <div className="flex flex-wrap gap-2">
              {Object.keys(ICONES).map((k) => <button key={k} type="button" className={edMenu.icone === k ? btnCls : btnSecCls} onClick={() => setEdMenu({ ...edMenu, icone: k })}>{ICONES[k]} {NOMES_ICONE[k]}</button>)}
            </div>
          </Campo>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edMenu.visivel !== false} onChange={(e) => setEdMenu({ ...edMenu, visivel: e.target.checked })} />Visível no tablet</label>
          <div className="flex justify-end gap-2"><button className={btnSecCls} onClick={() => setEdMenu(null)}>Cancelar</button><button className={btnCls} onClick={salvarMenu}>Salvar</button></div>
        </Modal>
      )}
    </div>
  )
}
