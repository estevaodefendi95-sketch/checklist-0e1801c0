import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { reais, pct, numero } from '../lib/formato'
import { Carregando, Vazio, Erro, btnCls, btnSecCls, cartaoCls, chipCls } from '../components/Estado'
import { Cabecalho } from '../components/Cabecalho'
import { Icone } from '../components/Icone'
import { FichaCusto, TIPO_LABEL, TipoFicha, Unidade, corCmv } from '../lib/fichas'
import { alternarFavorita, fichasFavoritas, fichasUsadasHoje } from '../lib/armazenamento'

interface Linha {
  id: string
  tipo: TipoFicha
  nome: string
  preco_venda: number | null
  meta_cmv: number
  precisa_revisao: boolean
  rendimento: number
  rendimento_unidade: Unidade
  porcoes: number
}

const TIPOS: { v: TipoFicha; label: string }[] = [
  { v: 'prato', label: 'Pratos' },
  { v: 'preparacao', label: 'Preparações-base' },
  { v: 'rodizio', label: 'Rodízio' },
]

export function Fichas() {
  const { pode, carregado } = usePermissoes()
  const verCusto = pode('ver_custos')
  const edita = pode('editar_fichas')
  const [params, setParams] = useSearchParams()
  const [fichas, setFichas] = useState<Linha[]>([])
  const [custos, setCustos] = useState<Map<string, FichaCusto>>(new Map())
  const [semPreco, setSemPreco] = useState<Map<string, number>>(new Map())
  const [nItens, setNItens] = useState<Map<string, number>>(new Map())
  const [cardapios, setCardapios] = useState<{ id: string; nome: string }[]>([])
  const [vinculos, setVinculos] = useState<{ ficha_id: string; cardapio_id: string }[]>([])
  const [favoritas, setFavoritas] = useState<string[]>(fichasFavoritas)
  const [usadas] = useState<string[]>(fichasUsadasHoje)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const busca = params.get('q') ?? ''
  const tipo = (params.get('tipo') ?? '') as '' | TipoFicha
  const cardapio = params.get('cardapio') ?? ''
  const soRevisar = params.get('revisar') === '1'
  const soAcima = params.get('acima') === '1'
  const filtrando = !!(busca.trim() || tipo || cardapio || soRevisar || soAcima)

  function filtro(mudancas: Record<string, string>) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(mudancas)) {
      if (v) p.set(k, v)
      else p.delete(k)
    }
    setParams(p, { replace: true })
  }

  useEffect(() => {
    if (!carregado) return
    let ativo = true
    ;(async () => {
      setCarregando(true)
      const [f, c, v, it, custo, pend] = await Promise.all([
        db
          .from('fichas')
          .select('id,tipo,nome,preco_venda,meta_cmv,precisa_revisao,rendimento,rendimento_unidade,porcoes')
          .eq('ativo', true)
          .order('nome'),
        db.from('cardapios').select('id,nome').eq('ativo', true).order('ordem'),
        db.from('ficha_cardapios').select('ficha_id,cardapio_id'),
        db.from('ficha_itens').select('ficha_id'),
        verCusto
          ? db.from('v_fichas_custo').select('id,custo_unitario,cmv_pct,margem,preco_sugerido,pendencias')
          : { data: [] },
        verCusto ? db.from('v_itens_pendentes').select('ficha_id').eq('problema', 'insumo sem preço') : { data: [] },
      ])
      if (!ativo) return
      setCarregando(false)
      if (f.error) return setErro('Não foi possível carregar as fichas: ' + f.error.message)
      setErro(custo.error ? 'Não foi possível carregar os custos: ' + custo.error.message : null)
      setFichas(f.data ?? [])
      setCardapios(c.data ?? [])
      setVinculos(v.data ?? [])
      setCustos(new Map(((custo.data ?? []) as FichaCusto[]).map((x) => [x.id, x])))
      setNItens(contar((it.data ?? []) as { ficha_id: string }[]))
      setSemPreco(contar((pend.data ?? []) as { ficha_id: string }[]))
    })()
    return () => {
      ativo = false
    }
  }, [carregado, verCusto])

  const nomeCardapio = new Map(cardapios.map((c) => [c.id, c.nome]))
  const cardapiosDe = (id: string) =>
    vinculos.filter((v) => v.ficha_id === id).map((v) => nomeCardapio.get(v.cardapio_id)).filter(Boolean) as string[]

  const termo = busca.trim().toLowerCase()
  const filtradas = fichas.filter((f) => {
    if (tipo && f.tipo !== tipo) return false
    if (termo && !f.nome.toLowerCase().includes(termo)) return false
    if (soRevisar && !f.precisa_revisao) return false
    if (cardapio && !vinculos.some((v) => v.ficha_id === f.id && v.cardapio_id === cardapio)) return false
    if (soAcima) {
      const cmv = custos.get(f.id)?.cmv_pct
      if (cmv == null || cmv <= f.meta_cmv) return false
    }
    return true
  })
  const porId = new Map(fichas.map((f) => [f.id, f]))
  const doTopo = (ids: string[]) => ids.map((id) => porId.get(id)).filter(Boolean) as Linha[]
  const listaFavoritas = doTopo(favoritas)
  const listaUsadas = doTopo(usadas).filter((f) => !favoritas.includes(f.id))
  const paraRevisar = fichas.filter((f) => f.precisa_revisao).length

  function cartao(f: Linha) {
    return (
      <CartaoFicha
        key={f.id}
        f={f}
        cardapios={cardapiosDe(f.id)}
        itens={nItens.get(f.id) ?? 0}
        custo={verCusto ? custos.get(f.id) : undefined}
        semPreco={verCusto ? semPreco.get(f.id) ?? 0 : 0}
        favorita={favoritas.includes(f.id)}
        onFavoritar={() => setFavoritas(alternarFavorita(f.id))}
        detalhes={edita || verCusto}
      />
    )
  }

  return (
    <div>
      <Cabecalho
        titulo="Fichas técnicas"
        subtitulo={
          carregando
            ? 'Carregando…'
            : `${fichas.length} fichas · ${cardapios.length} cardápios${paraRevisar ? ` · ${paraRevisar} para revisar` : ''}`
        }
        acoes={
          edita && (
            <Link to="/fichas/nova" className={btnCls}>
              + Nova ficha
            </Link>
          )
        }
      />

      {/* busca grande e chips que rolam na horizontal */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 space-y-3 bg-paper/95 px-4 pb-3 pt-2 backdrop-blur md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
        <label className="flex min-h-[52px] items-center gap-3 rounded-xl border border-line bg-surface px-4 focus-within:border-brand md:min-h-[56px]">
          <Icone nome="busca" className="text-ink-soft" />
          <input
            type="search"
            placeholder="Buscar prato ou preparação"
            value={busca}
            onChange={(e) => filtro({ q: e.target.value })}
            className="h-full w-full bg-transparent text-base outline-none md:text-lg"
            aria-label="Buscar ficha"
          />
        </label>
        <div className="rolagem-x -mx-4 flex gap-2 px-4 md:-mx-6 md:px-6 lg:mx-0 lg:px-0" role="group" aria-label="Filtros">
          <button onClick={() => filtro({ cardapio: '', tipo: '', revisar: '', acima: '' })} className={chipCls(!cardapio && !tipo && !soRevisar && !soAcima)}>
            Todas
          </button>
          {cardapios.map((c) => (
            <button key={c.id} onClick={() => filtro({ cardapio: cardapio === c.id ? '' : c.id })} className={chipCls(cardapio === c.id)} aria-pressed={cardapio === c.id}>
              {c.nome}
            </button>
          ))}
          <span className="mx-1 w-px shrink-0 bg-line" aria-hidden="true" />
          {TIPOS.map((t) => (
            <button key={t.v} onClick={() => filtro({ tipo: tipo === t.v ? '' : t.v })} className={chipCls(tipo === t.v)} aria-pressed={tipo === t.v}>
              {t.label}
            </button>
          ))}
          <button onClick={() => filtro({ revisar: soRevisar ? '' : '1' })} className={chipCls(soRevisar)} aria-pressed={soRevisar}>
            Só para revisar
          </button>
          {verCusto && (
            <button onClick={() => filtro({ acima: soAcima ? '' : '1' })} className={chipCls(soAcima)} aria-pressed={soAcima}>
              CMV acima da meta
            </button>
          )}
        </div>
      </div>

      {erro && <Erro texto={erro} />}
      {carregando ? (
        <Carregando />
      ) : fichas.length === 0 ? (
        <Vazio texto="Nenhuma ficha cadastrada." />
      ) : (
        <>
          {!filtrando && listaFavoritas.length > 0 && (
            <Secao titulo="Favoritas">{listaFavoritas.map(cartao)}</Secao>
          )}
          {!filtrando && listaUsadas.length > 0 && <Secao titulo="Usadas hoje">{listaUsadas.map(cartao)}</Secao>}
          <Secao titulo={filtrando ? `${filtradas.length} ${filtradas.length === 1 ? 'ficha' : 'fichas'}` : 'Todas'}>
            {filtradas.length === 0 ? (
              <div className="col-span-full">
                <Vazio texto="Nenhuma ficha com esses filtros." />
              </div>
            ) : (
              filtradas.map(cartao)
            )}
          </Secao>
          {!filtrando && listaFavoritas.length === 0 && (
            <p className="apoio mt-2">Toque na ★ de uma ficha para fixá-la no topo deste aparelho.</p>
          )}
        </>
      )}
    </div>
  )
}

function contar(linhas: { ficha_id: string }[]) {
  const m = new Map<string, number>()
  for (const l of linhas) m.set(l.ficha_id, (m.get(l.ficha_id) ?? 0) + 1)
  return m
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-soft" style={{ fontFamily: 'var(--font-sans)' }}>
        {titulo}
      </h2>
      {/* 1 coluna no celular, 2 no tablet em retrato, 3–4 em paisagem/desktop */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div>
    </section>
  )
}

function CartaoFicha({
  f,
  cardapios,
  itens,
  custo,
  semPreco,
  favorita,
  onFavoritar,
  detalhes,
}: {
  f: Linha
  cardapios: string[]
  itens: number
  custo?: FichaCusto
  semPreco: number
  favorita: boolean
  onFavoritar: () => void
  detalhes: boolean
}) {
  const rende =
    f.tipo === 'preparacao'
      ? `Rende ${numero(f.rendimento)} ${f.rendimento_unidade}`
      : `${numero(f.porcoes)} ${Number(f.porcoes) === 1 ? 'porção' : 'porções'}`
  return (
    <article className={`${cartaoCls} relative flex min-h-[170px] flex-col gap-2.5 p-4 transition-shadow focus-within:shadow-md hover:shadow-md md:p-[18px]`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {f.precisa_revisao && <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">Revisar</span>}
          {semPreco > 0 && (
            <span className="rounded-full border border-alert px-2.5 py-0.5 text-xs font-semibold text-alert">
              sem preço{semPreco > 1 ? ` · ${semPreco}` : ''}
            </span>
          )}
          {f.tipo !== 'prato' && <span className="apoio">{TIPO_LABEL[f.tipo]}</span>}
        </div>
        <button
          onClick={onFavoritar}
          aria-pressed={favorita}
          aria-label={favorita ? `Tirar ${f.nome} das favoritas` : `Fixar ${f.nome} nas favoritas`}
          className={`relative z-10 -mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full ${favorita ? 'text-warn' : 'text-ink-soft/60 hover:text-ink-soft'}`}
        >
          <Icone nome="estrela" preenchido={favorita} />
        </button>
      </div>

      <h3 className="text-[22px] leading-tight md:text-[26px]">
        {/* o cartão inteiro abre o modo cozinha */}
        <Link to={`/fichas/${f.id}/cozinha`} className="after:absolute after:inset-0 after:rounded-[14px] focus:outline-none">
          {f.nome}
        </Link>
      </h3>

      {cardapios.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {cardapios.map((c) => (
            <span key={c} className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="apoio">
        {rende} · {itens} {itens === 1 ? 'ingrediente' : 'ingredientes'}
      </div>

      {custo && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-ink-soft">Custo {reais(custo.custo_unitario)}</span>
          {f.tipo !== 'preparacao' && (
            <span className={`rounded-full border border-current px-2.5 py-0.5 text-xs font-semibold ${corCmv(custo.cmv_pct, f.meta_cmv)}`}>
              CMV {pct(custo.cmv_pct)}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex gap-2 pt-1">
        <span className={`${btnCls} pointer-events-none flex-1`} aria-hidden="true">
          Abrir ficha
        </span>
        {detalhes && (
          <Link to={`/fichas/${f.id}`} className={`${btnSecCls} relative z-10`}>
            Ver detalhes
          </Link>
        )}
      </div>
    </article>
  )
}
