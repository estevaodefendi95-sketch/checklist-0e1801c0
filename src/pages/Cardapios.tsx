import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { reais, lerNumero } from '../lib/formato'
import { Carregando, Vazio, Erro, inputCls, btnCls } from '../components/Estado'

interface Cardapio { id: string; nome: string; descricao: string | null; dias_semana: number[] | null; ordem: number; ativo: boolean }
interface Vinculo { ficha_id: string; cardapio_id: string; preco_venda: number | null }
interface Ficha { id: string; nome: string; preco_venda: number | null }

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function Cardapios() {
  const { pode } = usePermissoes()
  const edita = pode('editar_fichas')
  const verCusto = pode('ver_custos')
  const [cardapios, setCardapios] = useState<Cardapio[]>([])
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')

  async function load() {
    setCarregando(true)
    const [c, v, f] = await Promise.all([
      db.from('cardapios').select('*').order('ordem'),
      db.from('ficha_cardapios').select('ficha_id,cardapio_id,preco_venda'),
      db.from('fichas').select('id,nome,preco_venda').neq('tipo', 'preparacao').eq('ativo', true).order('nome'),
    ])
    setCarregando(false)
    if (c.error) return setErro(c.error.message)
    setCardapios(c.data ?? []); setVinculos(v.data ?? []); setFichas(f.data ?? [])
  }
  useEffect(() => { load() }, [])

  async function atualizar(id: string, campos: Partial<Cardapio>) {
    const { error } = await db.from('cardapios').update(campos).eq('id', id)
    if (error) return alert('Não foi possível salvar: ' + error.message)
    setCardapios((p) => p.map((c) => (c.id === id ? { ...c, ...campos } : c)))
  }
  async function criar() {
    if (!novoNome.trim()) return
    const { error } = await db.from('cardapios').insert({ nome: novoNome.trim(), ordem: cardapios.length + 1 })
    if (error) return alert('Não foi possível criar: ' + error.message)
    setNovoNome(''); load()
  }
  async function excluir(c: Cardapio) {
    if (!confirm(`Excluir o cardápio ${c.nome}?`)) return
    const { error } = await db.from('cardapios').delete().eq('id', c.id)
    if (error) return alert('Não foi possível excluir: ' + error.message)
    load()
  }
  async function addPrato(cardapio_id: string, ficha_id: string) {
    if (!ficha_id) return
    const { error } = await db.from('ficha_cardapios').insert({ cardapio_id, ficha_id })
    if (error) return alert('Não foi possível adicionar: ' + error.message)
    load()
  }
  async function removerPrato(v: Vinculo) {
    if (!confirm('Tirar este prato do cardápio?')) return
    const { error } = await db.from('ficha_cardapios').delete().eq('cardapio_id', v.cardapio_id).eq('ficha_id', v.ficha_id)
    if (error) return alert('Não foi possível remover: ' + error.message)
    load()
  }
  async function precoPrato(v: Vinculo, s: string) {
    const preco_venda = lerNumero(s)
    const { error } = await db.from('ficha_cardapios').update({ preco_venda }).eq('cardapio_id', v.cardapio_id).eq('ficha_id', v.ficha_id)
    if (error) alert('Não foi possível salvar: ' + error.message)
  }

  return (
    <div>
      <h1 className="display mb-4 text-xl font-medium">cardápios</h1>
      {erro && <Erro texto={erro} />}
      {carregando ? <Carregando /> : cardapios.length === 0 ? <Vazio texto="Nenhum cardápio." /> : (
        <div className="space-y-2">
          {cardapios.map((c) => {
            const pratos = vinculos.filter((v) => v.cardapio_id === c.id)
            const dias = c.dias_semana ?? []
            return (
              <div key={c.id} className={`rounded border border-line ${c.ativo ? '' : 'opacity-60'}`}>
                <button onClick={() => setAberto(aberto === c.id ? null : c.id)} className="flex min-h-[44px] w-full items-center justify-between px-3 text-left text-sm">
                  <span className="font-medium">{c.nome}</span>
                  <span className="text-xs text-ink-soft">
                    {dias.length ? dias.map((d) => DIAS[d]).join(', ') : 'todos os dias'} · {pratos.length} pratos
                  </span>
                </button>
                {aberto === c.id && (
                  <div className="space-y-3 border-t border-line p-3">
                    {edita && (
                      <>
                        <input defaultValue={c.nome} onBlur={(e) => e.target.value !== c.nome && atualizar(c.id, { nome: e.target.value })} className={inputCls} />
                        <input placeholder="descrição" defaultValue={c.descricao ?? ''} onBlur={(e) => atualizar(c.id, { descricao: e.target.value || null })} className={inputCls} />
                        <div className="flex flex-wrap items-center gap-1">
                          {DIAS.map((d, i) => (
                            <button key={d} onClick={() => atualizar(c.id, { dias_semana: dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i].sort() })}
                              className={`min-h-[44px] min-w-[44px] rounded border text-xs ${dias.includes(i) ? 'border-ok bg-ok-soft text-ok' : 'border-line text-ink-soft'}`}>{d}</button>
                          ))}
                          <label className="ml-2 flex items-center gap-1 text-xs">ordem
                            <input type="number" defaultValue={c.ordem} onBlur={(e) => atualizar(c.id, { ordem: Number(e.target.value) })} className="min-h-[44px] w-16 rounded border border-line bg-paper px-2" />
                          </label>
                          <label className="ml-2 flex min-h-[44px] items-center gap-1 text-xs">
                            <input type="checkbox" checked={c.ativo} onChange={(e) => atualizar(c.id, { ativo: e.target.checked })} /> ativo
                          </label>
                        </div>
                      </>
                    )}
                    <div className="divide-y divide-line rounded border border-line">
                      {pratos.length === 0 && <p className="p-3 text-xs text-ink-soft">Nenhum prato neste cardápio.</p>}
                      {pratos.map((v) => {
                        const f = fichas.find((x) => x.id === v.ficha_id)
                        return (
                          <div key={v.ficha_id} className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 px-3 py-1 text-sm">
                            <span>{f?.nome ?? '(ficha)'}</span>
                            <span className="flex items-center gap-2">
                              {verCusto && edita ? (
                                <input inputMode="decimal" placeholder={`padrão ${reais(f?.preco_venda)}`} defaultValue={v.preco_venda == null ? '' : String(v.preco_venda).replace('.', ',')}
                                  onBlur={(e) => precoPrato(v, e.target.value)} className="min-h-[40px] w-32 rounded border border-line bg-paper px-2 text-xs" />
                              ) : verCusto ? <span className="text-xs">{reais(v.preco_venda ?? f?.preco_venda)}</span> : null}
                              {edita && <button onClick={() => removerPrato(v)} className="text-xs text-alert underline">tirar</button>}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {edita && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <select defaultValue="" onChange={(e) => { addPrato(c.id, e.target.value); e.target.value = '' }} className={inputCls}>
                          <option value="">+ adicionar prato</option>
                          {fichas.filter((f) => !pratos.some((p) => p.ficha_id === f.id)).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                        <button onClick={() => excluir(c)} className="min-h-[44px] rounded border border-alert px-4 text-sm text-alert">excluir cardápio</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {edita && (
        <div className="mt-4 flex gap-2">
          <input placeholder="novo cardápio" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className={inputCls} />
          <button onClick={criar} className={btnCls}>criar</button>
        </div>
      )}
    </div>
  )
}
