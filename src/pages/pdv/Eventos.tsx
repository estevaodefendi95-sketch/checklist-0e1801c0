import { useCallback, useEffect, useState } from 'react'
import { db, supabase } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais, lerNumero } from '../../lib/formato'
import { soDigitos } from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'
import { Modal } from './PdvCaixa'
import { Campo } from './PdvConfig'
import { docValido, mascaraDoc } from './FiscalRapido'

interface Evento {
  id: string; nome: string; data_evento: string | null; tomador_nome: string; tomador_doc: string; tomador_email: string | null
  tomador_cep: string | null; tomador_logradouro: string | null; tomador_numero: string | null; tomador_bairro: string | null; tomador_municipio: string | null; tomador_uf: string | null; tomador_codigo_municipio: string | null
  descricao_servico: string; valor: number; status: string; numero_nota: string | null; nota_url: string | null; mensagem: string | null; referencia: string | null; observacao: string | null
}
const COR: Record<string, string> = { rascunho: 'bg-surface text-ink-soft', processando: 'bg-amber-100 text-amber-800', autorizada: 'bg-emerald-100 text-emerald-800', manual: 'bg-emerald-100 text-emerald-800', rejeitada: 'bg-alert-soft text-alert', erro: 'bg-alert-soft text-alert', cancelada: 'bg-surface text-ink-soft' }

/** Notas de eventos (serviço/NFS-e): cadastro do tomador + emissão pela Focus NFe, ou registro de nota emitida fora. */
export function Eventos() {
  const { pode } = usePermissoes()
  const [lista, setLista] = useState<Evento[]>([])
  const [ed, setEd] = useState<Partial<Evento> | null>(null)
  const [valorTxt, setValorTxt] = useState('')
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const carregar = useCallback(async () => {
    const { data, error } = await db.from('pdv_eventos').select('*').order('criado_em', { ascending: false }).limit(80)
    if (error) setErro(error.message)
    setLista((data ?? []) as Evento[]); setPronto(true)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function chamar(acao: string, id: string) {
    const { data, error } = await supabase.functions.invoke('pdv-fiscal', { body: { acao, evento_id: id } })
    if (error) { let m = error.message; try { const j = await (error as unknown as { context?: Response }).context?.json(); if (j?.error) m = j.error } catch { /* ignora */ } return { erro: m } }
    return { erro: (data as { error?: string })?.error, mensagem: (data as { mensagem?: string })?.mensagem }
  }
  async function salvar(): Promise<string | null> {
    if (!ed) return null
    setErro('')
    const doc = soDigitos(ed.tomador_doc ?? '')
    if (!ed.nome?.trim() || !ed.tomador_nome?.trim() || !ed.descricao_servico?.trim()) { setErro('Preencha evento, tomador e descrição do serviço.'); return null }
    if (!docValido(doc)) { setErro('CPF/CNPJ do tomador inválido.'); return null }
    const valor = lerNumero(valorTxt)
    if (!valor || valor <= 0) { setErro('Informe o valor.'); return null }
    const { id, ...resto } = ed
    const dados = { ...resto, tomador_doc: doc, valor, nome: ed.nome.trim() }
    const r = id ? await db.from('pdv_eventos').update({ ...dados, atualizado_em: new Date().toISOString() }).eq('id', id).select('id').single() : await db.from('pdv_eventos').insert(dados).select('id').single()
    if (r.error) { setErro(r.error.message); return null }
    return r.data.id as string
  }
  async function emitir() {
    setOcupado(true); setMsg('')
    const id = await salvar()
    if (!id) return setOcupado(false)
    const r = await chamar('emitir_evento', id)
    setOcupado(false)
    if (r.erro) setErro(r.erro); else { setMsg(r.mensagem ?? 'Enviada.'); setEd(null) }
    carregar()
  }
  async function manual() {
    const n = window.prompt('Número da nota emitida fora do sistema (prefeitura/contador):')
    if (!n) return
    const id = await salvar()
    if (!id) return
    await db.from('pdv_eventos').update({ status: 'manual', numero_nota: n.trim() }).eq('id', id)
    setEd(null); carregar()
  }
  async function consultar(e: Evento) {
    const r = await chamar('consultar_evento', e.id)
    if (r.erro) setErro(r.erro); else setMsg(r.mensagem ?? '')
    carregar()
  }
  const set = (p: Partial<Evento>) => setEd((x) => ({ ...x, ...p }))

  if (!pode('pdv_fiscal') && !pode('pdv_caixa')) return <Erro texto="Sem permissão." />
  if (!pronto) return <Carregando />
  return (
    <div>
      <Cabecalho titulo="Notas de eventos" subtitulo="Aluguel de espaço, buffet e serviços para eventos (NFS-e)" />
      {erro && <div className="mb-3"><Erro texto={erro} /></div>}
      {msg && <p className="mb-3 rounded-xl bg-brand-soft px-4 py-2 text-sm text-brand">{msg}</p>}
      <p className="mb-3 rounded-xl bg-brand-soft p-3 text-sm">
        Evento é <b>serviço</b>, então a nota é NFS-e (da prefeitura), diferente da NFC-e do salão. Configure inscrição municipal, item da lista de serviço e alíquota de ISS em
        Configurações › Fiscal. A emissão é feita pela Focus NFe — <b>valide em homologação</b> (cada município tem regras próprias). Se o contador emite por fora, use "Registrar nota emitida fora".
      </p>
      <button className={btnCls} onClick={() => { setEd({ tomador_uf: 'SP', descricao_servico: 'Locação de espaço e serviços de alimentação para evento' }); setValorTxt('') }}>Novo evento</button>
      <div className="mt-4">
        {!lista.length ? <Vazio texto="Nenhum evento cadastrado." /> : (
          <ul className={`${cartaoCls} divide-y divide-line`}>
            {lista.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <button className="text-left" onClick={() => { setEd(e); setValorTxt(String(e.valor).replace('.', ',')) }}>
                  <b>{e.nome}</b> · {e.tomador_nome}<span className="block text-xs text-ink-soft">{e.data_evento ? new Date(e.data_evento + 'T12:00').toLocaleDateString('pt-BR') : 'sem data'} · {reais(Number(e.valor))}{e.numero_nota ? ` · NFS-e ${e.numero_nota}` : ''}</span>
                  {e.mensagem && ['erro', 'rejeitada'].includes(e.status) && <span className="block text-xs text-alert">{e.mensagem}</span>}
                </button>
                <span className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR[e.status]}`}>{e.status}</span>
                  {e.status === 'processando' && <button className="text-xs text-brand underline" onClick={() => consultar(e)}>consultar</button>}
                  {e.nota_url && <a className="text-xs text-brand underline" href={e.nota_url} target="_blank" rel="noreferrer">ver nota</a>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {ed && (
        <Modal titulo={ed.id ? 'Evento' : 'Novo evento'} fechar={() => setEd(null)}>
          <Campo r="Evento"><input className={inputCls} value={ed.nome ?? ''} onChange={(e) => set({ nome: e.target.value })} placeholder="Casamento Ana e João" /></Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo r="Data do evento"><input type="date" className={inputCls} value={ed.data_evento ?? ''} onChange={(e) => set({ data_evento: e.target.value || null })} /></Campo>
            <Campo r="Valor (R$)"><input className={inputCls} inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} /></Campo>
          </div>
          <h4 className="pt-1 text-sm font-semibold">Tomador (quem contratou)</h4>
          <Campo r="Nome / razão social"><input className={inputCls} value={ed.tomador_nome ?? ''} onChange={(e) => set({ tomador_nome: e.target.value })} /></Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo r="CPF ou CNPJ"><input className={inputCls} inputMode="numeric" value={mascaraDoc(ed.tomador_doc ?? '')} onChange={(e) => set({ tomador_doc: e.target.value })} /></Campo>
            <Campo r="E-mail (recebe a nota)"><input className={inputCls} value={ed.tomador_email ?? ''} onChange={(e) => set({ tomador_email: e.target.value })} /></Campo>
            <Campo r="CEP"><input className={inputCls} value={ed.tomador_cep ?? ''} onChange={(e) => set({ tomador_cep: e.target.value })} /></Campo>
            <Campo r="Nº"><input className={inputCls} value={ed.tomador_numero ?? ''} onChange={(e) => set({ tomador_numero: e.target.value })} /></Campo>
          </div>
          <Campo r="Logradouro"><input className={inputCls} value={ed.tomador_logradouro ?? ''} onChange={(e) => set({ tomador_logradouro: e.target.value })} /></Campo>
          <div className="grid grid-cols-3 gap-2">
            <Campo r="Bairro"><input className={inputCls} value={ed.tomador_bairro ?? ''} onChange={(e) => set({ tomador_bairro: e.target.value })} /></Campo>
            <Campo r="Município"><input className={inputCls} value={ed.tomador_municipio ?? ''} onChange={(e) => set({ tomador_municipio: e.target.value })} /></Campo>
            <Campo r="UF"><input className={inputCls} value={ed.tomador_uf ?? ''} onChange={(e) => set({ tomador_uf: e.target.value.toUpperCase().slice(0, 2) })} /></Campo>
          </div>
          <Campo r="Código IBGE do município do tomador (7 dígitos)"><input className={inputCls} value={ed.tomador_codigo_municipio ?? ''} onChange={(e) => set({ tomador_codigo_municipio: soDigitos(e.target.value).slice(0, 7) })} /></Campo>
          <Campo r="Discriminação do serviço"><textarea className={inputCls + ' min-h-[88px] py-2'} value={ed.descricao_servico ?? ''} onChange={(e) => set({ descricao_servico: e.target.value })} /></Campo>
          <div className="flex flex-wrap gap-2">
            {(!ed.status || ['rascunho', 'erro', 'rejeitada'].includes(ed.status)) && <button className={btnCls} disabled={ocupado} onClick={emitir}>{ocupado ? 'Enviando…' : 'Emitir NFS-e'}</button>}
            {(!ed.status || ['rascunho', 'erro', 'rejeitada'].includes(ed.status)) && <button className={btnSecCls} onClick={async () => { if (await salvar()) { setEd(null); carregar() } }}>Salvar rascunho</button>}
            {(!ed.status || ['rascunho', 'erro', 'rejeitada'].includes(ed.status)) && <button className={btnSecCls} onClick={manual}>Registrar nota emitida fora</button>}
            {ed.id && ed.status === 'rascunho' && <button className={btnPerigoCls} onClick={async () => { if (window.confirm('Excluir este rascunho?')) { await db.from('pdv_eventos').delete().eq('id', ed.id!); setEd(null); carregar() } }}>Excluir</button>}
          </div>
        </Modal>
      )}
    </div>
  )
}
