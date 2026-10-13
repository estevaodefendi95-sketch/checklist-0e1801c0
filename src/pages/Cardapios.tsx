import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { reais, lerNumero } from '../lib/formato'
import { Carregando, Vazio, Erro, inputCls, btnCls, btnSecCls } from '../components/Estado'

interface Cardapio { id: string; nome: string; descricao: string | null; dias_semana: number[] | null; ordem: number; ativo: boolean }
interface Vinculo { ficha_id: string; cardapio_id: string; preco_venda: number | null }
interface Ficha { id: string; nome: string; preco_venda: number | null; ativo: boolean }

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const btnPerigoCls = 'min-h-[44px] rounded border border-alert px-3 text-sm text-alert hover:bg-alert-soft'

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
  const [configurando, setConfigurando] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')

  async function load() {
    setCarregando(true)
    const [c, v, f] = await Promise.all([
      db.from('cardapios').select('*').order('ordem'),
      db.from('ficha_cardapios').select('ficha_id,cardapio_id,preco_venda'),
      // todas as fichas que não são preparação, inclusive inativas, para nomear os vínculos antigos
      db.from('fichas').select('id,nome,preco_venda,ativo').neq('tipo', 'preparacao').order('nome'),
    ])
    setCarregando(false)
    if (c.error) return setErro(c.error.message)
    setErro(null)
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
    const n = vinculos.filter((v) => v.cardapio_id === c.id).length
    if (!confirm(`Excluir o cardápio ${c.nome}?${n ? ` Os ${n} pratos saem dele, mas as fichas continuam existindo.` : ''}`)) return
    const { error } = await db.from('cardapios').delete().eq('id', c.id)
    if (error) return alert('Não foi possível excluir: ' + error.message)
    load()
  }
  async function addPrato(cardapio_id: string, ficha_id: string) {
    if (!ficha_id) return
    const { error } = await db.from('ficha_cardapios').insert({ cardapio_id, ficha_id })
    if (error) return alert('Não foi possível adicionar: ' + error.message)
    setVinculos((p) => [...p, { cardapio_id, ficha_id, preco_venda: null }])
  }
  async function removerPrato(v: Vinculo, nome: string) {
    if (!confirm(`Tirar ${nome} deste cardápio? A ficha técnica continua existindo.`)) return
    const { error } = await db.from('ficha_cardapios').delete().eq('cardapio_id', v.cardapio_id).eq('ficha_id', v.ficha_id)
    if (error) return alert('Não foi possível remover: ' + error.message)
    setVinculos((p) => p.filter((x) => !(x.cardapio_id === v.cardapio_id && x.ficha_id === v.ficha_id)))
  }
  async function precoPrato(v: Vinculo, s: string) {
    const preco_venda = lerNumero(s)
    if (preco_venda === v.preco_venda) return
    const { error } = await db.from('ficha_cardapios').update({ preco_venda }).eq('cardapio_id', v.cardapio_id).eq('ficha_id', v.ficha_id)
    if (error) return alert('Não foi possível salvar: ' + error.message)
    setVinculos((p) => p.map((x) => (x.cardapio_id === v.cardapio_id && x.ficha_id === v.ficha_id ? { ...x, preco_venda } : x)))
  }

  return (
    <div>
      <h1 className="display mb-4 text-xl font-medium">cardápios</h1>
      {erro && <Erro texto={erro} />}
      {carregando ? <Carregando /> : cardapios.length === 0 ? <Vazio texto="Nenhum cardápio cadastrado." /> : (
        <div className="space-y-2">
          {cardapios.map((c) => {
            const pratos = vinculos
              .filter((v) => v.cardapio_id === c.id)
              .map((v) => ({ v, f: fichas.find((x) => x.id === v.ficha_id) }))
              .sort((a, b) => (a.f?.nome ?? '').localeCompare(b.f?.nome ?? '', 'pt-BR'))
            const dias = c.dias_semana ?? []
            const estaAberto = aberto === c.id
            return (
              <section key={c.id} className="rounded border border-line">
                {/* cabeçalho: nome, dias e status numa linha só */}
                <div className="flex items-stretch">
                  <button
                    onClick={() => setAberto(estaAberto ? null : c.id)}
                    aria-expanded={estaAberto}
                    className="flex min-h-[44px] flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm"
                  >
                    <span className="w-3 text-ink-soft">{estaAberto ? '▾' : '▸'}</span>
                    <span className={`font-medium ${c.ativo ? '' : 'text-ink-soft line-through'}`}>{c.nome}</span>
                    <span className="text-xs text-ink-soft">
                      {dias.length ? dias.map((d) => DIAS[d]).join(' · ') : 'todos os dias'}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${c.ativo ? 'bg-ok-soft text-ok' : 'bg-paper-dim text-ink-soft'}`}>
                      {c.ativo ? 'ativo' : 'inativo'}
                    </span>
                    <span className="ml-auto text-xs text-ink-soft">{pratos.length} {pratos.length === 1 ? 'prato' : 'pratos'}</span>
                  </button>
                  {edita && (
                    <button
                      onClick={() => setConfigurando(configurando === c.id ? null : c.id)}
                      aria-label={`configurar ${c.nome}`}
                      className={`min-h-[44px] min-w-[44px] border-l border-line px-3 text-xs ${configurando === c.id ? 'bg-paper-dim text-ink' : 'text-ink-soft'}`}
                    >
                      ajustar
                    </button>
                  )}
                </div>

                {edita && configurando === c.id && (
                  <div className="space-y-2 border-t border-line bg-paper-dim/40 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block text-xs text-ink-soft">nome
                        <input defaultValue={c.nome} onBlur={(e) => e.target.value.trim() && e.target.value !== c.nome && atualizar(c.id, { nome: e.target.value.trim() })} className={inputCls} />
                      </label>
                      <label className="block text-xs text-ink-soft">descrição
                        <input defaultValue={c.descricao ?? ''} onBlur={(e) => e.target.value !== (c.descricao ?? '') && atualizar(c.id, { descricao: e.target.value || null })} className={inputCls} />
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {DIAS.map((d, i) => (
                        <button key={d} onClick={() => atualizar(c.id, { dias_semana: dias.includes(i) ? dias.filter((x) => x !== i) : [...dias, i].sort() })}
                          aria-pressed={dias.includes(i)}
                          className={`min-h-[44px] min-w-[44px] rounded border text-xs ${dias.includes(i) ? 'border-ok bg-ok-soft text-ok' : 'border-line text-ink-soft'}`}>{d}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs text-ink-soft">ordem
                        <input type="number" defaultValue={c.ordem} onBlur={(e) => Number(e.target.value) !== c.ordem && atualizar(c.id, { ordem: Number(e.target.value) })} className="min-h-[44px] w-20 rounded border border-line bg-paper px-2 text-sm" />
                      </label>
                      <label className="flex min-h-[44px] items-center gap-2 text-sm">
                        <input type="checkbox" checked={c.ativo} onChange={(e) => atualizar(c.id, { ativo: e.target.checked })} className="h-5 w-5" /> ativo
                      </label>
                      <button onClick={() => excluir(c)} className={`${btnPerigoCls} ml-auto`}>excluir cardápio</button>
                    </div>
                  </div>
                )}

                {estaAberto && (
                  <div className="border-t border-line">
                    {c.descricao && <p className="px-3 pt-2 text-xs text-ink-soft">{c.descricao}</p>}
                    {pratos.length === 0 ? (
                      <p className="p-3 text-sm text-ink-soft">Nenhum prato neste cardápio.</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {verCusto && (
                          <li className="hidden px-3 py-1 text-right text-xs text-ink-soft sm:block">preço neste cardápio</li>
                        )}
                        {pratos.map(({ v, f }) => (
                          <PratoLinha
                            key={v.ficha_id}
                            v={v}
                            f={f}
                            edita={edita}
                            verCusto={verCusto}
                            onPreco={(s) => precoPrato(v, s)}
                            onTirar={() => removerPrato(v, f?.nome ?? 'este prato')}
                          />
                        ))}
                      </ul>
                    )}
                    {edita && (
                      <div className="border-t border-line p-3">
                        <select defaultValue="" onChange={(e) => { addPrato(c.id, e.target.value); e.target.value = '' }} className={inputCls} aria-label="adicionar prato">
                          <option value="">+ adicionar prato</option>
                          {fichas.filter((f) => f.ativo && !pratos.some((p) => p.v.ficha_id === f.id)).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
      {edita && (
        <div className="mt-4 flex gap-2">
          <input placeholder="novo cardápio" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} className={inputCls} />
          <button onClick={criar} className={btnCls}>criar</button>
        </div>
      )}
    </div>
  )
}

function PratoLinha({
  v,
  f,
  edita,
  verCusto,
  onPreco,
  onTirar,
}: {
  v: Vinculo
  f: Ficha | undefined
  edita: boolean
  verCusto: boolean
  onPreco: (s: string) => void
  onTirar: () => void
}) {
  const especifico = v.preco_venda != null
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <Link to={`/fichas/${v.ficha_id}`} className="flex min-h-[44px] items-center underline decoration-line underline-offset-4 hover:decoration-ink">
          {f?.nome ?? '(ficha removida)'}
          {f && !f.ativo && <span className="ml-2 text-xs text-ink-soft no-underline">inativa</span>}
        </Link>
      </span>

      {/* preço alinhado à direita: o do cardápio, ou o padrão da ficha */}
      {verCusto && (
        edita ? (
          <label className="flex items-center gap-1 text-xs text-ink-soft">
            <span className="sr-only">preço neste cardápio</span>
            R$
            <input
              inputMode="decimal"
              placeholder={f?.preco_venda != null ? String(f.preco_venda).replace('.', ',') : '—'}
              defaultValue={especifico ? String(v.preco_venda).replace('.', ',') : ''}
              onBlur={(e) => onPreco(e.target.value)}
              title={`Deixe vazio para usar o preço da ficha (${reais(f?.preco_venda)})`}
              className={`min-h-[44px] w-24 rounded border bg-paper px-2 text-right text-sm tabular-nums ${especifico ? 'border-ink text-ink' : 'border-line text-ink-soft'}`}
            />
          </label>
        ) : (
          <span className="w-24 text-right tabular-nums" title={especifico ? 'preço deste cardápio' : 'preço da ficha'}>
            {reais(v.preco_venda ?? f?.preco_venda)}
            {!especifico && <span className="block text-xs text-ink-soft">padrão</span>}
          </span>
        )
      )}

      {edita && (
        <span className="flex gap-1">
          <Link to={`/fichas/${v.ficha_id}/editar`} className={`${btnSecCls} flex items-center px-3`}>
            editar ficha
          </Link>
          <button onClick={onTirar} className={btnPerigoCls} aria-label={`tirar ${f?.nome ?? 'prato'} do cardápio`}>
            tirar
          </button>
        </span>
      )}
    </li>
  )
}
