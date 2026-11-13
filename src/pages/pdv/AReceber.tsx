import { useCallback, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { FORMAS, num, rotuloForma, useAoVivo } from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'
import { Modal } from './PdvCaixa'

interface Conta {
  id: string; comanda_id: string; cliente_nome: string; telefone: string; valor: number; vencimento: string | null
  observacao: string | null; status: 'aberto' | 'pago' | 'cancelado'; criado_em: string; pago_em: string | null; pago_forma: string | null
  comanda: { numero: number } | null
}
const FORMAS_BAIXA = FORMAS.filter((f) => ['dinheiro', 'credito', 'debito', 'pix', 'outros'].includes(f.v))
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

/** Comandas liberadas para cobrança depois: cobrar por WhatsApp e dar baixa quando o cliente pagar. */
export function AReceber() {
  const { pode } = usePermissoes()
  const [lista, setLista] = useState<Conta[]>([])
  const [aba, setAba] = useState<'aberto' | 'pago'>('aberto')
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [baixa, setBaixa] = useState<Conta | null>(null)
  const [forma, setForma] = useState('pix')
  const [nsu, setNsu] = useState('')
  const [maq, setMaq] = useState('Sipag')
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    const { data, error } = await db.from('pdv_a_receber').select('*, comanda:pdv_comandas(numero)').neq('status', 'cancelado').order('criado_em', { ascending: false }).limit(500)
    if (error) setErro(error.message)
    else { setErro(''); setLista(((data ?? []) as Conta[]).map((x) => ({ ...x, valor: num(x.valor) }))) }
    setPronto(true)
  }, [])
  useAoVivo(['pdv_a_receber'], carregar, 15000)

  const hoje = new Date().toLocaleDateString('sv-SE')
  const abertas = useMemo(() => lista.filter((x) => x.status === 'aberto'), [lista])
  const totalAberto = abertas.reduce((s, x) => s + x.valor, 0)
  const atrasadas = abertas.filter((x) => x.vencimento && x.vencimento < hoje)
  const q = busca.trim().toLowerCase()
  const mostrar = lista.filter((x) => x.status === aba && (!q || x.cliente_nome.toLowerCase().includes(q) || x.telefone.includes(q.replace(/\D/g, '') || '§')))

  function cobrar(x: Conta) {
    const tel = x.telefone.replace(/\D/g, '')
    const fone = tel.length <= 11 ? '55' + tel : tel
    const texto = `Olá, ${x.cliente_nome.split(' ')[0]}! Aqui é do Paggio Gastrobar. Ficou pendente a conta do dia ${dia(x.criado_em)}, no valor de ${reais(x.valor)}. Podemos combinar o pagamento? Obrigado!`
    window.open(`https://wa.me/${fone}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }
  async function darBaixa() {
    if (!baixa) return
    setErro('')
    const { error } = await db.rpc('pdv_baixar_a_receber', { p_id: baixa.id, p_forma: forma, p_nsu: nsu || null, p_maq: forma === 'credito' || forma === 'debito' ? maq : null })
    if (error) return setErro(error.message)
    setMsg(`Recebido ${reais(baixa.valor)} de ${baixa.cliente_nome} (${rotuloForma(forma)}). Entrou no seu caixa de hoje.`)
    setBaixa(null); setNsu('')
    carregar()
  }

  if (!pronto) return <Carregando />
  if (!pode('pdv_caixa') && !pode('pdv_gerir')) return <Vazio texto="Sem acesso a esta tela." />
  return (
    <div>
      <Cabecalho titulo="A receber" subtitulo="Contas liberadas para cobrança depois" />
      {erro && <Erro texto={erro} />}
      {msg && <p className="mb-3 rounded-xl bg-brand-soft px-4 py-2 text-sm text-brand" onClick={() => setMsg('')}>{msg}</p>}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className={`${cartaoCls} p-4`}><p className="text-xs text-ink-soft">Em aberto</p><p className="text-xl font-semibold">{reais(totalAberto)}</p><p className="text-xs text-ink-soft">{abertas.length} conta(s)</p></div>
        <div className={`${cartaoCls} p-4`}><p className="text-xs text-ink-soft">Combinado já vencido</p><p className={`text-xl font-semibold ${atrasadas.length ? 'text-alert' : ''}`}>{reais(atrasadas.reduce((s, x) => s + x.valor, 0))}</p><p className="text-xs text-ink-soft">{atrasadas.length} conta(s)</p></div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className={aba === 'aberto' ? btnCls : btnSecCls} onClick={() => setAba('aberto')}>Em aberto</button>
        <button className={aba === 'pago' ? btnCls : btnSecCls} onClick={() => setAba('pago')}>Já recebidas</button>
        <input className={inputCls + ' !w-auto min-w-[180px] flex-1'} type="search" placeholder="Buscar cliente ou telefone…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {!mostrar.length ? <Vazio texto={aba === 'aberto' ? 'Nenhuma conta em aberto.' : 'Nada recebido ainda.'} /> : (
        <ul className="space-y-2">
          {mostrar.map((x) => {
            const venc = x.status === 'aberto' && x.vencimento && x.vencimento < hoje
            return (
              <li key={x.id} className={`${cartaoCls} space-y-2 p-4`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <b>{x.cliente_nome}</b>
                    <p className="text-sm text-ink-soft">{x.telefone} · comanda #{x.comanda?.numero ?? '—'} · {dia(x.criado_em)}</p>
                    {x.vencimento && x.status === 'aberto' && <p className={`text-xs ${venc ? 'text-alert' : 'text-ink-soft'}`}>Combinou pagar até {new Date(x.vencimento + 'T12:00').toLocaleDateString('pt-BR')}{venc ? ' · vencido' : ''}</p>}
                    {x.observacao && <p className="text-xs text-ink-soft">{x.observacao}</p>}
                    {x.status === 'pago' && x.pago_em && <p className="text-xs text-brand">Pago em {dia(x.pago_em)} · {rotuloForma(x.pago_forma ?? '')}</p>}
                  </div>
                  <b className="whitespace-nowrap text-lg">{reais(x.valor)}</b>
                </div>
                {x.status === 'aberto' && (
                  <div className="flex flex-wrap gap-2">
                    <button className={btnSecCls} onClick={() => cobrar(x)}>Cobrar no WhatsApp</button>
                    <button className={btnCls} onClick={() => { setErro(''); setBaixa(x) }}>Cliente pagou · dar baixa</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {baixa && (
        <Modal titulo={`Baixa · ${baixa.cliente_nome}`} fechar={() => setBaixa(null)}>
          <p className="text-sm text-ink-soft">Valor: <b>{reais(baixa.valor)}</b>. O recebimento entra no seu caixa de hoje (abra o caixa antes).</p>
          <div className="flex flex-wrap gap-2">
            {FORMAS_BAIXA.map((f) => <button key={f.v} className={forma === f.v ? btnCls : btnSecCls} onClick={() => setForma(f.v)}>{f.r}</button>)}
          </div>
          {(forma === 'credito' || forma === 'debito') && (
            <>
              <div className="flex gap-2">{['Sipag', 'Rede', 'Outra'].map((m) => <button key={m} type="button" className={maq === m ? btnCls : btnSecCls} onClick={() => setMaq(m)}>{m}</button>)}</div>
              <input className={inputCls} placeholder="NSU / comprovante" value={nsu} onChange={(e) => setNsu(e.target.value)} />
            </>
          )}
          {erro && <p className="text-sm text-alert">{erro}</p>}
          <div className="flex gap-2">
            <button className={btnSecCls + ' flex-1'} onClick={() => setBaixa(null)}>Voltar</button>
            <button className={btnCls + ' flex-1'} onClick={darBaixa}>Confirmar recebimento</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
