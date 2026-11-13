import { useCallback, useState } from 'react'
import { db } from '../lib/supabase'
import { Sessao, hora, useAoVivo } from '../lib/pdv'
import { usePermissoes } from '../context/PermissoesContext'

/** Faixa fixa no topo: verde piscando com o caixa aberto, vermelha com o caixa fechado. Só informa. */
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
  return (
    <div role="status" aria-live="polite"
      className={`sticky top-0 z-40 flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-semibold text-white ${aberto ? 'bg-emerald-600' : 'bg-red-600'}`}>
      <span className="relative flex h-2.5 w-2.5">
        {aberto && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />}
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
      </span>
      {aberto
        ? <span className="animate-pulse">CAIXA ABERTO · {abertos.map((s) => `${s.caixa} desde ${hora(s.aberto_em)}`).join(' · ')}</span>
        : <span>CAIXA FECHADO</span>}
    </div>
  )
}
