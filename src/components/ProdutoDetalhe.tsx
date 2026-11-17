import { FotoPrato } from './FotoPrato'
import { useState, type CSSProperties } from 'react'

// Detalhe do produto no cardápio do cliente: foto grande, descrição completa e adicionais.
export interface DetOpcao { id: string; nome: string; preco_adicional: number }
export interface DetGrupo { id: string; nome: string; tipo?: string; min_escolhas: number; max_escolhas: number; opcoes: DetOpcao[] }
export interface DetProduto { id: string; nome: string; descricao: string | null; preco: number; foto_url: string | null; video_url?: string | null; grupos?: DetGrupo[] }
/** Soma dos adicionais; ids repetidos em `ids` contam uma vez por repetição (grupos de quantidade). */
export function adicionalDe(grupos: DetGrupo[], ids: string[]) {
  const m = new Map(grupos.flatMap((g) => g.opcoes).map((o) => [o.id, Number(o.preco_adicional)]))
  return ids.reduce((s, id) => s + (m.get(id) ?? 0), 0)
}
/** Texto das opções escolhidas, juntando repetidas: "3x Prato, Sem gelo". */
export function resumoOpcoes(grupos: DetGrupo[], ids: string[]) {
  const nomes = new Map(grupos.flatMap((g) => g.opcoes).map((o) => [o.id, o.nome]))
  const cont = new Map<string, number>()
  for (const id of ids) cont.set(id, (cont.get(id) ?? 0) + 1)
  return [...cont].map(([id, n]) => (n > 1 ? `${n}x ` : '') + (nomes.get(id) ?? '')).join(', ')
}
const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ProdutoDetalhe({ produto: p, vars, onFechar, onAdicionar, previa, fotos = true, className = 'fixed inset-0' }: {
  produto: DetProduto; vars: CSSProperties; onFechar: () => void; previa?: boolean; fotos?: boolean; className?: string
  onAdicionar?: (qtd: number, opcoes: string[], obs: string) => void
}) {
  const [sel, setSel] = useState<Record<string, string[]>>({})
  const [obs, setObs] = useState('')
  const [qtd, setQtd] = useState(1)
  const [aviso, setAviso] = useState('')
  const grupos = p.grupos ?? []
  const adicional = adicionalDe(grupos, Object.values(sel).flat())

  function alternar(g: DetGrupo, o: DetOpcao) {
    const atual = sel[g.id] ?? []
    let novo: string[]
    if (atual.includes(o.id)) novo = atual.filter((i) => i !== o.id)
    else if (g.max_escolhas === 1) novo = [o.id]
    else novo = atual.length < g.max_escolhas ? [...atual, o.id] : atual
    setSel({ ...sel, [g.id]: novo }); setAviso('')
  }
  function mudarQtd(g: DetGrupo, o: DetOpcao, d: number) {
    const atual = sel[g.id] ?? []
    if (d > 0) { if (atual.length >= g.max_escolhas) return; setSel({ ...sel, [g.id]: [...atual, o.id] }) }
    else { const i = atual.lastIndexOf(o.id); if (i < 0) return; setSel({ ...sel, [g.id]: atual.filter((_, k) => k !== i) }) }
    setAviso('')
  }
  function adicionar() {
    for (const g of grupos) if ((sel[g.id]?.length ?? 0) < g.min_escolhas) return setAviso(`Escolha ${g.min_escolhas > 1 ? `ao menos ${g.min_escolhas} em` : ''} "${g.nome}".`)
    onAdicionar?.(qtd, Object.values(sel).flat(), obs)
  }

  return (
    <div className={`${className} z-30 flex items-end justify-center bg-black/60 sm:items-center sm:p-6`} onClick={onFechar} style={vars}>
      <div className="flex max-h-[94%] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white text-[#222] shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative shrink-0">
          {fotos && (p.video_url
            ? <video src={p.video_url} poster={p.foto_url ?? undefined} className="max-h-[42vh] min-h-[200px] w-full bg-black object-cover" autoPlay muted loop playsInline controls />
            : p.foto_url
            ? <FotoPrato src={p.foto_url} alt={p.nome} altura="max-h-[40vh]" eager />
            : <div className="grid h-44 w-full place-items-center text-6xl font-semibold" style={{ background: 'color-mix(in srgb, var(--p) 10%, white)', color: 'var(--p)' }}>{p.nome.slice(0, 1)}</div>)}
          <button onClick={onFechar} aria-label="Fechar" className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white/95 text-xl shadow">✕</button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-2xl font-semibold leading-tight">{p.nome}</h2>
              <span className="shrink-0 text-xl font-semibold" style={{ color: 'var(--p)' }}>{brl(p.preco)}</span>
            </div>
            {p.descricao && <p className="mt-2 text-base leading-relaxed opacity-80">{p.descricao}</p>}
          </div>
          {grupos.map((g) => (
            <fieldset key={g.id} className="space-y-2">
              <legend className="mb-1 text-base font-semibold">{g.nome} <span className="text-xs font-normal opacity-60">{g.min_escolhas > 0 ? 'obrigatório' : 'opcional'}{g.tipo === 'quantidade' ? ` · até ${g.max_escolhas} no total` : g.max_escolhas > 1 ? ` · até ${g.max_escolhas}` : ''}</span></legend>
              {g.tipo === 'quantidade' ? g.opcoes.map((o) => {
                const n = (sel[g.id] ?? []).filter((i) => i === o.id).length
                const cheio = (sel[g.id] ?? []).length >= g.max_escolhas
                return (
                  <div key={o.id} className="flex min-h-[52px] w-full items-center justify-between rounded-xl border-2 px-4 text-base" style={n ? { borderColor: 'var(--p)', background: 'color-mix(in srgb, var(--p) 8%, white)' } : { borderColor: '#e5e5e5' }}>
                    <span>{o.nome}{Number(o.preco_adicional) > 0 && <span className="ml-2 text-sm opacity-70">+ {brl(Number(o.preco_adicional))} cada</span>}</span>
                    <span className="flex items-center gap-2 rounded-full border-2 border-[#e5e5e5] bg-white p-1">
                      <button type="button" className="grid h-10 w-10 place-items-center rounded-full text-2xl disabled:opacity-30" disabled={n <= 0} onClick={() => mudarQtd(g, o, -1)} aria-label="Menos">−</button>
                      <b className="w-6 text-center text-lg">{n}</b>
                      <button type="button" className="grid h-10 w-10 place-items-center rounded-full text-2xl text-white disabled:opacity-30" style={{ background: 'var(--p)' }} disabled={cheio} onClick={() => mudarQtd(g, o, 1)} aria-label="Mais">+</button>
                    </span>
                  </div>
                )
              }) : g.opcoes.map((o) => {
                const on = (sel[g.id] ?? []).includes(o.id)
                return (
                  <button key={o.id} type="button" onClick={() => alternar(g, o)} className="flex min-h-[52px] w-full items-center justify-between rounded-xl border-2 px-4 text-left text-base"
                    style={on ? { borderColor: 'var(--p)', background: 'color-mix(in srgb, var(--p) 8%, white)' } : { borderColor: '#e5e5e5' }}>
                    <span className="flex items-center gap-3"><span className="grid h-5 w-5 place-items-center border-2 text-[11px] text-white" style={{ borderRadius: g.max_escolhas === 1 ? 999 : 6, borderColor: on ? 'var(--p)' : '#bbb', background: on ? 'var(--p)' : 'transparent' }}>{on ? '✓' : ''}</span>{o.nome}</span>
                    {Number(o.preco_adicional) > 0 && <span className="text-sm opacity-70">+ {brl(Number(o.preco_adicional))}</span>}
                  </button>
                )
              })}
            </fieldset>
          ))}
          <input className="w-full rounded-xl border-2 border-[#e5e5e5] p-3 text-base" placeholder="Alguma observação? (sem cebola, ponto da carne…)" value={obs} onChange={(e) => setObs(e.target.value)} disabled={previa} />
        </div>
        <div className="shrink-0 space-y-2 border-t border-black/10 p-4">
          {aviso && <p className="text-sm" style={{ color: 'var(--p)' }}>{aviso}</p>}
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border-2 border-[#e5e5e5] p-1">
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-2xl disabled:opacity-30" disabled={qtd <= 1} onClick={() => setQtd(qtd - 1)} aria-label="Menos">−</button>
              <b className="w-6 text-center text-lg">{qtd}</b>
              <button type="button" className="grid h-11 w-11 place-items-center rounded-full text-2xl text-white" style={{ background: 'var(--p)' }} onClick={() => setQtd(Math.min(20, qtd + 1))} aria-label="Mais">+</button>
            </span>
            <button type="button" className="min-h-[52px] flex-1 rounded-xl px-4 text-base font-semibold text-white" style={{ background: 'var(--p)' }} onClick={previa ? onFechar : adicionar}>
              {previa ? `Adicionar · ${brl((p.preco + adicional) * qtd)} (prévia)` : `Adicionar ao pedido · ${brl((p.preco + adicional) * qtd)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
