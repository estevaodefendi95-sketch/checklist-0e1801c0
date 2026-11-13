import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, Erro, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { Modal } from './PdvCaixa'

interface Linha { user_id: string; nome: string; tem_pin: boolean; pode_autorizar: boolean }

/** O administrador cadastra o PIN de cada pessoa. O PIN identifica quem opera o Salão e quem autoriza cancelamentos e a troca de mesa do tablet. */
export function ConfigPins() {
  const [lista, setLista] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [ed, setEd] = useState<Linha | null>(null)
  const [pin, setPin] = useState('')
  const [autoriza, setAutoriza] = useState(false)

  const carregar = useCallback(async () => {
    const r = await db.rpc('pdv_listar_pins')
    if (r.error) setErro(r.error.message); else { setErro(''); setLista((r.data ?? []) as Linha[]) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  function abrir(l: Linha) { setEd(l); setPin(''); setAutoriza(l.pode_autorizar); setMsg('') }
  async function salvar() {
    if (!ed) return
    setMsg('')
    if (pin) {
      const r = await db.rpc('pdv_definir_pin', { p_user: ed.user_id, p_pin: pin, p_autoriza: autoriza })
      if (r.error) return setMsg(r.error.message)
    } else if (ed.tem_pin) {
      const r = await db.rpc('pdv_pin_autoriza', { p_user: ed.user_id, p_autoriza: autoriza })
      if (r.error) return setMsg(r.error.message)
    } else return setMsg('Digite um PIN de 4 a 6 números.')
    setEd(null); carregar()
  }
  async function remover() {
    if (!ed || !window.confirm(`Remover o PIN de ${ed.nome}? Essa pessoa não conseguirá mais entrar no Salão.`)) return
    const r = await db.rpc('pdv_remover_pin', { p_user: ed.user_id })
    if (r.error) return setMsg(r.error.message)
    setEd(null); carregar()
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-brand-soft p-3 text-sm">
        Cada pessoa usa o <b>PIN</b> (4 a 6 números) ao entrar no <b>Salão</b>: fica registrado quem abriu a comanda, quem lançou cada produto e quem fechou a conta, e dá para filtrar isso no relatório de vendas.
        Quem tem <b>"pode autorizar"</b> usa o PIN também para <b>cancelar produto ou comanda</b> e para <b>trocar a mesa do tablet</b>. O PIN de cada pessoa precisa ser diferente.
        Enquanto ninguém tiver PIN, o Salão abre normal, sem pedir.
      </p>
      {erro && <Erro texto={erro} />}
      {!lista ? <Carregando /> : (
        <ul className={`${cartaoCls} divide-y divide-line`}>
          {lista.map((l) => (
            <li key={l.user_id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{l.nome}</p>
                <p className="text-xs text-ink-soft">{l.tem_pin ? (l.pode_autorizar ? 'PIN cadastrado · pode autorizar' : 'PIN cadastrado') : 'sem PIN'}</p>
              </div>
              <button className={l.tem_pin ? btnSecCls : btnCls} onClick={() => abrir(l)}>{l.tem_pin ? 'Alterar' : 'Criar PIN'}</button>
            </li>
          ))}
        </ul>
      )}
      {ed && (
        <Modal titulo={`PIN de ${ed.nome}`} fechar={() => setEd(null)}>
          <label className="block text-sm">{ed.tem_pin ? 'Novo PIN (deixe vazio para manter o atual)' : 'PIN (4 a 6 números)'}
            <input className={inputCls} inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={autoriza} onChange={(e) => setAutoriza(e.target.checked)} />
            Pode autorizar (cancelar produto/comanda e trocar a mesa do tablet)
          </label>
          {msg && <p className="text-sm text-alert">{msg}</p>}
          <div className="flex gap-2">
            <button className={btnSecCls + ' flex-1'} onClick={() => setEd(null)}>Voltar</button>
            <button className={btnCls + ' flex-1'} onClick={salvar}>Salvar</button>
          </div>
          {ed.tem_pin && <button className={btnPerigoCls + ' w-full'} onClick={remover}>Remover PIN</button>}
        </Modal>
      )}
    </div>
  )
}
