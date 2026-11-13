import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../integrations/supabase/client'
import { db } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePermissoes } from '../context/PermissoesContext'
import { useAoVivo } from '../lib/pdv'
import { btnCls, btnPerigoCls } from './Estado'

const VAPID_PUBLICA = 'BIbKA8IyeDVbirHEzrM4ci6HrYjB3Vee8wN5JVjdwTDSlcvPDs_MSzucG29HFxMhDbAhIav2FOEKjvI7vx9uNjM'
const ROTULO: Record<string, string> = { cancelar_item: 'Cancelar item', cancelar_comanda: 'Cancelar comanda', estornar: 'Estornar pagamento' }

function chave(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}
const suportaPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function registrarAparelho(): Promise<boolean> {
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave(VAPID_PUBLICA) }))
  const j = sub.toJSON()
  if (!j.endpoint || !j.keys) return false
  const uid = (await supabase.auth.getSession()).data.session?.user.id
  const { error } = await db.from('pdv_push_subs').upsert({ user_id: uid, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' })
  return !error
}

interface Pedido { id: string; acao: string; detalhe: string | null; motivo: string | null; solicitante_nome: string | null; criado_em: string }

/** Só para administrador: ativa as notificações no aparelho e mostra os pedidos de aprovação pendentes. */
export function AprovacoesAdmin() {
  const { profile } = useAuth()
  const { master } = usePermissoes()
  const eAdmin = profile?.role === 'admin' || master
  const [lista, setLista] = useState<Pedido[]>([])
  const [perm, setPerm] = useState<string>(() => (suportaPush() ? Notification.permission : 'unsupported'))
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!eAdmin) return
    const desde = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { data } = await db.from('pdv_aprov_pedidos').select('id,acao,detalhe,motivo,solicitante_nome,criado_em').eq('status', 'pendente').gte('criado_em', desde).order('criado_em')
    setLista((data ?? []) as Pedido[])
  }, [eAdmin])
  useAoVivo(eAdmin ? ['pdv_aprov_pedidos'] : [], carregar, 8000)

  // já autorizado antes: garante que este aparelho está registrado
  useEffect(() => {
    if (eAdmin && suportaPush() && Notification.permission === 'granted') registrarAparelho().catch(() => {})
  }, [eAdmin])

  async function ativar() {
    setMsg('')
    const r = await Notification.requestPermission()
    setPerm(r)
    if (r !== 'granted') return setMsg('Notificações bloqueadas. Libere nas configurações do navegador/aparelho.')
    setMsg((await registrarAparelho().catch(() => false)) ? 'Notificações ativadas neste aparelho.' : 'Não foi possível ativar. No iPhone, instale o app na tela inicial primeiro.')
  }
  async function decidir(p: Pedido, decisao: 'aprovar' | 'recusar') {
    setOcupado(p.id); setMsg('')
    const { data, error } = await supabase.functions.invoke('pdv-aprovar', { body: { acao: 'decidir', pedido_id: p.id, decisao } })
    setOcupado(null)
    if (error) setMsg('Sem conexão. Tente de novo.')
    else if (data?.erro) setMsg(data.erro)
    carregar()
  }

  if (!eAdmin) return null
  return (
    <>
      {perm === 'default' && suportaPush() && (
        <div className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 rounded-xl border border-line bg-surface p-3 text-sm shadow-lg lg:bottom-4 lg:left-auto lg:right-4 lg:w-80">
          Receber no celular os pedidos de aprovação de cancelamento?
          <button className={btnCls + ' mt-2 w-full'} onClick={ativar}>Ativar notificações</button>
        </div>
      )}
      {msg && <div className="fixed inset-x-3 top-3 z-[70] rounded-xl bg-ink p-3 text-center text-sm text-paper shadow-lg" onClick={() => setMsg('')}>{msg}</div>}
      {lista.length > 0 && (
        <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Aprovação pendente</h2>
            {lista.map((p) => (
              <div key={p.id} className="space-y-2 rounded-xl border border-line p-3">
                <div className="font-semibold">{ROTULO[p.acao] ?? p.acao}</div>
                <div className="text-sm">{p.detalhe}</div>
                {p.motivo && <div className="text-sm text-ink-soft">Motivo: {p.motivo}</div>}
                <div className="text-xs text-ink-soft">Pedido por {p.solicitante_nome ?? 'equipe'} às {new Date(p.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div className="flex gap-2">
                  <button className={btnPerigoCls + ' flex-1'} disabled={ocupado === p.id} onClick={() => decidir(p, 'recusar')}>Recusar</button>
                  <button className={btnCls + ' flex-1'} disabled={ocupado === p.id} onClick={() => decidir(p, 'aprovar')}>{ocupado === p.id ? '…' : 'Aprovar'}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
