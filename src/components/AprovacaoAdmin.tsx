import { useEffect, useState } from 'react'
import { supabase } from '../integrations/supabase/client'
import { db } from '../lib/supabase'
import { Modal } from '../pages/pdv/PdvCaixa'
import { btnCls, btnSecCls, inputCls } from './Estado'

const EMAIL_KEY = 'paggio_aprovador_email'
const lerEmail = () => { try { return localStorage.getItem(EMAIL_KEY) ?? '' } catch { return '' } }

export type AcaoAprovada = 'cancelar_item' | 'cancelar_comanda' | 'estornar'

/** Pede o motivo (quando precisa) e o e-mail e a senha de um administrador; o servidor confere e executa. */
export function AprovacaoAdmin({ titulo, descricao, acao, id, pedirMotivo = true, onOk, onFechar }: {
  titulo: string; descricao?: string; acao: AcaoAprovada; id: string; pedirMotivo?: boolean
  onOk: () => void; onFechar: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [email, setEmail] = useState(lerEmail)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carga, setCarga] = useState(false)
  const [pedido, setPedido] = useState<string | null>(null)

  async function confirmar() {
    setErro(''); setCarga(true)
    const { data, error } = await supabase.functions.invoke('pdv-aprovar', { body: { acao, id, motivo, email, senha } })
    setCarga(false); setSenha('')
    if (error) return setErro('Sem conexão. Esta ação precisa de internet.')
    if (data?.erro) return setErro(data.erro)
    try { localStorage.setItem(EMAIL_KEY, email.trim()) } catch { /* sem armazenamento */ }
    onOk()
  }
  async function pedirPush() {
    setErro(''); setCarga(true)
    const { data, error } = await supabase.functions.invoke('pdv-aprovar', { body: { acao: 'solicitar', tipo: acao, id, motivo } })
    setCarga(false)
    if (error) return setErro('Sem conexão. Esta ação precisa de internet.')
    if (data?.erro) return setErro(data.erro)
    setPedido(data.pedido_id)
  }
  // aguarda a decisão do administrador (Realtime + consulta a cada 3 s)
  useEffect(() => {
    if (!pedido) return
    let vivo = true
    const checar = async () => {
      const { data } = await db.from('pdv_aprov_pedidos').select('status,erro').eq('id', pedido).maybeSingle()
      if (!vivo || !data) return
      if (data.status === 'aprovado') onOk()
      else if (data.status === 'recusado') { setPedido(null); setErro(data.erro ? `Não foi possível: ${data.erro}` : 'O administrador recusou.') }
    }
    const iv = setInterval(checar, 3000)
    checar()
    return () => { vivo = false; clearInterval(iv) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido])
  const pronto = email && senha && (!pedirMotivo || motivo.trim().length >= 3)
  return (
    <Modal titulo={titulo} fechar={onFechar}>
      {pedido ? (
        <>
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Pedido enviado. O administrador recebeu uma notificação e precisa aprovar no celular dele. Aguardando…</p>
          <button className={btnSecCls + ' w-full'} onClick={onFechar}>Fechar (o pedido continua valendo por 30 min)</button>
        </>
      ) : (
      <>
      {descricao && <p className="text-sm text-ink-soft">{descricao}</p>}
      {pedirMotivo && <input className={inputCls} placeholder="Motivo (obrigatório)" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />}
      <p className="text-sm text-ink-soft">Aprovação do administrador: e-mail e senha.</p>
      <input className={inputCls} type="email" autoComplete="username" placeholder="E-mail do administrador" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className={inputCls} type="password" autoComplete="current-password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && pronto && confirmar()} />
      {erro && <p className="text-sm text-alert">{erro}</p>}
      <div className="flex gap-2">
        <button className={btnSecCls + ' flex-1'} onClick={onFechar}>Voltar</button>
        <button className={btnCls + ' flex-1'} disabled={carga || !pronto} onClick={confirmar}>{carga ? 'Verificando…' : 'Aprovar'}</button>
      </div>
      <button className={btnSecCls + ' w-full'} disabled={carga || (pedirMotivo && motivo.trim().length < 3)} onClick={pedirPush}>
        Administrador não está aqui? Pedir aprovação por notificação
      </button>
      </>
      )}
    </Modal>
  )
}
