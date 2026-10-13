import { Link } from 'react-router-dom'
import { numero, reais } from '../lib/formato'
import { ItemView, Pendencia, passos } from '../lib/fichas'

/** Ingredientes agrupados: itens soltos primeiro, depois cada grupo de escolha */
export function Ingredientes({
  itens,
  fator,
  pendencias,
  custos,
  grande,
}: {
  itens: ItemView[]
  fator: number
  pendencias?: Pendencia[]
  custos?: Map<string, number | null> | null
  grande?: boolean
}) {
  const soltos = itens.filter((i) => !i.grupo_escolha)
  const grupos = [...new Set(itens.map((i) => i.grupo_escolha).filter(Boolean))] as string[]
  const tam = grande ? 'text-xl py-3' : 'text-sm py-2'

  function linha(i: ItemView) {
    const pend = pendencias?.filter((p) => p.item === i.nome) ?? []
    return (
      <li key={i.id} className={`flex flex-wrap items-baseline justify-between gap-x-3 ${tam}`}>
        <span>
          {i.sub_ficha_id && !grande ? (
            <Link to={`/fichas/${i.sub_ficha_id}`} className="underline">
              {i.nome}
            </Link>
          ) : (
            i.nome
          )}
          {i.sub_ficha_id && <span className="ml-1 text-xs opacity-70">(preparação)</span>}
          {i.observacao && <span className="ml-1 text-xs opacity-70">· {i.observacao}</span>}
          {pend.map((p) => (
            <span key={p.problema} className="ml-2 rounded bg-alert-soft px-1.5 py-0.5 text-xs text-alert">
              {p.problema === 'insumo sem preço' ? 'sem preço' : p.problema}
            </span>
          ))}
        </span>
        <span className="flex items-baseline gap-3">
          <b className="font-medium">
            {numero(Number(i.quantidade) * fator)} {i.unidade}
          </b>
          {custos && fator === 1 && <span className="w-20 text-right text-xs">{reais(custos.get(i.id))}</span>}
        </span>
      </li>
    )
  }

  if (itens.length === 0) return <p className="text-sm opacity-70">Nenhum ingrediente cadastrado.</p>
  return (
    <div>
      <ul className="divide-y divide-line">{soltos.map(linha)}</ul>
      {grupos.map((g) => (
        <div key={g} className="mt-3">
          <div className="text-xs uppercase tracking-wide opacity-70">escolha um · {g}</div>
          <ul className="divide-y divide-line">{itens.filter((i) => i.grupo_escolha === g).map(linha)}</ul>
        </div>
      ))}
    </div>
  )
}

export function Passos({ texto, grande }: { texto: string | null; grande?: boolean }) {
  const lista = passos(texto)
  if (lista.length === 0) return <p className="text-sm opacity-70">Sem modo de preparo cadastrado.</p>
  return (
    <ol className={`space-y-2 ${grande ? 'text-xl' : 'text-sm'}`}>
      {lista.map((p, n) => (
        <li key={n} className="flex gap-3">
          <span className={`display shrink-0 font-medium ${grande ? 'w-8' : 'w-5'}`}>{n + 1}.</span>
          <span>{p}</span>
        </li>
      ))}
    </ol>
  )
}

/** seletor de quantas porções (ou kg/L/un, para preparações) a tela deve mostrar */
export function SeletorPorcoes({
  valor,
  base,
  unidade,
  onChange,
  grande,
}: {
  valor: number
  base: number
  unidade: string
  onChange: (v: number) => void
  grande?: boolean
}) {
  const passo = base >= 2 ? 1 : base / 2 || 1
  const btn = `min-h-[44px] min-w-[44px] rounded border border-line ${grande ? 'text-2xl' : 'text-lg'}`
  return (
    <div className="flex items-center gap-2">
      <button className={btn} onClick={() => onChange(Math.max(passo, +(valor - passo).toFixed(3)))} aria-label="menos">
        −
      </button>
      <input
        inputMode="decimal"
        value={String(valor).replace('.', ',')}
        onChange={(e) => {
          const n = Number(e.target.value.replace(',', '.'))
          if (Number.isFinite(n) && n > 0) onChange(n)
        }}
        className={`min-h-[44px] w-20 rounded border border-line bg-transparent px-2 text-center ${grande ? 'text-2xl' : ''}`}
      />
      <button className={btn} onClick={() => onChange(+(valor + passo).toFixed(3))} aria-label="mais">
        +
      </button>
      <span className="text-sm opacity-70">{unidade}</span>
      {valor !== base && (
        <button onClick={() => onChange(base)} className="ml-1 min-h-[44px] text-xs underline">
          voltar a {numero(base)}
        </button>
      )}
    </div>
  )
}
