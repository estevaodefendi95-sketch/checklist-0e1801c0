import { useEffect, useRef, useState } from 'react'
import { supabase } from '../integrations/supabase/client'

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
const EMAIL_KEY = 'paggio_tablet_email'
function lerEmail() { try { return localStorage.getItem(EMAIL_KEY) ?? '' } catch { return '' } }

/** Pede e-mail e senha de um usuário do sistema (validados no servidor) antes de trocar de mesa ou sair do cardápio. */
export function AutorizarTablet({ token, modo, mesaAtual, onTrocar, onSair, onCancelar }: {
  token?: string; modo: 'trocar' | 'sair'; mesaAtual?: string
  onTrocar: (tokenNovo: string) => void; onSair: () => void; onCancelar: () => void
}) {
  const [email, setEmail] = useState(lerEmail)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carga, setCarga] = useState(false)
  const [mesas, setMesas] = useState<MesaTk[] | null>(null)

  async function entrar() {
    setErro(''); setCarga(true)
    const { data, error } = await supabase.functions.invoke('pdv-tablet', { body: { token, acao: 'autorizar', email, senha } })
    setCarga(false); setSenha('')
    if (error) return setErro('Sem conexão. Tente de novo.')
    if (data?.erro) return setErro(data.erro)
    try { localStorage.setItem(EMAIL_KEY, email.trim()) } catch { /* sem armazenamento */ }
    if (modo === 'sair') return onSair()
    setMesas((data.mesas ?? []) as MesaTk[])
  }
  const campo = 'w-full rounded-xl border border-black/20 p-3 text-base text-[#222]'
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onCancelar}>
      <div className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-5 text-[#222] shadow-xl" onClick={(e) => e.stopPropagation()}>
        {!mesas ? (
          <>
            <h2 className="text-lg font-semibold">{modo === 'trocar' ? 'Trocar a mesa deste tablet' : 'Sair do cardápio'}</h2>
            <p className="text-sm opacity-70">Acesso da equipe: informe o e-mail e a senha do seu usuário.</p>
            <input className={campo} type="email" autoComplete="username" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={campo} type="password" autoComplete="current-password" placeholder="Senha" value={senha} autoFocus={!!email} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && email && senha && entrar()} />
            {erro && <p className="text-sm text-red-700">{erro}</p>}
            <div className="flex gap-2">
              <button className="flex-1 rounded-xl border border-black/20 px-4 py-3 font-medium" onClick={onCancelar}>Cancelar</button>
              <button className="flex-1 rounded-xl bg-[#7a1f2b] px-4 py-3 font-semibold text-white disabled:opacity-50" disabled={carga || !email || !senha} onClick={entrar}>{carga ? 'Verificando…' : 'Confirmar'}</button>
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
            <button className="w-full rounded-xl border border-black/20 px-4 py-3 font-medium" onClick={onCancelar}>Fechar</button>
          </>
        )}
      </div>
    </div>
  )
}
