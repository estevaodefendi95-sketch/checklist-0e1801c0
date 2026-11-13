import { useCallback, useState } from 'react'
import { db } from '../../lib/supabase'
import { Vazio, cartaoCls } from '../../components/Estado'
import { Mesa, useAoVivo } from '../../lib/pdv'

interface Linha { aparelho: string; mesa_id: string | null; nivel: number; carregando: boolean; atualizado_em: string }
const SEM_SINAL_MS = 4 * 60 * 1000
const baixa = (l: Linha) => l.nivel <= 20 && !l.carregando

function useBateria() {
  const [lista, setLista] = useState<Linha[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const carregar = useCallback(async () => {
    const [b, m] = await Promise.all([db.from('pdv_tablet_bateria').select('*'), db.from('pdv_mesas').select('*').eq('ativo', true)])
    setLista((b.data ?? []) as Linha[])
    setMesas((m.data ?? []) as Mesa[])
  }, [])
  useAoVivo(['pdv_tablet_bateria'], carregar, 30000)
  return { lista, mesas }
}

/** Bateria de todos os tablets que já se conectaram (Chrome/Android informa o nível; iPad/Safari não informa). */
export function BateriaTablets() {
  const { lista, mesas } = useBateria()
  const agora = Date.now()
  const nomeMesa = (id: string | null) => mesas.find((m) => m.id === id)?.numero ?? '?'
  const ordem = [...lista].sort((a, b) => String(nomeMesa(a.mesa_id)).localeCompare(String(nomeMesa(b.mesa_id)), 'pt-BR', { numeric: true }))
  const semSinal = mesas.filter((m) => !lista.some((l) => l.mesa_id === m.id))
  return (
    <section className={`${cartaoCls} space-y-3 p-5`}>
      <div>
        <h2 className="font-semibold leading-tight">Bateria dos tablets</h2>
        <p className="mt-0.5 max-w-2xl text-xs text-ink-soft">Atualiza sozinha a cada minuto enquanto o tablet está com o cardápio aberto. Vermelho: 20% ou menos e fora da tomada.</p>
      </div>
      {!ordem.length ? <Vazio texto="Nenhum tablet informou a bateria ainda. Abra o cardápio nos tablets (Chrome no Android)." /> : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ordem.map((l) => {
            const off = agora - new Date(l.atualizado_em).getTime() > SEM_SINAL_MS
            return (
              <li key={l.aparelho} className={`rounded-xl border p-3 text-sm ${!off && baixa(l) ? 'border-red-400 bg-red-50 text-red-900' : 'border-line'}`}>
                <div className="flex items-center justify-between">
                  <b>Mesa {nomeMesa(l.mesa_id)}</b>
                  <span className={`font-semibold tabular-nums ${off ? 'text-ink-soft' : baixa(l) ? 'text-red-700' : ''}`}>{l.nivel}%{l.carregando ? ' ⚡' : ''}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10"><div className={`h-full ${off ? 'bg-gray-400' : baixa(l) ? 'bg-red-500' : l.nivel <= 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${l.nivel}%` }} /></div>
                <p className="mt-1.5 text-xs text-ink-soft">{off ? `sem sinal desde ${new Date(l.atualizado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : l.carregando ? 'carregando' : 'na bateria'}</p>
              </li>
            )
          })}
        </ul>
      )}
      {semSinal.length > 0 && <p className="text-xs text-ink-soft">Sem informação de bateria: {semSinal.map((m) => `Mesa ${m.numero}`).join(', ')}.</p>}
    </section>
  )
}

/** Aviso curto para o painel do salão: tablets com bateria baixa. Some quando está tudo bem. */
export function AvisoBateriaTablets() {
  const { lista, mesas } = useBateria()
  const agora = Date.now()
  const baixos = lista.filter((l) => agora - new Date(l.atualizado_em).getTime() <= SEM_SINAL_MS && baixa(l))
  if (!baixos.length) return null
  const num = (id: string | null) => mesas.find((m) => m.id === id)?.numero ?? '?'
  return (
    <p role="alert" className="mb-3 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800">
      Bateria baixa no tablet: {baixos.map((l) => `Mesa ${num(l.mesa_id)} (${l.nivel}%)`).join(', ')}. Ligue na tomada.
    </p>
  )
}
