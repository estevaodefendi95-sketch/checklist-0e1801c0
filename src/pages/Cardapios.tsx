import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { reais, lerNumero } from '../lib/formato'
import { Carregando, Vazio, Erro, inputCls, btnCls, btnSecCls, btnPerigoCls, cartaoCls, chipCls } from '../components/Estado'
import { Cabecalho } from '../components/Cabecalho'
import { BarraSalvar, useAlteracoesPendentes } from '../components/Alteracoes'

interface Cardapio { id: string; nome: string; descricao: string | null; dias_semana: number[] | null; ordem: number; ativo: boolean }
interface Vinculo { ficha_id: string; cardapio_id: string; preco_venda: number | null }
interface Ficha { id: string; nome: string; preco_venda: number | null; ativo: boolean }

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
  const [configurando, setConfigurando] = useState<string | null>(null)
  const [ajusteSujo, setAjusteSujo] = useState(false)

  /** abre/fecha o painel "ajustar"; pergunta antes se houver alterações não salvas */
  function alternarAjuste(id: string) {
    if (ajusteSujo && !confirm('Há alterações não salvas neste cardápio. Descartar?')) return
    setAjusteSujo(false)
    setConfigurando(configurando === id ? null : id)
  }
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
    if (error) {
      alert('Não foi possível salvar: ' + error.message)
      return false
    }
    setCardapios((p) => p.map((c) => (c.id === id ? { ...c, ...campos } : c)))
    return true
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
    setAjusteSujo(false)
    setConfigurando(null)
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
      <Cabecalho titulo="Cardápios" subtitulo={carregando ? 'Carregando…' : `${cardapios.length} cardápios · ${cardapios.filter((c) => c.ativo).length} ativos`} />
      {erro && <Erro texto={erro} />}
      {carregando ? <Carregando /> : cardapios.length === 0 ? <Vazio texto="Nenhum cardápio cadastrado." /> : (
        <div className="space-y-3">
          {cardapios.map((c) => {
            const pratos = vinculos
              .filter((v) => v.cardapio_id === c.id)
              .map((v) => ({ v, f: fichas.find((x) => x.id === v.ficha_id) }))
              .sort((a, b) => (a.f?.nome ?? '').localeCompare(b.f?.nome ?? '', 'pt-BR'))
            const dias = c.dias_semana ?? []
            const estaAberto = aberto === c.id
            return (
              <section key={c.id} className={`${cartaoCls} overflow-hidden`}>
                {/* cabeçalho: nome, dias e status numa linha só */}
                <div className="flex items-stretch">
                  <button
                    onClick={() => setAberto(estaAberto ? null : c.id)}
                    aria-expanded={estaAberto}
                    className="flex min-h-[56px] flex-1 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left text-sm"
                  >
                    <span className="w-3 text-ink-soft">{estaAberto ? '▾' : '▸'}</span>
                    <span className={`subtitulo ${c.ativo ? '' : 'text-ink-soft line-through'}`}>{c.nome}</span>
                    <span className="text-xs text-ink-soft">
                      {dias.length ? dias.map((d) => DIAS[d]).join(' · ') : 'todos os dias'}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.ativo ? 'bg-ok-soft text-ok' : 'bg-paper-dim text-ink-soft'}`}>
                      {c.ativo ? 'ativo' : 'inativo'}
                    </span>
                    <span className="ml-auto text-xs text-ink-soft">{pratos.length} {pratos.length === 1 ? 'prato' : 'pratos'}</span>
                  </button>
                  {edita && (
                    <button
                      onClick={() => alternarAjuste(c.id)}
                      aria-label={`configurar ${c.nome}`}
                      className={`min-h-[56px] min-w-[56px] border-l border-line px-4 text-sm font-medium ${configurando === c.id ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:text-brand'}`}
                    >
                      ajustar
                    </button>
                  )}
                </div>

                {edita && configurando === c.id && (
                  <AjustarCardapio
                    c={c}
                    onSujo={setAjusteSujo}
                    onSalvar={async (campos) => {
                      const ok = await atualizar(c.id, campos)
                      if (ok) setAjusteSujo(false)
                      return ok
                    }}
                    onExcluir={() => excluir(c)}
                  />
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
                      <div className="border-t border-line p-4">
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
        <div className={`${cartaoCls} mt-6 flex flex-col gap-2 p-4 sm:flex-row`}>
          <input placeholder="novo cardápio" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} className={inputCls} />
          <button onClick={criar} className={btnCls}>+ Criar cardápio</button>
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
              className={`min-h-[44px] w-24 rounded-[10px] border bg-surface px-2 text-right text-sm tabular-nums ${especifico ? 'border-ink text-ink' : 'border-line text-ink-soft'}`}
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

/** Painel "ajustar": edita nome, descrição, dias, ordem e ativo, com Salvar/Descartar */
function AjustarCardapio({
  c,
  onSujo,
  onSalvar,
  onExcluir,
}: {
  c: Cardapio
  onSujo: (sujo: boolean) => void
  onSalvar: (campos: Partial<Cardapio>) => Promise<boolean>
  onExcluir: () => void
}) {
  const inicial = {
    nome: c.nome,
    descricao: c.descricao ?? '',
    dias: [...(c.dias_semana ?? [])].sort(),
    ordem: String(c.ordem),
    ativo: c.ativo,
  }
  const [f, setF] = useState(inicial)
  const [salvando, setSalvando] = useState(false)
  const sujo = JSON.stringify(f) !== JSON.stringify(inicial)
  const { liberar } = useAlteracoesPendentes(sujo)

  useEffect(() => onSujo(sujo), [sujo])

  async function salvar() {
    if (!f.nome.trim()) return alert('Informe o nome do cardápio.')
    setSalvando(true)
    const ok = await onSalvar({
      nome: f.nome.trim(),
      descricao: f.descricao.trim() || null,
      dias_semana: f.dias.length ? f.dias : null,
      ordem: Number(f.ordem) || 0,
      ativo: f.ativo,
    })
    setSalvando(false)
    if (ok) liberar()
  }

  return (
    <div className="space-y-4 border-t border-line bg-paper/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-ink-soft">
          Nome
          <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-xs text-ink-soft">
          Descrição
          <input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} className={inputCls} />
        </label>
      </div>
      <div>
        <div className="mb-1 text-xs text-ink-soft">Dias da semana (nenhum = todos os dias)</div>
        <div className="rolagem-x flex gap-2">
          {DIAS.map((d, i) => {
            const on = f.dias.includes(i)
            return (
              <button
                key={d}
                onClick={() => setF({ ...f, dias: on ? f.dias.filter((x) => x !== i) : [...f.dias, i].sort() })}
                aria-pressed={on}
                className={`${chipCls(on)} min-w-[52px] justify-center`}
              >
                {d}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-ink-soft">
          Ordem
          <input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} className={`${inputCls} w-24`} />
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} className="h-5 w-5 accent-[var(--color-brand)]" />
          Ativo
        </label>
      </div>
      <BarraSalvar
        sujo={sujo}
        salvando={salvando}
        onSalvar={salvar}
        onDescartar={() => setF(inicial)}
        extra={
          <button onClick={onExcluir} disabled={salvando} className={btnPerigoCls}>
            Excluir cardápio
          </button>
        }
      />
    </div>
  )
}
