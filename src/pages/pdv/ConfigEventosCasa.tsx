import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, btnCls, btnPerigoCls, btnSecCls, inputCls } from '../../components/Estado'
import { lerNumero, reais } from '../../lib/formato'
import { Modal } from './PdvCaixa'
import { Avisos, useSalvarMsg } from './PdvConfig'

export interface EventoCasa { id: string; nome: string; data: string | null; valor: number; cobrar: 'pessoa' | 'comanda'; ativo: boolean; observacao: string | null }
const NOVO: EventoCasa = { id: '', nome: '', data: new Date().toLocaleDateString('sv-SE'), valor: 0, cobrar: 'pessoa', ativo: true, observacao: '' }

/** Eventos que acontecem na casa (escolhidos no check-in). Valor 0 = só controle interno. */
export function ConfigEventosCasa() {
  const [lista, setLista] = useState<EventoCasa[]>([])
  const [ed, setEd] = useState<EventoCasa | null>(null)
  const [valorTxt, setValorTxt] = useState('')
  const [pronto, setPronto] = useState(false)
  const s = useSalvarMsg()

  const carregar = useCallback(async () => {
    const { data } = await db.from('pdv_eventos_casa').select('*').order('data', { ascending: false, nullsFirst: true }).order('nome')
    setLista(((data ?? []) as EventoCasa[]).map((e) => ({ ...e, valor: Number(e.valor) })))
    setPronto(true)
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  function abrirEd(e: EventoCasa) { setEd(e); setValorTxt(e.valor ? String(e.valor).replace('.', ',') : '') }
  async function salvar() {
    if (!ed || !ed.nome.trim()) return s.falha('Informe o nome do evento.')
    const dados = { nome: ed.nome.trim(), data: ed.data || null, valor: lerNumero(valorTxt) || 0, cobrar: ed.cobrar, ativo: ed.ativo, observacao: ed.observacao?.trim() || null }
    const r = ed.id ? await db.from('pdv_eventos_casa').update(dados).eq('id', ed.id) : await db.from('pdv_eventos_casa').insert(dados)
    if (r.error) return s.falha(r.error.message)
    setEd(null); s.ok('Evento salvo.'); void carregar()
  }
  async function excluir(e: EventoCasa) {
    if (!window.confirm(`Excluir o evento "${e.nome}"? As comandas já lançadas mantêm os itens, mas perdem o vínculo com o evento.`)) return
    const r = await db.from('pdv_eventos_casa').delete().eq('id', e.id)
    if (r.error) return s.falha(r.error.message)
    setEd(null); void carregar()
  }

  if (!pronto) return <Carregando />
  return (
    <div className="space-y-3">
      <Avisos s={s} />
      <p className="text-sm text-slate-500">No check-in o atendente escolhe o evento de cada cliente. Com valor, ele entra na comanda automaticamente; com valor zero é só controle interno (aparece no relatório).</p>
      <button className={btnCls} onClick={() => abrirEd(NOVO)}>+ Novo evento</button>
      {!lista.length && <p className="text-sm text-slate-500">Nenhum evento cadastrado.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {lista.map((e) => (
          <button key={e.id} onClick={() => abrirEd(e)} className={`rounded-xl border bg-white p-3 text-left shadow-sm hover:border-slate-400 ${e.ativo ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
            <div className="flex items-center justify-between gap-2">
              <b>{e.nome}</b>
              <span className="text-sm">{e.valor > 0 ? `${reais(e.valor)} ${e.cobrar === 'pessoa' ? '/ pessoa' : '/ comanda'}` : 'só controle'}</span>
            </div>
            <div className="text-xs text-slate-500">{e.data ? new Date(e.data + 'T12:00').toLocaleDateString('pt-BR') : 'Todos os dias'}{e.ativo ? '' : ' · inativo'}</div>
          </button>
        ))}
      </div>
      {ed && (
        <Modal titulo={ed.id ? 'Editar evento' : 'Novo evento'} fechar={() => setEd(null)}>
          <label className="block text-sm">Nome<input className={inputCls} value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} /></label>
          <label className="block text-sm">Data (vazio = vale todos os dias)<input type="date" className={inputCls} value={ed.data ?? ''} onChange={(e) => setEd({ ...ed, data: e.target.value || null })} /></label>
          <label className="block text-sm">Valor (deixe vazio para só controle)<input className={inputCls} inputMode="decimal" placeholder="0,00" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} /></label>
          <label className="block text-sm">Cobrar
            <select className={inputCls} value={ed.cobrar} onChange={(e) => setEd({ ...ed, cobrar: e.target.value as 'pessoa' | 'comanda' })}>
              <option value="pessoa">Por pessoa (valor × nº de pessoas)</option>
              <option value="comanda">Uma vez por comanda</option>
            </select>
          </label>
          <label className="block text-sm">Observação<input className={inputCls} value={ed.observacao ?? ''} onChange={(e) => setEd({ ...ed, observacao: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.ativo} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} /> Ativo (aparece no check-in)</label>
          <div className="flex flex-wrap gap-2">
            <button className={btnCls} onClick={salvar}>Salvar</button>
            <button className={btnSecCls} onClick={() => setEd(null)}>Cancelar</button>
            {ed.id && <button className={btnPerigoCls + ' ml-auto'} onClick={() => excluir(ed)}>Excluir</button>}
          </div>
        </Modal>
      )}
    </div>
  )
}
