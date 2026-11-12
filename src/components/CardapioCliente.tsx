import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

// Cardápio digital que o cliente vê (tablet na mesa e QR Code). Layout inspirado no Goomer:
// cabeçalho da casa com busca, categorias em trilho lateral (tablet) ou chips (celular),
// seções por categoria rolando juntas, cartões com foto grande, preço e botão "+".
export interface CardTema { primaria?: string; fundo?: string; texto?: string; destaque?: string; titulo?: string; subtitulo?: string; colunas?: number; mostrar_fotos?: boolean }
export interface CardCat { id: string; nome: string }
export interface CardProd { id: string; nome: string; descricao: string | null; preco: number; categoria_id: string | null; foto_url: string | null; personalizavel?: boolean }
const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function CardapioCliente({ tema, mesa, boasVindas, categorias, produtos, lateral, qtdDe, onAdd, onMenos, acoes, rodape, sobrepor, somenteLeitura }: {
  somenteLeitura?: boolean; tema: CardTema; mesa?: string; boasVindas?: string | null; categorias: CardCat[]; produtos: CardProd[]; lateral: boolean
  qtdDe: (id: string) => number; onAdd: (p: CardProd) => void; onMenos: (id: string) => void
  acoes?: ReactNode; rodape?: ReactNode; sobrepor?: ReactNode
}) {
  const [busca, setBusca] = useState('')
  const [ativa, setAtiva] = useState('')
  const rolagem = useRef<HTMLDivElement>(null)
  const vars = { ['--p' as string]: tema.primaria ?? '#7a1f2b', ['--f' as string]: tema.fundo ?? '#faf7f2', ['--t' as string]: tema.texto ?? '#222222', ['--d' as string]: tema.destaque ?? '#c9a24b' } as CSSProperties
  const termo = busca.trim().toLowerCase()
  const secoes = useMemo(() => categorias.map((c) => ({ c, itens: produtos.filter((p) => p.categoria_id === c.id && (!termo || p.nome.toLowerCase().includes(termo) || (p.descricao ?? '').toLowerCase().includes(termo))) })).filter((s) => s.itens.length), [categorias, produtos, termo])
  const soltos = useMemo(() => produtos.filter((p) => !p.categoria_id && (!termo || p.nome.toLowerCase().includes(termo))), [produtos, termo])
  const colunas = tema.colunas === 1 ? (lateral ? 2 : 1) : (lateral ? 3 : 2)
  const vertical = colunas >= 2
  const fotos = tema.mostrar_fotos !== false

  useEffect(() => { if (!ativa && categorias[0]) setAtiva(categorias[0].id) }, [categorias, ativa])
  function ir(id: string) {
    const el = rolagem.current?.querySelector<HTMLElement>(`[data-cat="${id}"]`)
    if (el && rolagem.current) rolagem.current.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' })
    setAtiva(id)
  }
  function aoRolar() {
    const r = rolagem.current; if (!r) return
    let atual = ''
    r.querySelectorAll<HTMLElement>('[data-cat]').forEach((el) => { if (el.offsetTop - 24 <= r.scrollTop) atual = el.dataset.cat ?? atual })
    if (atual && atual !== ativa) setAtiva(atual)
  }

  const Card = ({ p }: { p: CardProd }) => {
    const q = qtdDe(p.id)
    const foto = fotos ? (p.foto_url
      ? <img src={p.foto_url} alt="" loading="lazy" className={vertical ? 'aspect-[4/3] w-full object-cover' : 'h-24 w-24 shrink-0 rounded-xl object-cover'} />
      : <span className={`grid place-items-center text-3xl font-semibold ${vertical ? 'aspect-[4/3] w-full' : 'h-24 w-24 shrink-0 rounded-xl'}`} style={{ background: 'color-mix(in srgb, var(--p) 10%, white)', color: 'var(--p)' }}>{p.nome.slice(0, 1).toUpperCase()}</span>) : null
    const controle = somenteLeitura ? null : q > 0 ? (
      <span className="flex items-center gap-2 rounded-full bg-white px-1 py-1 shadow" onClick={(e) => e.stopPropagation()}>
        <button className="grid h-8 w-8 place-items-center rounded-full border text-lg" onClick={() => onMenos(p.id)} aria-label="Remover um">−</button>
        <b className="min-w-4 text-center text-sm">{q}</b>
        <button className="grid h-8 w-8 place-items-center rounded-full text-lg text-white" style={{ background: 'var(--p)' }} onClick={() => onAdd(p)} aria-label="Adicionar mais um">+</button>
      </span>
    ) : (
      <span className="grid h-9 w-9 place-items-center rounded-full text-xl text-white shadow" style={{ background: 'var(--p)' }} aria-hidden>+</span>
    )
    return (
      <li className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div role="button" tabIndex={0} onClick={() => !somenteLeitura && onAdd(p)} onKeyDown={(e) => e.key === 'Enter' && !somenteLeitura && onAdd(p)} className={`flex ${somenteLeitura ? '' : 'cursor-pointer'} ${vertical ? 'h-full flex-col' : 'items-stretch gap-3 p-3'}`}>
          {vertical && foto}
          <div className={`flex min-w-0 flex-1 flex-col ${vertical ? 'p-3' : ''}`}>
            <b className="leading-tight">{p.nome}</b>
            {p.descricao && <span className="mt-1 line-clamp-2 text-xs opacity-70">{p.descricao}</span>}
            {p.personalizavel && <span className="mt-1 w-fit rounded-full px-2 py-0.5 text-[10px] text-white" style={{ background: 'var(--d)' }}>personalize</span>}
            <span className="mt-auto flex items-end justify-between gap-2 pt-2">
              <span className="font-semibold" style={{ color: 'var(--p)' }}>{brl(p.preco)}</span>
              {controle}
            </span>
          </div>
          {!vertical && foto}
        </div>
      </li>
    )
  }
  const grade = { gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }

  return (
    <div className="relative flex h-full flex-col" style={{ ...vars, background: 'var(--f)', color: 'var(--t)' }}>
      <header className="shrink-0 px-4 pb-3 pt-4" style={{ background: 'var(--p)', color: '#fff' }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] opacity-80">{mesa ? `Mesa ${mesa}` : 'Cardápio digital'}</div>
            <h1 className="truncate text-2xl font-semibold leading-tight">{tema.titulo || 'Paggio'}</h1>
            {(boasVindas || tema.subtitulo) && <p className="mt-0.5 line-clamp-2 text-xs opacity-85">{boasVindas || tema.subtitulo}</p>}
          </div>
          {acoes && <div className="flex shrink-0 gap-2">{acoes}</div>}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-[var(--t)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="opacity-60"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no cardápio" className="w-full bg-transparent text-sm outline-none" />
        </div>
        <div className="mt-3 h-[3px] w-16 rounded-full" style={{ background: 'var(--d)' }} />
      </header>

      {!lateral && secoes.length > 1 && !termo && (
        <nav className="flex shrink-0 gap-2 overflow-x-auto px-3 py-2 shadow-sm" style={{ background: 'var(--f)' }}>
          {secoes.map(({ c }) => (
            <button key={c.id} onClick={() => ir(c.id)} className="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium" style={ativa === c.id ? { background: 'var(--p)', color: '#fff' } : { background: '#fff', color: 'var(--t)' }}>{c.nome}</button>
          ))}
        </nav>
      )}

      <div className="flex min-h-0 flex-1">
        {lateral && !termo && (
          <nav className="w-36 shrink-0 space-y-1 overflow-y-auto border-r border-black/5 p-2" style={{ background: 'color-mix(in srgb, var(--f) 92%, black)' }}>
            {secoes.map(({ c }) => (
              <button key={c.id} onClick={() => ir(c.id)} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-medium leading-tight"
                style={ativa === c.id ? { background: 'var(--p)', color: '#fff', boxShadow: 'inset 4px 0 0 var(--d)' } : { color: 'var(--t)' }}>{c.nome}</button>
            ))}
          </nav>
        )}
        <div ref={rolagem} onScroll={aoRolar} className="relative min-w-0 flex-1 overflow-y-auto px-3 pb-36 pt-3">
          {!secoes.length && !soltos.length && <p className="p-6 text-center text-sm opacity-70">{termo ? 'Nada encontrado para a busca.' : 'Nenhum item disponível neste horário.'}</p>}
          {secoes.map(({ c, itens }) => (
            <section key={c.id} data-cat={c.id} className="mb-5">
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold"><span className="h-5 w-1 rounded-full" style={{ background: 'var(--d)' }} />{c.nome}</h2>
              <ul className="grid gap-3" style={grade}>{itens.map((p) => <Card key={p.id} p={p} />)}</ul>
            </section>
          ))}
          {soltos.length > 0 && <section className="mb-5"><h2 className="mb-2 text-lg font-semibold">Outros</h2><ul className="grid gap-3" style={grade}>{soltos.map((p) => <Card key={p.id} p={p} />)}</ul></section>}
        </div>
      </div>
      {rodape && <div className="absolute inset-x-0 bottom-0 z-10 space-y-2 p-3" style={{ background: 'linear-gradient(to top, var(--f) 70%, transparent)' }}>{rodape}</div>}
      {sobrepor}
    </div>
  )
}
