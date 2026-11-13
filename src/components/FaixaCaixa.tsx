import { useCallback, useState } from 'react'
import { db } from '../lib/supabase'
import { Sessao, hora, useAoVivo } from '../lib/pdv'
import { usePermissoes } from '../context/PermissoesContext'

/** Indicador discreto no canto superior direito: bolinha verde piscando (aberto) ou vermelha (fechado). Só informa. */
export function FaixaCaixa() {
  const { pode } = usePermissoes()
  const vê = pode('pdv_operar') || pode('pdv_caixa') || pode('pdv_gerir')
  const [abertos, setAbertos] = useState<Sessao[] | null>(null)
  const carregar = useCallback(async () => {
    if (!vê) return
    const r = await db.from('pdv_caixa_sessoes').select('*').eq('status', 'aberto').order('aberto_em')
    if (!r.error) setAbertos((r.data ?? []) as Sessao[])
  }, [vê])
  useAoVivo(['pdv_caixa_sessoes'], carregar, 30000)
  if (!vê || abertos === null) return null
  const aberto = abertos.length > 0
  const txt = aberto ? `Caixa aberto · ${abertos.map((s) => `${s.caixa} ${hora(s.aberto_em)}`).join(' · ')}` : 'Caixa fechado'
  return (
    <div role="status" aria-live="polite" title={txt}
      className="pointer-events-none fixed right-3 top-3 z-40 flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-2.5 py-1 text-xs font-medium text-ink shadow-sm backdrop-blur">
      <span className="relative flex h-2 w-2">
        {aberto && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${aberto ? 'bg-emerald-500' : 'bg-red-500'}`} />
      </span>
      <span className="max-w-[40vw] truncate">{txt}</span>
    </div>
  )
}
