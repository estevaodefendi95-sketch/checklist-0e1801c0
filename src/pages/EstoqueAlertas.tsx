import { useCallback, useMemo, useState } from 'react'
import { db } from '../lib/supabase'
import { Cabecalho } from '../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnSecCls, cartaoCls, chipCls, inputCls } from '../components/Estado'
import { lerNumero, numero } from '../lib/formato'
import { useAoVivo } from '../lib/pdv'
import { usePermissoes } from '../context/PermissoesContext'
import { Modal } from './pdv/PdvCaixa'

interface Linha {
  item_id: string; item: string; area: string; modelo: string; unidade: string | null; minimo: number | null; saldo: number
  ultima_data: string; contado: number; entradas: number; consumo: number; insumo_id: string | null; vinculado: boolean; abaixo: boolean
}
interface Insumo { id: string; nome: string; unidade: string }
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export function EstoqueAlertas() {
  const { pode } = usePermissoes()
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [filtro, setFiltro] = useState<'abaixo' | 'todos' | 'sem_min' | 'sem_vinculo'>('abaixo')
  const [area, setArea] = useState('')
  const [busca, setBusca] = useState('')
  const [ed, setEd] = useState<Linha | null>(null)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')

  const carregar = useCallback(async () => {
    const [a, i] = await Promise.all([db.rpc('estoque_alertas'), db.from('insumos').select('id,nome,unidade').eq('ativo', true).order('nome')])
    if (a.error) setErro(a.error.message)
    setLinhas((a.data ?? []) as Linha[]); setInsumos((i.data ?? []) as Insumo[])
  }, [])
  useAoVivo(['pdv_pedido_itens', 'pdv_comandas'], carregar)

  const areas = useMemo(() => [...new Set((linhas ?? []).map((l) => l.area))].sort(), [linhas])
  const lista = useMemo(() => (linhas ?? []).filter((l) => {
    if (area && l.area !== area) return false
    if (busca && !semAcento(l.item).includes(semAcento(busca))) return false
    if (filtro === 'abaixo') return l.abaixo
    if (filtro === 'sem_min') return l.minimo == null
    if (filtro === 'sem_vinculo') return !l.vinculado
    return true
  }).sort((a, b) => Number(b.abaixo) - Number(a.abaixo) || a.item.localeCompare(b.item)), [linhas, area, busca, filtro])

  async function vincularAuto() {
    setErro(''); setMsg('')
    const porNome = new Map(insumos.map((i) => [semAcento(i.nome), i.id]))
    const alvo = (linhas ?? []).filter((l) => !l.vinculado).map((l) => ({ l, id: porNome.get(semAcento(l.item)) })).filter((x) => x.id)
    if (!alvo.length) return setMsg('Nenhum item com nome idêntico a um insumo. Vincule manualmente (botão Ajustar).')
    if (!window.confirm(`Vincular ${alvo.length} item(ns) a insumos de mesmo nome?`)) return
    for (const x of alvo) await db.from('checklist_items').update({ insumo_id: x.id, fator_contagem: 1 }).eq('id', x.l.item_id)
    setMsg(`${alvo.length} item(ns) vinculados. Confira o fator de contagem (1 unidade contada = quanto do insumo).`)
    carregar()
  }

  if (!linhas) return erro ? <Erro texto={erro} /> : <Carregando />
  const nAbaixo = linhas.filter((l) => l.abaixo).length
  return (
    <div>
      <Cabecalho titulo="Alertas de estoque" subtitulo="Saldo estimado = última contagem + entradas − vendas do PDV, comparado ao estoque mínimo"
        acoes={pode('pdv_gerir') ? <button className={btnSecCls} onClick={vincularAuto}>Vincular por nome</button> : undefined} />
      {erro && <Erro texto={erro} />}
      {msg && <p className="mb-3 rounded-xl bg-brand-soft px-4 py-2 text-sm text-brand">{msg}</p>}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi t="Abaixo do mínimo" v={String(nAbaixo)} alerta={nAbaixo > 0} />
        <Kpi t="Itens contados" v={String(linhas.length)} />
        <Kpi t="Sem mínimo definido" v={String(linhas.filter((l) => l.minimo == null).length)} />
        <Kpi t="Com baixa automática" v={String(linhas.filter((l) => l.vinculado).length)} />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {([['abaixo', 'Abaixo do mínimo'], ['todos', 'Todos'], ['sem_min', 'Sem mínimo'], ['sem_vinculo', 'Sem baixa automática']] as const).map(([v, r]) => <button key={v} className={chipCls(filtro === v)} onClick={() => setFiltro(v)}>{r}</button>)}
        <select className={inputCls + ' !w-auto'} value={area} onChange={(e) => setArea(e.target.value)}><option value="">Todas as áreas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>
        <input className={inputCls + ' !w-56'} placeholder="Buscar item" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {!lista.length ? <Vazio texto={filtro === 'abaixo' ? (linhas.length ? 'Nenhum item abaixo do mínimo. 🎉' : 'Ainda não há contagens de estoque nos checklists.') : 'Nada neste filtro.'} /> : (
        <div className="space-y-2">
          {lista.map((l) => (
            <div key={l.item_id} className={`${cartaoCls} flex flex-wrap items-center justify-between gap-3 p-3 ${l.abaixo ? 'ring-1 ring-alert/50' : ''}`}>
              <div className="min-w-[180px]">
                <b>{l.item}</b>
                <div className="text-xs text-ink-soft">{l.area} · contado {numero(l.contado)} em {dm(l.ultima_data)}{l.entradas ? ` · +${numero(l.entradas)} entradas` : ''}{l.vinculado ? ` · −${numero(l.consumo)} vendas` : ' · sem baixa automática'}</div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className={l.abaixo ? 'font-semibold text-alert' : ''}>saldo {numero(l.saldo)} {l.unidade ?? ''}</span>
                <span className="text-ink-soft">mín. {l.minimo != null ? numero(l.minimo) : '—'}</span>
                {pode('pdv_gerir') && <button className={btnSecCls + ' !min-h-[36px]'} onClick={() => setEd(l)}>Ajustar</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {ed && <Ajustar l={ed} insumos={insumos} fechar={() => setEd(null)} salvo={() => { setEd(null); carregar() }} />}
    </div>
  )
}

function Ajustar({ l, insumos, fechar, salvo }: { l: Linha; insumos: Insumo[]; fechar: () => void; salvo: () => void }) {
  const [min, setMin] = useState(l.minimo != null ? String(l.minimo).replace('.', ',') : '')
  const [ins, setIns] = useState(insumos.find((i) => i.id === l.insumo_id)?.nome ?? '')
  const [fator, setFator] = useState('1')
  const [erro, setErro] = useState('')
  const alvo = insumos.find((i) => i.nome === ins)
  async function salvar() {
    const dados: Record<string, unknown> = { estoque_minimo: min.trim() === '' ? null : lerNumero(min) }
    if (ins.trim() === '') { dados.insumo_id = null } else {
      if (!alvo) return setErro('Escolha um insumo da lista.')
      dados.insumo_id = alvo.id; dados.fator_contagem = lerNumero(fator) || 1
    }
    const { error } = await db.from('checklist_items').update(dados).eq('id', l.item_id)
    if (error) return setErro(error.message)
    salvo()
  }
  return (
    <Modal titulo={l.item} fechar={fechar}>
      <label className="block text-sm">Estoque mínimo ({l.unidade ?? 'un'})<input className={inputCls} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></label>
      <label className="block text-sm">Insumo para baixa automática pelas vendas
        <input className={inputCls} list="lista-insumos" value={ins} onChange={(e) => setIns(e.target.value)} placeholder="Digite para buscar…" />
        <datalist id="lista-insumos">{insumos.map((i) => <option key={i.id} value={i.nome}>{i.unidade}</option>)}</datalist>
      </label>
      {alvo && <label className="block text-sm">1 {l.unidade ?? 'unidade'} contada = quantos {alvo.unidade} do insumo?<input className={inputCls} inputMode="decimal" value={fator} onChange={(e) => setFator(e.target.value)} /></label>}
      <p className="text-xs text-ink-soft">Sem insumo vinculado o saldo só considera contagens e entradas dos checklists. Com o vínculo, cada venda do PDV baixa o estoque pela ficha técnica.</p>
      {erro && <p className="rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">{erro}</p>}
      <button className={btnCls} onClick={salvar}>Salvar</button>
    </Modal>
  )
}

const Kpi = ({ t, v, alerta }: { t: string; v: string; alerta?: boolean }) => (
  <div className={`${cartaoCls} p-4`}><div className="text-xs uppercase tracking-wide text-ink-soft">{t}</div><div className={`mt-1 text-xl font-semibold ${alerta ? 'text-alert' : ''}`}>{v}</div></div>
)
