const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

export const reais = (v?: number | null) => (v == null ? '—' : brl.format(Number(v)))
export const numero = (v?: number | null) => (v == null ? '—' : num.format(Number(v)))
export const pct = (v?: number | null) =>
  v == null ? '—' : `${num.format(Math.round(Number(v) * 10) / 10)}%`
export function dataBR(v?: string | null) {
  if (!v) return '—'
  const d = new Date(v.length === 10 ? v + 'T12:00:00' : v)
  return d.toLocaleDateString('pt-BR')
}
export function diasDesde(v?: string | null) {
  if (!v) return Infinity
  return Math.floor((Date.now() - new Date(v).getTime()) / 86400000)
}
/** aceita "12,50" ou "12.50" */
export function lerNumero(s: string): number | null {
  const b = s.trim()
  const t = b.includes(',') ? b.replace(/\./g, '').replace(',', '.') : b
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
