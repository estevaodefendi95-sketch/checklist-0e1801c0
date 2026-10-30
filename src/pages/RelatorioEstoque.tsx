import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { Carregando, Erro, Vazio, btnSecCls, cartaoCls, inputCls } from '../components/Estado'
import { dataBR } from '../lib/formato'
import {
  Base,
  DIAS_LIMITE,
  Lancamento,
  MAX_ITENS_BUSCA,
  Secao,
  carregarBase,
  carregarLancamentos,
  itensDaBusca,
  modelosFiltrados,
  visaoAbaixo,
  visaoConsumo,
  visaoPorDia,
  visaoPorItem,
  visaoUltima,
} from '../lib/estoqueRelatorio'
import { baixarRelatorioPdf } from '../lib/relatorioPdf'

type Visao = 'dia' | 'item' | 'consumo' | 'ultima' | 'abaixo'
const VISOES: { id: Visao; rotulo: string; descricao: string }[] = [
  { id: 'dia', rotulo: 'Por dia', descricao: 'contagem do dia, anterior e variação' },
  { id: 'item', rotulo: 'Por item', descricao: 'histórico de um item' },
  { id: 'consumo', rotulo: 'Consumo aparente', descricao: 'anterior + entradas − atual, por item' },
  { id: 'ultima', rotulo: 'Última atualização', descricao: 'dias sem contar, por item e área' },
  { id: 'abaixo', rotulo: 'Abaixo do mínimo', descricao: 'o que falta para o mínimo' },
]
const NOTA_CONSUMO = 'consumo aparente, sem vendas'
const hojeISO = () => format(new Date(), 'yyyy-MM-dd')

export function RelatorioEstoque() {
  const { podeAcessarArea } = useAuth()
  const [base, setBase] = useState<Base | null>(null)
  // contagens carregadas e a data final a que se referem
  const [carga, setCarga] = useState<{ ate: string; series: Record<string, Lancamento[]> } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [inicio, setInicio] = useState(() => format(new Date(Date.now() - 6 * 864e5), 'yyyy-MM-dd'))
  const [fim, setFim] = useState(hojeISO)
  const [filtro, setFiltro] = useState('')
  const [visao, setVisao] = useState<Visao>('dia')
  const [diaEscolhido, setDia] = useState(hojeISO)
  const [busca, setBusca] = useState('')
  const [gerandoPdf, setGerandoPdf] = useState(false)

  useEffect(() => {
    carregarBase(podeAcessarArea)
      .then(setBase)
      .catch((e) => setErro('Não foi possível carregar os modelos: ' + ((e as Error).message ?? String(e))))
  }, [])

  // uma consulta (paginada) serve a todas as visões; só refaz quando muda a data final
  useEffect(() => {
    if (!base || !fim) return
    let ativo = true
    carregarLancamentos(base, fim)
      .then((s) => ativo && setCarga({ ate: fim, series: s }))
      .catch((e) => ativo && setErro('Não foi possível carregar as contagens: ' + ((e as Error).message ?? String(e))))
    return () => {
      ativo = false
    }
  }, [base, fim])

  const series = carga?.ate === fim ? carga.series : null
  // o dia da visão "por dia" fica dentro do período
  const dia = diaEscolhido > fim ? fim : diaEscolhido < inicio ? inicio : diaEscolhido

  const periodoOk = !!inicio && !!fim && inicio <= fim
  const modelos = useMemo(() => (base ? modelosFiltrados(base, filtro) : []), [base, filtro])
  const encontrados = useMemo(() => (base ? itensDaBusca(base, modelos, busca) : []), [base, modelos, busca])

  const secoes: Secao[] = useMemo(() => {
    if (!base || !series || !periodoOk) return []
    switch (visao) {
      case 'dia':
        return visaoPorDia(base, series, modelos, dia)
      case 'item':
        return visaoPorItem(base, series, encontrados, inicio, fim)
      case 'consumo':
        return visaoConsumo(base, series, modelos, inicio, fim)
      case 'ultima':
        return visaoUltima(base, series, modelos, fim)
      case 'abaixo':
        return visaoAbaixo(base, series, modelos, fim).filter((s) => s.linhas.length)
    }
  }, [base, series, visao, modelos, dia, encontrados, inicio, fim, periodoOk])

  const atual = VISOES.find((v) => v.id === visao)!
  const nomeFiltro = useMemo(() => {
    if (!base || !filtro) return 'todas as áreas'
    if (filtro.startsWith('a:')) return base.areas[filtro.slice(2)]?.nome ?? '—'
    const m = base.modelos.find((x) => x.id === filtro.slice(2))
    return m ? `${base.areas[m.area_id]?.nome ?? '—'} · ${m.nome}` : '—'
  }, [base, filtro])

  async function exportar() {
    setGerandoPdf(true)
    setErro(null)
    const quando =
      visao === 'dia'
        ? `Dia ${dataBR(dia)}`
        : visao === 'ultima' || visao === 'abaixo'
          ? `Até ${dataBR(fim)}`
          : `${dataBR(inicio)} a ${dataBR(fim)}`
    try {
      await baixarRelatorioPdf(
        {
          titulo: `Estoque: ${atual.rotulo.toLowerCase()}`,
          subtitulo: `${quando} · ${nomeFiltro}${visao === 'item' && busca.trim() ? ` · busca "${busca.trim()}"` : ''}`,
          nota:
            visao === 'consumo' || visao === 'item'
              ? NOTA_CONSUMO
              : visao === 'ultima'
                ? `em destaque: mais de ${DIAS_LIMITE} dias sem contar`
                : undefined,
          secoes,
        },
        `estoque-${visao}-${visao === 'dia' ? dia : `${inicio}-a-${fim}`}.pdf`
      )
    } catch (e) {
      setErro('Não foi possível gerar o PDF: ' + ((e as Error).message ?? String(e)))
    }
    setGerandoPdf(false)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link to="/relatorio" className="-ml-2 mb-1 inline-flex min-h-[44px] items-center rounded-[10px] px-2 text-sm text-ink-soft hover:text-ink">
        ← relatórios
      </Link>
      <h1 className="titulo mb-4">estoque</h1>

      {/* ---------- filtros (valem para todas as visões) ---------- */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_2fr]">
        <label className="block text-xs text-ink-soft">
          de
          <input type="date" value={inicio} max={fim} onChange={(e) => setInicio(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-xs text-ink-soft">
          até
          <input type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className={inputCls} />
        </label>
        <label className="col-span-2 block text-xs text-ink-soft md:col-span-1">
          área / modelo
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={inputCls}>
            <option value="">todas as áreas</option>
            {base &&
              [...new Set(base.modelos.map((m) => m.area_id))].map((a) => (
                <optgroup key={a} label={base.areas[a]?.nome ?? '—'}>
                  <option value={`a:${a}`}>{base.areas[a]?.nome ?? '—'} (todos os modelos)</option>
                  {base.modelos
                    .filter((m) => m.area_id === a)
                    .map((m) => (
                      <option key={m.id} value={`t:${m.id}`}>
                        {m.nome}
                      </option>
                    ))}
                </optgroup>
              ))}
          </select>
        </label>
      </div>

      {/* ---------- visões: abas no tablet, lista no celular ---------- */}
      <div role="tablist" aria-label="Visões do relatório" className="mb-4 hidden gap-1 border-b border-line md:flex">
        {VISOES.map((v) => (
          <button
            key={v.id}
            role="tab"
            aria-selected={visao === v.id}
            onClick={() => setVisao(v.id)}
            className={`-mb-px min-h-[44px] border-b-2 px-3 text-sm transition-colors ${
              visao === v.id ? 'border-brand font-semibold text-brand' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {v.rotulo}
          </button>
        ))}
      </div>
      <ul className={`${cartaoCls} mb-4 divide-y divide-line md:hidden`}>
        {VISOES.map((v) => (
          <li key={v.id}>
            <button
              onClick={() => setVisao(v.id)}
              aria-current={visao === v.id}
              className={`flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm ${
                visao === v.id ? 'font-semibold text-brand' : 'text-ink'
              }`}
            >
              <span>
                {v.rotulo}
                <span className="block text-xs font-normal text-ink-soft">{v.descricao}</span>
              </span>
              {visao === v.id && <span aria-hidden>●</span>}
            </button>
          </li>
        ))}
      </ul>

      {/* ---------- controles da visão ---------- */}
      {visao === 'dia' && (
        <label className="mb-4 block max-w-xs text-xs text-ink-soft">
          dia
          <input type="date" value={dia} min={inicio} max={fim} onChange={(e) => setDia(e.target.value)} className={inputCls} />
        </label>
      )}
      {visao === 'item' && (
        <label className="mb-4 block max-w-md text-xs text-ink-soft">
          buscar item
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="ex.: limão" className={inputCls} />
        </label>
      )}
      {(visao === 'consumo' || visao === 'item') && <p className="mb-3 text-[11px] text-ink-soft/70">{NOTA_CONSUMO}</p>}
      {visao === 'ultima' && (
        <p className="mb-3 text-[11px] text-ink-soft/70">
          dias contados até {dataBR(fim)}; em destaque, mais de {DIAS_LIMITE} dias sem contar
        </p>
      )}

      {erro && (
        <div className="mb-4">
          <Erro texto={erro} />
        </div>
      )}
      {!periodoOk && <Erro texto="A data inicial precisa ser igual ou anterior à data final." />}

      {periodoOk && !erro && (!base || !series) && <Carregando />}
      {periodoOk && base && series && (
        <>
          {base.modelos.length === 0 ? (
            <Vazio texto="Nenhum modelo com contagem de estoque nas áreas que você acessa." />
          ) : visao === 'item' && !busca.trim() ? (
            <Vazio texto="Digite o nome de um item para ver o histórico." />
          ) : visao === 'item' && encontrados.length === 0 ? (
            <Vazio texto="Nenhum item com esse nome." />
          ) : visao === 'abaixo' && secoes.length === 0 ? (
            <Vazio texto="Nenhum item abaixo do mínimo na última contagem." />
          ) : (
            <div className="space-y-6">
              {visao === 'item' && encontrados.length > MAX_ITENS_BUSCA && (
                <p className="text-xs text-ink-soft">
                  Mostrando {MAX_ITENS_BUSCA} de {encontrados.length} itens. Refine a busca.
                </p>
              )}
              {secoes.map((s) => (
                <TabelaSecao key={s.titulo} secao={s} />
              ))}
              <button onClick={exportar} disabled={gerandoPdf} className={`${btnSecCls} w-full md:w-auto`}>
                {gerandoPdf ? 'gerando PDF…' : `exportar PDF (${atual.rotulo.toLowerCase()})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const corTom = { aviso: 'text-warn', alerta: 'text-alert', suave: 'text-ink-soft' } as const

function NaoConcluida() {
  return <span className="ml-1.5 whitespace-nowrap rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-normal text-warn">não concluída</span>
}

/** tabela no tablet; no celular, cada linha vira um bloco simples */
function TabelaSecao({ secao }: { secao: Secao }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-medium">{secao.titulo}</h2>
      {secao.linhas.length === 0 ? (
        <p className="text-xs text-ink-soft">Nenhum lançamento no período.</p>
      ) : (
        <>
          <div className={`${cartaoCls} hidden overflow-x-auto md:block`}>
            <table className="w-full text-sm">
              <thead className="bg-paper-dim/40 text-left text-xs text-ink-soft">
                <tr>
                  {secao.colunas.map((c) => (
                    <th key={c} className="px-3 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {secao.linhas.map((l, i) => (
                  <tr key={i} className={l.tom ? corTom[l.tom] : ''}>
                    {l.celulas.map((c, j) => (
                      <td key={j} className="px-3 py-2">
                        {c}
                        {j === 0 && l.naoConcluida && <NaoConcluida />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={`${cartaoCls} divide-y divide-line md:hidden`}>
            {secao.linhas.map((l, i) => (
              <li key={i} className={`px-4 py-3 text-sm ${l.tom ? corTom[l.tom] : ''}`}>
                <p className="font-medium">
                  {l.celulas[0]}
                  {l.naoConcluida && <NaoConcluida />}
                </p>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {l.celulas.slice(1).map((c, j) => (
                    <div key={j} className="contents">
                      <dt className="text-ink-soft">{secao.colunas[j + 1]}</dt>
                      <dd>{c}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
