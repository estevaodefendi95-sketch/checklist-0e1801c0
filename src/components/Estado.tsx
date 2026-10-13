export function Carregando() {
  return <p className="py-6 text-sm text-ink-soft">Carregando…</p>
}
export function Vazio({ texto }: { texto: string }) {
  return <p className="rounded border border-line py-6 text-center text-sm text-ink-soft">{texto}</p>
}
export function Erro({ texto }: { texto: string }) {
  return (
    <p className="rounded border border-alert-soft bg-alert-soft px-3 py-2 text-sm text-alert">{texto}</p>
  )
}
export const inputCls =
  'min-h-[44px] w-full rounded border border-line bg-paper px-3 text-sm outline-none focus:border-ink'
export const btnCls =
  'min-h-[44px] rounded bg-ink px-4 text-sm font-medium text-paper disabled:opacity-50'
export const btnSecCls =
  'min-h-[44px] rounded border border-line px-4 text-sm text-ink-soft hover:border-ink hover:text-ink'
