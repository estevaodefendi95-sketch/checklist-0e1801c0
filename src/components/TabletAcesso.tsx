import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../integrations/supabase/client'

export const MESA_KEY = 'paggio-mesa-token'
export const lerMesaSalva = () => { try { return localStorage.getItem(MESA_KEY) } catch { return null } }
export const salvarMesa = (t: string) => { try { localStorage.setItem(MESA_KEY, t) } catch { /* sem armazenamento */ } }

/** Segurar o dedo por ~1 s: evita que o cliente aperte sem querer as áreas de gerência do tablet. */
export function useSegurar(fn?: () => void, ms = 1000) {
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  const limpar = () => { if (t.current) { clearTimeout(t.current); t.current = null } }
  useEffect(() => limpar, [])
  if (!fn) return {}
  return {
    onPointerDown: () => { limpar(); t.current = setTimeout(() => { t.current = null; fn() }, ms) },
    onPointerUp: limpar, onPointerLeave: limpar, onPointerCancel: limpar,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    style: { WebkitTouchCallout: 'none', userSelect: 'none', touchAction: 'manipulation' } as React.CSSProperties,
  }
}

interface MesaTk { numero: string; qr_token: string; capacidade: number }
/** Pede o PIN de supervisor (cadastrado pelo administrador, com "pode autorizar") antes de trocar de mesa ou sair do cardápio. */
export function AutorizarTablet({ token, modo, mesaAtual, onTrocar, onSair, onCancelar }: {
  token?: string; modo: 'trocar' | 'sair' | 'reservar' | 'liberar'; mesaAtual?: string
  onTrocar: (tokenNovo: string) => void; onSair: () => void; onCancelar?: () => void
}) {
  const [pin, setPin] = useState('')
  const [erro, setErro] = useState('')
  const [carga, setCarga] = useState(false)
  const [mesas, setMesas] = useState<MesaTk[] | null>(null)
  const [nome, setNome] = useState('')
  const [hora, setHora] = useState('')

  async function entrar() {
    setErro(''); setCarga(true)
    // sem mesa definida ainda (endereço único do tablet): ação "configurar"
    const acao = modo === 'reservar' ? 'reservar' : modo === 'liberar' ? 'liberar_manual' : token ? 'autorizar' : 'configurar'
    const { data, error } = await supabase.functions.invoke('pdv-tablet', { body: { token, acao, pin, nome, hora } })
    setCarga(false); setPin('')
    if (error) return setErro('Sem conexão. Tente de novo.')
    if (data?.erro) return setErro(data.erro)
    if (modo !== 'trocar') return onSair()
    setMesas((data.mesas ?? []) as MesaTk[])
  }
  const campo = 'w-full rounded-xl border border-black/20 p-3 text-base text-[#222]'
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onCancelar}>
      <div className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-5 text-[#222] shadow-xl" onClick={(e) => e.stopPropagation()}>
        {!mesas ? (
          <>
            <h2 className="text-lg font-semibold">{modo === 'trocar' ? 'Trocar a mesa deste tablet' : modo === 'sair' ? 'Sair do cardápio' : modo === 'reservar' ? 'Marcar a mesa como reservada' : 'Liberar a mesa reservada'}</h2>
            <p className="text-sm opacity-70">Acesso da equipe: digite o PIN de supervisor.</p>
            {modo === 'reservar' && <>
              <input className={campo} maxLength={60} placeholder="Nome da reserva" value={nome} onChange={(e) => setNome(e.target.value)} />
              <label className="block text-sm opacity-70">Horário da reserva (opcional)<input className={campo + ' mt-1'} type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
            </>}
            <input className={campo + ' text-center text-2xl tracking-[0.5em]'} type="password" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="PIN" value={pin} autoFocus onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && pin.length >= 4 && entrar()} />
            {erro && <p className="text-sm text-red-700">{erro}</p>}
            <div className="flex gap-2">
              {onCancelar && <button className="flex-1 rounded-xl border border-black/20 px-4 py-3 font-medium" onClick={onCancelar}>Cancelar</button>}
              <button className="flex-1 rounded-xl bg-[#7a1f2b] px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={carga || pin.length < 4 || (modo === 'reservar' && !nome.trim())} onClick={entrar}>{carga ? 'Verificando…' : 'Confirmar'}</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold">Em qual mesa fica este tablet?</h2>
            <p className="text-sm opacity-70">Mesa atual: {mesaAtual ?? '—'}. Toque na nova mesa.</p>
            <div className="grid grid-cols-4 gap-2">
              {mesas.map((m) => (
                <button key={m.qr_token} className={`rounded-xl border py-3 text-lg font-semibold ${m.numero === mesaAtual ? 'border-[#7a1f2b] bg-[#7a1f2b] text-white' : 'border-black/20'}`} onClick={() => onTrocar(m.qr_token)}>{m.numero}</button>
              ))}
            </div>
            {onCancelar && <button className="w-full rounded-xl border border-black/20 px-4 py-3 font-medium" onClick={onCancelar}>Fechar</button>}
          </>
        )}
      </div>
    </div>
  )
}

/** Endereço único do tablet (/mesa): abre a mesa já escolhida neste aparelho; na primeira vez pede o PIN e a mesa. */
export function MesaEscolher() {
  const nav = useNavigate()
  const salva = lerMesaSalva()
  useEffect(() => { if (salva) nav(`/mesa/${salva}`, { replace: true }) }, [salva, nav])
  if (salva) return null
  return (
    <div className="grid h-[100dvh] place-items-center bg-[#f4efe9] text-[#222]">
      <AutorizarTablet modo="trocar" onSair={() => {}} onTrocar={(tk) => { salvarMesa(tk); nav(`/mesa/${tk}`, { replace: true }) }} />
    </div>
  )
}
