import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, db } from '../lib/supabase'
import { usePermissoes } from './PermissoesContext'
import { btnCls, btnSecCls } from '../components/Estado'

/** Quem está operando o Salão agora, identificado pelo PIN. O login do aparelho continua sendo o do sistema. */
export interface Operador { id: string; nome: string; autoriza: boolean }

const KEY = 'paggio-operador'
export function lerOperador(): Operador | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') } catch { return null }
}
/** Id de quem deve constar na operação: o operador do PIN; sem PIN, o usuário logado. */
export async function idOperador(): Promise<string | undefined> {
  return lerOperador()?.id ?? (await supabase.auth.getUser()).data.user?.id
}

const Ctx = createContext<{ operador: Operador | null; entrar: (o: Operador) => void; sair: () => void }>({ operador: null, entrar: () => {}, sair: () => {} })
export const useOperador = () => useContext(Ctx)

export function OperadorProvider({ children }: { children: ReactNode }) {
  const [operador, setOp] = useState<Operador | null>(lerOperador)
  const entrar = useCallback((o: Operador) => { try { sessionStorage.setItem(KEY, JSON.stringify(o)) } catch { /* sem armazenamento */ } setOp(o) }, [])
  const sair = useCallback(() => { try { sessionStorage.removeItem(KEY) } catch { /* sem armazenamento */ } setOp(null) }, [])
  return <Ctx.Provider value={{ operador, entrar, sair }}>{children}</Ctx.Provider>
}

/** Teclado numérico grande (toque). Devolve o PIN digitado ao confirmar. */
export function PinPad({ titulo, texto, erro, carga, onOk, onCancelar, extra }: {
  titulo: string; texto?: string; erro?: string; carga?: boolean; onOk: (pin: string) => void; onCancelar?: () => void; extra?: ReactNode
}) {
  const [pin, setPin] = useState('')
  useEffect(() => { if (erro) setPin('') }, [erro])
  const tecla = (d: string) => setPin((p) => (p.length < 6 ? p + d : p))
  const confirmar = () => { if (pin.length >= 4 && !carga) onOk(pin) }
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p))
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Enter') confirmar()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xs space-y-3 rounded-[14px] bg-surface p-5 shadow-card">
        <h3 className="text-center text-lg font-semibold">{titulo}</h3>
        {texto && <p className="text-center text-sm text-ink-soft">{texto}</p>}
        <div className="flex h-12 items-center justify-center gap-2 rounded-[10px] border border-line bg-paper" aria-label="PIN digitado">
          {pin ? [...pin].map((_, i) => <span key={i} className="h-3 w-3 rounded-full bg-ink" />) : <span className="text-sm text-ink-soft">Digite seu PIN</span>}
        </div>
        {erro && <p className="text-center text-sm text-alert" role="alert">{erro}</p>}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" className="min-h-[56px] rounded-[10px] border border-line bg-paper text-xl font-semibold active:bg-paper-dim" onClick={() => tecla(d)}>{d}</button>
          ))}
          <button type="button" className="min-h-[56px] rounded-[10px] border border-line bg-paper text-sm text-ink-soft active:bg-paper-dim" onClick={() => setPin('')}>Limpar</button>
          <button type="button" className="min-h-[56px] rounded-[10px] border border-line bg-paper text-xl font-semibold active:bg-paper-dim" onClick={() => tecla('0')}>0</button>
          <button type="button" className="min-h-[56px] rounded-[10px] border border-line bg-paper text-lg active:bg-paper-dim" aria-label="Apagar" onClick={() => setPin((p) => p.slice(0, -1))}>⌫</button>
        </div>
        <button className={btnCls + ' w-full'} disabled={pin.length < 4 || carga} onClick={confirmar}>{carga ? 'Conferindo…' : 'Confirmar'}</button>
        {onCancelar && <button className={btnSecCls + ' w-full'} onClick={onCancelar}>Cancelar</button>}
        {extra}
      </div>
    </div>
  )
}

/** Pede o PIN antes de mostrar o Salão e telas de operação. Mostra quem está operando, com "Trocar". */
export function ExigeOperador({ children }: { children: ReactNode }) {
  const { operador, entrar, sair } = useOperador()
  const { pode, carregado } = usePermissoes()
  const [temPins, setTemPins] = useState<boolean | null>(null)
  const [erro, setErro] = useState('')
  const [carga, setCarga] = useState(false)
  useEffect(() => { db.rpc('pdv_tem_pins').then((r: { data: boolean | null }) => setTemPins(r.data === true)) }, [])

  async function conferir(pin: string) {
    setCarga(true); setErro('')
    const r = await db.rpc('pdv_validar_pin', { p_pin: pin })
    setCarga(false)
    if (r.error) return setErro(r.error.message.includes('Muitas tentativas') ? 'Muitas tentativas. Aguarde 10 minutos.' : 'Não foi possível conferir. Verifique a internet.')
    const u = (r.data ?? [])[0] as { user_id: string; nome: string; pode_autorizar: boolean } | undefined
    if (!u) return setErro('PIN incorreto.')
    entrar({ id: u.user_id, nome: u.nome, autoriza: u.pode_autorizar })
  }

  if (!carregado || temPins === null) return null
  // enquanto o administrador não cadastrou nenhum PIN, não trava a operação
  if (temPins && !operador) {
    return (
      <PinPad titulo="Quem está operando?" texto="Digite o seu PIN para continuar." erro={erro} carga={carga} onOk={conferir}
        extra={pode('pdv_gerir') ? (
          <button className="w-full text-center text-xs text-ink-soft underline" onClick={async () => {
            const { data } = await supabase.auth.getUser(); const id = data.user?.id
            if (!id) return
            const { data: p } = await db.from('profiles').select('nome').eq('id', id).maybeSingle()
            entrar({ id, nome: p?.nome ?? 'Administrador', autoriza: true })
          }}>Entrar como administrador (sem PIN)</button>
        ) : undefined} />
    )
  }
  return (
    <>
      {temPins && operador && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-[10px] bg-paper-dim px-3 py-2 text-sm">
          <span>Operador: <strong>{operador.nome}</strong></span>
          <button className="rounded-lg px-2 py-1 font-medium text-brand hover:bg-brand-soft" onClick={sair}>Trocar</button>
        </div>
      )}
      {children}
    </>
  )
}
