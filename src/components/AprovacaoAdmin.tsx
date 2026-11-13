import { useEffect, useState } from 'react'
import { supabase } from '../integrations/supabase/client'
import { db } from '../lib/supabase'
import { Modal } from '../pages/pdv/PdvCaixa'
import { Alerta, btnCls, btnSecCls, inputCls } from './Estado'
import { lerOperador } from '../context/OperadorContext'

const SUGESTOES: Record<string, string[]> = {
  cancelar_item: ['Erro de lançamento', 'Cliente desistiu', 'Demora no preparo'],
  cancelar_comanda: ['Lançada por engano', 'Cliente desistiu', 'Comanda duplicada'],
  estornar: ['Valor lançado errado', 'Forma de pagamento errada', 'Pagamento duplicado'],
  a_receber: ['Cliente vai pagar depois', 'Cliente conhecido', 'Acerto combinado'],
  cortesia: ['Cortesia da casa', 'Compensação por problema', 'Aniversariante'],
}
export type AcaoAprovada = 'cancelar_item' | 'cancelar_comanda' | 'estornar' | 'a_receber' | 'cortesia'

/** Pede o motivo (quando precisa) e o PIN de quem pode autorizar (ou e-mail e senha de administrador); o servidor confere e executa. */
export function AprovacaoAdmin({ titulo, descricao, acao, id, pedirMotivo = true, rotuloMotivo = 'Motivo (obrigatório)', dados, onOk, onFechar }: {
  titulo: string; descricao?: string; acao: AcaoAprovada; id: string; pedirMotivo?: boolean; rotuloMotivo?: string
  dados?: Record<string, unknown>; onOk: () => void; onFechar: () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [outro, setOutro] = useState(false)
  const [pin, setPin] = useState('')
  const [porSenha, setPorSenha] = useState(false) // alternativa: e-mail e senha do administrador
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carga, setCarga] = useState(false)
  const [pedido, setPedido] = useState<string | null>(null)

  async function confirmar() {
    setErro(''); setCarga(true)
    const { data, error } = await supabase.functions.invoke('pdv-aprovar', { body: { acao, id, motivo, ...(porSenha ? { email, senha } : { pin }), operador: lerOperador()?.id, dados } })
    setCarga(false); setPin(''); setSenha('')
    if (error) return setErro('Sem conexão. Esta ação precisa de internet.')
    if (data?.erro) return setErro(data.erro)
    onOk()
  }
  async function pedirPush() {
    setErro(''); setCarga(true)
    const { data, error } = await supabase.functions.invoke('pdv-aprovar', { body: { acao: 'solicitar', tipo: acao, id, motivo, dados, operador: lerOperador()?.id } })
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
  const pronto = (porSenha ? !!email && !!senha : pin.length >= 4) && (!pedirMotivo || motivo.trim().length >= 3)
  return (
    <Modal titulo={titulo} fechar={onFechar}>
      {pedido ? (
        <>
          <Alerta tipo="aviso" titulo="Pedido enviado" texto="O administrador recebeu uma notificação e precisa aprovar no celular dele. Aguardando…" />
          <button className={btnSecCls + ' w-full'} onClick={onFechar}>Fechar (o pedido continua valendo por 30 min)</button>
        </>
      ) : (
      <>
      {descricao && <p className="text-sm text-ink-soft">{descricao}</p>}
      {pedirMotivo && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Motivo</p>
          <div className="flex flex-wrap gap-2">
            {(SUGESTOES[acao] ?? []).map((m) => (
              <button key={m} type="button" onClick={() => { setOutro(false); setMotivo(m) }}
                className={`min-h-[44px] rounded-full border px-4 text-sm transition-colors ${!outro && motivo === m ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-line bg-surface text-ink-soft hover:text-ink'}`}>{m}</button>
            ))}
            <button type="button" onClick={() => { setOutro(true); setMotivo('') }}
              className={`min-h-[44px] rounded-full border px-4 text-sm transition-colors ${outro ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-dashed border-line bg-surface text-ink-soft hover:text-ink'}`}>Outro motivo…</button>
          </div>
          {outro && <textarea className={inputCls + ' !min-h-[80px] py-2'} maxLength={200} placeholder="Descreva o motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />}
        </div>
      )}
      {porSenha ? (
        <>
          <p className="text-sm text-ink-soft">E-mail e senha de um administrador.</p>
          <input className={inputCls} type="email" autoComplete="username" placeholder="E-mail do administrador" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={inputCls} type="password" autoComplete="current-password" placeholder="Senha do administrador" value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pronto && confirmar()} />
        </>
      ) : (
        <>
          <p className="text-sm text-ink-soft">Digite o PIN de quem pode autorizar. Seu PIN comum não autoriza.</p>
          <input className={inputCls} type="password" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="PIN do supervisor" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus={!pedirMotivo}
            onKeyDown={(e) => e.key === 'Enter' && pronto && confirmar()} />
        </>
      )}
      {erro && <p className="text-sm text-alert">{erro}</p>}
      <div className="flex gap-2">
        <button className={btnSecCls + ' flex-1'} onClick={onFechar}>Voltar</button>
        <button className={btnCls + ' flex-1'} disabled={carga || !pronto} onClick={confirmar}>{carga ? 'Verificando…' : 'Autorizar'}</button>
      </div>
      <button className={btnSecCls + ' w-full'} disabled={carga || (pedirMotivo && motivo.trim().length < 3)} onClick={pedirPush}>
        Supervisor não está aqui? Pedir aprovação por notificação
      </button>
      <button className="w-full text-center text-xs text-ink-soft underline" onClick={() => { setPorSenha(!porSenha); setErro('') }}>{porSenha ? 'Usar PIN do supervisor' : 'Ainda sem PIN? Usar e-mail e senha do administrador'}</button>
      </>
      )}
    </Modal>
  )
}
