import { format, startOfWeek } from 'date-fns'

export function dataReferencia(frequencia?: string | null, base = new Date()): string {
  if (frequencia === 'semanal') {
    return format(startOfWeek(base, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  }
  return format(base, 'yyyy-MM-dd')
}
