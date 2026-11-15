import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { lerPosicao } from '../lib/localizacao'
import { Alerta } from './Estado'

/** Usuário marcado como "só opera dentro do restaurante": confirma a posição a cada ~45 s.
 *  O servidor só libera operar/receber enquanto a última posição (válida por 2 min) estiver dentro do raio. */
export function AvisoForaDoLocal() {
  const { profile } = useAuth()
  const [restrito, setRestrito] = useState(false)
  const [estado, setEstado] = useState<{ dentro: boolean; dist_m: number; raio_m: number } | null>(null)
  const [erro, setErro] = useState('')
  const vivo = useRef(true)

  const checar = useCallback(async () => {
    try {
      const p = await lerPosicao()
      const { data, error } = await db.rpc('pdv_registrar_presenca', { p_lat: p.lat, p_lng: p.lng, p_precisao: p.precisao })
      if (!vivo.current) return
      if (error) throw new Error(error.message)
      setErro(''); setEstado(data)
    } catch (e) {
      if (!vivo.current) return
      setEstado(null); setErro((e as Error).message)
    }
  }, [])

  useEffect(() => {
    vivo.current = true
    if (!profile) return
    db.rpc('pdv_geo_estado').then(({ data }: { data: { ativo?: boolean; restrito?: boolean } | null }) => {
      if (vivo.current) setRestrito(!!data?.ativo && !!data?.restrito)
    })
    return () => { vivo.current = false }
  }, [profile?.id])

  useEffect(() => {
    if (!restrito) return
    checar()
    const t = setInterval(checar, 45000)
    const v = () => { if (document.visibilityState === 'visible') checar() }
    document.addEventListener('visibilitychange', v)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v) }
  }, [restrito, checar])

  if (!restrito || estado?.dentro) return null
  return (
    <div className="mb-3">
      <Alerta tipo="erro" titulo="Fora do local de trabalho"
        texto={erro || `Você está a cerca de ${estado?.dist_m ?? '?'} m do restaurante (limite: ${estado?.raio_m ?? '?'} m). Enquanto isso o PDV fica bloqueado: não dá para abrir comanda, lançar pedido nem receber.`}
        acao={<button className="min-h-[40px] rounded-lg px-3 text-sm font-medium underline" onClick={checar}>Verificar de novo</button>} />
    </div>
  )
}
