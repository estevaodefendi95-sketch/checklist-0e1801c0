export function Carregando() {
  return (
    <p className="py-8 text-sm text-ink-soft" role="status">
      Carregando…
    </p>
  )
}
export function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-xl bg-surface py-10 text-center text-sm text-ink-soft shadow-card">{texto}</p>
}
export function Erro({ texto }: { texto: string }) {
  return (
    <p className="rounded-xl border border-alert/30 bg-alert-soft px-4 py-3 text-sm text-alert" role="alert">
      {texto}
    </p>
  )
}
export const inputCls =
  'min-h-[44px] w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-brand md:min-h-[48px]'
/** botão primário: um por tela, o CTA principal */
export const btnCls =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] bg-brand px-[18px] text-sm font-semibold text-brand-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50 md:min-h-[48px]'
/** botão secundário (contorno na cor da marca) */
export const btnSecCls =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] border border-brand/40 px-4 text-sm font-medium text-brand transition-colors hover:border-brand hover:bg-brand-soft disabled:opacity-50 md:min-h-[48px]'
/** ação destrutiva */
export const btnPerigoCls =
  'inline-flex min-h-[44px] items-center justify-center rounded-[10px] border border-alert/40 px-3 text-sm font-medium text-alert transition-colors hover:border-alert hover:bg-alert-soft disabled:opacity-50 md:min-h-[48px]'
/** cartão padrão: fundo, sombra leve, sem borda pesada */
export const cartaoCls = 'rounded-[14px] bg-surface shadow-card'
/** chip de filtro */
export function chipCls(ativo: boolean) {
  return `inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm transition-colors ${
    ativo ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-line bg-surface text-ink-soft hover:text-ink'
  }`
}
