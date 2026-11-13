import { useCallback, useState } from 'react'
import { db } from '../lib/supabase'
import { Sessao, useAoVivo } from '../lib/pdv'
import { usePermissoes } from '../context/PermissoesContext'

/** Indicador discreto ao lado do logo: bolinha verde piscando (caixa aberto) ou vermelha (fechado). Detalhes ficam na tela do Caixa. */
export function FaixaCaixa({ compacto = false }: { compacto?: boolean }) {
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
  const txt = aberto ? 'Caixa aberto' : 'Caixa fechado'
  return (
    <span role="status" aria-live="polite" aria-label={txt} title={txt} className="inline-flex items-center gap-1.5 text-[11px] font-medium leading-none">
      <span className={`relative flex ${compacto ? "h-2.5 w-2.5" : "h-2 w-2"}`}>
        {aberto && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={`relative inline-flex h-full w-full rounded-full ${aberto ? 'bg-emerald-500' : 'bg-red-500'}`} />
      </span>
      {!compacto && <span>{txt}</span>}
    </span>
  )
}
