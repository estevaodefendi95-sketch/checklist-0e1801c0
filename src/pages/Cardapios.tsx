import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { reais, lerNumero } from '../lib/formato'
import { Carregando, Vazio, Erro, inputCls, btnCls, btnSecCls, btnPerigoCls, cartaoCls, chipCls } from '../components/Estado'
import { Cabecalho } from '../components/Cabecalho'
import { BarraSalvar, SeloAlteracoes, useAlteracoesPendentes } from '../components/Alteracoes'
import { Icone } from '../components/Icone'

interface Cardapio { id: string; nome: string; descricao: string | null; dias_semana: number[] | null; ordem: number; ativo: boolean }
interface Vinculo { ficha_id: string; cardapio_id: string; preco_venda: number | null }
interface Ficha { id: string; nome: string; preco_venda: number | null; ativo: boolean }
type Campos = Pick<Cardapio, 'nome' | 'descricao' | 'dias_semana' | 'ordem' | 'ativo'>

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diasTexto = (d: number[] | null) => (d?.length ? d.map((x) => DIAS[x]).join(' · ') : 'todos os dias')
const normalizar = (s: string) => s.trim().toLocaleLowerCase('pt-BR')

export function Cardapios() {
  const { pode } = usePermissoes()
  const edita = pode('editar_fichas')
  const verCusto = pode('ver_custos')
  const [cardapios, setCardapios] = useState<Cardapio[]>([])
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null) // cardápio aberto em "Pratos por cardápio"
  const [gerenciarAberto, setGerenciarAberto] = useState(true)
  // só um formulário de cadastro aberto por vez: 'novo' ou o id do cardápio em edição
  const [formulario, setFormulario] = useState<string | null>(null)
  const [formSujo, setFormSujo] = useState(false)

  async function load() {
    setCarregando(true)
    const [c, v, f] = await Promise.all([
      db.from('cardapios').select('*').order('ordem'),
      db.from('ficha_cardapios').select('ficha_id,cardapio_id,preco_venda'),
      // todas as fichas que não são preparação, inclusive inativas, para nomear os vínculos antigos
      db.from('fichas').select('id,nome,preco_venda,ativo').neq('tipo', 'preparacao').order('nome'),
    ])
    setCarregando(false)
    const falha = c.error ?? v.error ?? f.error
    if (falha) return setErro('Não foi possível carregar os cardápios: ' + falha.message)
    setErro(null)
    setCardapios(c.data ?? []); setVinculos(v.data ?? []); setFichas(f.data ?? [])
  }
  useEffect(() => { load() }, [])

  /** abre um formulário (ou fecha o atual); pergunta antes de descartar alterações */
  function abrirFormulario(qual: string | null) {
    if (formSujo && !confirm('Há alterações não salvas neste cardápio. Descartar?')) return
    setFormSujo(false)
    setFormulario(formulario === qual ? null : qual)
    if (qual) setGerenciarAberto(true)
  }

  function nomeRepetido(nome: string, ignorarId?: string) {
    const n = normalizar(nome)
    return !!n && cardapios.some((c) => c.id !== ignorarId && normalizar(c.nome) === n)
  }

  /** devolve a mensagem de erro (o formulário continua aberto) ou null se deu certo */
  async function criar(campos: Campos): Promise<string | null> {
    const { data, error } = await db.from('cardapios').insert(campos).select('*').single()
    if (error) return mensagemErro(error.message)
    setCardapios((p) => [...p, data as Cardapio].sort((a, b) => a.ordem - b.ordem))
    setFormSujo(false)
    setFormulario(null)
    return null
  }
  async function atualizar(id: string, campos: Campos): Promise<string | null> {
    const { error } = await db.from('cardapios').update(campos).eq('id', id)
    if (error) return mensagemErro(error.message)
    setCardapios((p) => p.map((c) => (c.id === id ? { ...c, ...campos } : c)).sort((a, b) => a.ordem - b.ordem))
    setFormSujo(false)
    setFormulario(null)
    return null
  }
  async function excluir(c: Cardapio) {
    const n = vinculos.filter((v) => v.cardapio_id === c.id).length
    const texto = n
      ? `Excluir o cardápio ${c.nome}? Os ${n} ${n === 1 ? 'prato continua' : 'pratos continuam'} existindo.`
      : `Excluir o cardápio ${c.nome}?`
    if (!confirm(texto)) return
    // apaga só o cardápio; os vínculos em ficha_cardapios caem pelo ON DELETE CASCADE e as fichas ficam
    const { error } = await db.from('cardapios').delete().eq('id', c.id)
    if (error) return alert('Não foi possível excluir: ' + error.message)
    setCardapios((p) => p.filter((x) => x.id !== c.id))
    setVinculos((p) => p.filter((v) => v.cardapio_id !== c.id))
    if (formulario === c.id) {
      setFormSujo(false)
      setFormulario(null)
    }
    if (aberto === c.id) setAberto(null)
  }

  async function addPrato(cardapio_id: string, ficha_id: string) {
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

  const nPratos = (id: string) => vinculos.filter((v) => v.cardapio_id === id).length
  const proximaOrdem = cardapios.reduce((m, c) => Math.max(m, c.ordem), 0) + 1

  return (
    <div>
      <Cabecalho
        titulo="Cardápios"
        subtitulo={carregando ? 'Carregando…' : `${cardapios.length} cardápios · ${cardapios.filter((c) => c.ativo).length} ativos`}
        acoes={
          edita && (
            <button onClick={() => abrirFormulario('novo')} className={btnCls} aria-expanded={formulario === 'novo'}>
              + Novo cardápio
            </button>
          )
        }
      />
      {erro && <div className="mb-4"><Erro texto={erro} /></div>}

      {edita && formulario === 'novo' && (
        <section className={`${cartaoCls} mb-6 p-4 md:p-6`} aria-label="Novo cardápio">
          <h2 className="subtitulo mb-4">Novo cardápio</h2>
          <FormCardapio
            inicial={{ nome: '', descricao: null, dias_semana: null, ordem: proximaOrdem, ativo: true }}
            criando
            nomeRepetido={(n) => nomeRepetido(n)}
            onSujo={setFormSujo}
            onSalvar={criar}
            onCancelar={() => abrirFormulario('novo')}
          />
        </section>
      )}

      {carregando ? (
        <Carregando />
      ) : (
        <>
          {/* ---------- Gerenciar cardápios (só editar_fichas) ---------- */}
          {edita && (
            <section className={`${cartaoCls} mb-8 overflow-hidden`}>
              <button
                onClick={() => setGerenciarAberto((v) => !v)}
                aria-expanded={gerenciarAberto}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 text-left"
              >
                <span className="subtitulo">Gerenciar cardápios</span>
                <span className="flex items-center gap-2 text-sm text-ink-soft">
                  {gerenciarAberto ? 'recolher' : 'abrir'}
                  <Icone nome={gerenciarAberto ? 'recolher' : 'expandir'} tamanho={16} className={gerenciarAberto ? 'rotate-90' : ''} />
                </span>
              </button>
              {gerenciarAberto && (
                cardapios.length === 0 ? (
                  <p className="border-t border-line p-4 text-sm text-ink-soft">Nenhum cardápio. Crie o primeiro acima.</p>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {cardapios.map((c) => {
                      const n = nPratos(c.id)
                      return (
                        <li key={c.id}>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`font-semibold ${c.ativo ? '' : 'text-ink-soft'}`}>{c.nome}</span>
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.ativo ? 'bg-ok-soft text-ok' : 'bg-paper-dim text-ink-soft'}`}>
                                  {c.ativo ? 'ativo' : 'inativo'}
                                </span>
                              </div>
                              <div className="apoio">
                                {diasTexto(c.dias_semana)} · {n} {n === 1 ? 'prato' : 'pratos'}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => abrirFormulario(c.id)}
                                aria-expanded={formulario === c.id}
                                className={formulario === c.id ? `${btnSecCls} bg-brand-soft` : btnSecCls}
                              >
                                {formulario === c.id ? 'Fechar' : 'Editar'}
                              </button>
                              <button onClick={() => excluir(c)} className={btnPerigoCls}>
                                Excluir
                              </button>
                            </div>
                          </div>
                          {formulario === c.id && (
                            <div className="border-t border-line bg-paper/60 p-4">
                              <FormCardapio
                                inicial={c}
                                nomeRepetido={(nome) => nomeRepetido(nome, c.id)}
                                onSujo={setFormSujo}
                                onSalvar={(campos) => atualizar(c.id, campos)}
                              />
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )
              )}
            </section>
          )}

          {/* ---------- Pratos por cardápio (todos) ---------- */}
          <h2 className="subtitulo mb-3">Pratos por cardápio</h2>
          {cardapios.length === 0 ? (
            <Vazio texto={edita ? 'Nenhum cardápio. Crie o primeiro acima.' : 'Nenhum cardápio cadastrado.'} />
          ) : (
            <div className="space-y-3">
              {cardapios.map((c) => {
                const pratos = vinculos
                  .filter((v) => v.cardapio_id === c.id)
                  .map((v) => ({ v, f: fichas.find((x) => x.id === v.ficha_id) }))
                  .sort((a, b) => (a.f?.nome ?? '').localeCompare(b.f?.nome ?? '', 'pt-BR'))
                const estaAberto = aberto === c.id
                return (
                  <section key={c.id} className={`${cartaoCls} overflow-hidden`}>
                    <button
                      onClick={() => setAberto(estaAberto ? null : c.id)}
                      aria-expanded={estaAberto}
                      className="flex min-h-[56px] w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-left text-sm"
                    >
                      <span className="w-3 text-ink-soft" aria-hidden="true">{estaAberto ? '▾' : '▸'}</span>
                      <span className={`subtitulo ${c.ativo ? '' : 'text-ink-soft line-through'}`}>{c.nome}</span>
                      <span className="text-xs text-ink-soft">{diasTexto(c.dias_semana)}</span>
                      {!c.ativo && <span className="rounded-full bg-paper-dim px-2.5 py-0.5 text-xs font-semibold text-ink-soft">inativo</span>}
                      <span className="ml-auto text-xs text-ink-soft">{pratos.length} {pratos.length === 1 ? 'prato' : 'pratos'}</span>
                    </button>

                    {estaAberto && (
                      <div className="border-t border-line">
                        {c.descricao && <p className="px-4 pt-3 text-sm text-ink-soft">{c.descricao}</p>}
                        {pratos.length === 0 ? (
                          <p className="p-4 text-sm text-ink-soft">Nenhum prato neste cardápio.</p>
                        ) : (
                          <ul className="divide-y divide-line">
                            {verCusto && (
                              <li className="hidden px-4 py-1 text-right text-xs text-ink-soft sm:block">preço neste cardápio</li>
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
                            <BuscaFicha
                              fichas={fichas.filter((f) => f.ativo && !pratos.some((p) => p.v.ficha_id === f.id))}
                              onEscolher={(id) => addPrato(c.id, id)}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function mensagemErro(msg: string) {
  return msg.includes('duplicate key') || msg.includes('cardapios_nome_key')
    ? 'Já existe um cardápio com esse nome.'
    : 'Não foi possível salvar: ' + msg
}

/** Cadastro de cardápio (criar ou editar), com o padrão de alterações não salvas */
function FormCardapio({
  inicial: base,
  criando,
  nomeRepetido,
  onSujo,
  onSalvar,
  onCancelar,
}: {
  inicial: Campos
  criando?: boolean
  nomeRepetido: (nome: string) => boolean
  onSujo: (sujo: boolean) => void
  onSalvar: (campos: Campos) => Promise<string | null>
  onCancelar?: () => void
}) {
  const inicial = {
    nome: base.nome,
    descricao: base.descricao ?? '',
    dias: [...(base.dias_semana ?? [])].sort(),
    ordem: String(base.ordem),
    ativo: base.ativo,
  }
  const [f, setF] = useState(inicial)
  const [salvando, setSalvando] = useState(false)
  const [erroServidor, setErroServidor] = useState<string | null>(null)
  const sujo = JSON.stringify(f) !== JSON.stringify(inicial)
  const { liberar } = useAlteracoesPendentes(sujo)
  const repetido = nomeRepetido(f.nome)
  const erroNome = repetido ? 'Já existe um cardápio com esse nome.' : null

  useEffect(() => onSujo(sujo), [sujo])

  async function salvar() {
    if (!f.nome.trim() || repetido) return
    setSalvando(true)
    setErroServidor(null)
    const erro = await onSalvar({
      nome: f.nome.trim(),
      descricao: f.descricao.trim() || null,
      dias_semana: f.dias.length ? f.dias : null,
      ordem: Number(f.ordem) || 0,
      ativo: f.ativo,
    })
    setSalvando(false)
    if (erro) setErroServidor(erro)
    else liberar()
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-ink-soft">
          Nome
          <input
            value={f.nome}
            onChange={(e) => setF({ ...f, nome: e.target.value })}
            aria-invalid={!!erroNome}
            autoFocus={criando}
            required
            className={`${inputCls} ${erroNome ? 'border-alert focus:border-alert' : ''}`}
          />
          {erroNome && <span className="mt-1 block text-sm text-alert" role="alert">{erroNome}</span>}
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
                type="button"
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

      {erroServidor && <Erro texto={erroServidor} />}

      {criando ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {sujo && <span className="mr-auto"><SeloAlteracoes /></span>}
          <button type="button" onClick={onCancelar} disabled={salvando} className={btnSecCls}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !f.nome.trim() || repetido} className={btnCls}>
            {salvando ? 'Criando…' : 'Criar cardápio'}
          </button>
        </div>
      ) : (
        <BarraSalvar
          sujo={sujo}
          salvando={salvando}
          onSalvar={salvar}
          onDescartar={() => {
            setF(inicial)
            setErroServidor(null)
          }}
        />
      )}
    </form>
  )
}

/** busca de ficha para adicionar ao cardápio */
function BuscaFicha({ fichas, onEscolher }: { fichas: Ficha[]; onEscolher: (id: string) => void }) {
  const [termo, setTermo] = useState('')
  const t = normalizar(termo)
  const achadas = t ? fichas.filter((f) => normalizar(f.nome).includes(t)).slice(0, 8) : []
  return (
    <div>
      <label className="flex min-h-[44px] items-center gap-2 rounded-[10px] border border-line bg-surface px-3 focus-within:border-brand md:min-h-[48px]">
        <Icone nome="busca" tamanho={18} className="text-ink-soft" />
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="+ adicionar prato: buscar ficha"
          aria-label="Buscar ficha para adicionar"
          className="h-full w-full bg-transparent text-sm outline-none"
        />
      </label>
      {t && (
        <ul className="mt-1 divide-y divide-line rounded-[10px] border border-line bg-surface">
          {achadas.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-soft">Nenhuma ficha encontrada (ou já está neste cardápio).</li>
          ) : (
            achadas.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => {
                    onEscolher(f.id)
                    setTermo('')
                  }}
                  className="flex min-h-[44px] w-full items-center px-3 text-left text-sm hover:bg-paper"
                >
                  {f.nome}
                </button>
              </li>
            ))
          )}
        </ul>
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
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
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
          <Link to={`/fichas/${v.ficha_id}/editar`} className={`${btnSecCls} px-3`}>
            Editar ficha
          </Link>
          <button onClick={onTirar} className={btnPerigoCls} aria-label={`Tirar ${f?.nome ?? 'prato'} do cardápio`}>
            Tirar
          </button>
        </span>
      )}
    </li>
  )
}
