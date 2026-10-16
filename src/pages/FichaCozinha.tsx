import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Ingredientes, Passos, SeletorPorcoes } from '../components/FichaPartes'
import { Icone } from '../components/Icone'
import { Ficha, baseRendimento, unidadeRendimento, useFicha } from '../lib/fichas'
import { registrarUsoFicha } from '../lib/armazenamento'
import { LinhaVersao } from '../components/AvisoAtualizacao'

/** Tela cheia para a cozinha: letra grande, fundo escuro e nenhum valor em R$ */
export function FichaCozinha() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { dados, carregando, erro } = useFicha(id)
  const [qtd, setQtd] = useState<number | null>(null)
  const ficha = dados?.ficha

  useEffect(() => {
    if (ficha) setQtd(baseRendimento(ficha))
  }, [ficha?.id])

  // entra em "usadas hoje" na grade de fichas deste aparelho
  useEffect(() => {
    if (ficha) registrarUsoFicha(ficha.id)
  }, [ficha?.id])

  // tenta manter a tela acesa enquanto a ficha está aberta
  useEffect(() => {
    type Lock = { release: () => Promise<void> }
    let lock: Lock | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => {
      lock?.release().catch(() => {})
    }
  }, [])

  // volta para onde a pessoa estava (grade com filtros); se abriu por link direto, vai para a grade
  function voltar() {
    if (location.key !== 'default') navigate(-1)
    else navigate('/fichas')
  }

  return (
    <div className="min-h-screen bg-[#1A1614] text-[#F3ECE6]">
      {/* barra fixa: voltar + porções */}
      <div className="sticky top-0 z-10 border-b border-[#3A312C] bg-[#1A1614]/95 px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <button
            onClick={voltar}
            className="flex min-h-[56px] items-center gap-2 rounded-xl border border-[#3A312C] px-5 text-lg font-semibold"
          >
            <Icone nome="voltar" tamanho={22} />
            Voltar
          </button>
          {ficha && qtd != null && (
            <SeletorPorcoes valor={qtd} base={baseRendimento(ficha)} unidade={unidadeRendimento(ficha)} onChange={setQtd} grande />
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
        {carregando && !dados && <p className="text-2xl">Carregando…</p>}
        {erro && <p className="text-2xl text-[#F08A6A]">{erro}</p>}

        {dados && ficha && ficha.foto_url && (
          <div className="space-y-10 [&_.divide-line>*]:border-[#3A312C]">
            <div className="relative overflow-hidden rounded-2xl bg-[#2A2320]">
              <img
                src={ficha.foto_url}
                alt=""
                className="aspect-[4/3] w-full object-cover min-[900px]:aspect-auto min-[900px]:h-[46vh]"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-5 pb-5 pt-20 sm:px-8 sm:pb-7">
                <h1 className="font-display text-4xl font-semibold leading-tight text-white sm:text-5xl">{ficha.nome}</h1>
              </div>
            </div>
            {/* tablet na horizontal: ingredientes fixos à esquerda, passos à direita */}
            <div className="space-y-10 min-[900px]:grid min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] min-[900px]:items-start min-[900px]:gap-10 min-[900px]:space-y-0">
              <section className="min-[900px]:sticky min-[900px]:top-[104px] min-[900px]:max-h-[calc(100vh-120px)] min-[900px]:overflow-y-auto">
                <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-[0.12em] text-[#B3A89E]">Ingredientes</h2>
                <Ingredientes itens={dados.itens} fator={qtd ? qtd / baseRendimento(ficha) : 1} grande />
              </section>
              <div className="space-y-10">
                <Preparo ficha={ficha} />
              </div>
            </div>
          </div>
        )}

        {dados && ficha && !ficha.foto_url && (
          <div className="space-y-10 [&_.divide-line>*]:border-[#3A312C]">
            <h1 className="font-display text-4xl font-semibold leading-tight sm:text-5xl">{ficha.nome}</h1>
            <section>
              <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-[0.12em] text-[#B3A89E]">Ingredientes</h2>
              <Ingredientes itens={dados.itens} fator={qtd ? qtd / baseRendimento(ficha) : 1} grande />
            </section>
            <Preparo ficha={ficha} />
          </div>
        )}
        <LinhaVersao className="mt-16 text-center text-[#B3A89E]" />
      </div>
    </div>
  )
}

/** modo de preparo, montagem e conservação */
function Preparo({ ficha }: { ficha: Ficha }) {
  return (
    <>
      <section>
        <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-[0.12em] text-[#B3A89E]">Modo de preparo</h2>
        <Passos texto={ficha.modo_preparo} grande />
      </section>
      {ficha.montagem && (
        <section>
          <h2 className="mb-4 font-sans text-sm font-semibold uppercase tracking-[0.12em] text-[#B3A89E]">Montagem</h2>
          <Passos texto={ficha.montagem} grande />
        </section>
      )}
      {ficha.conservacao && (
        <section>
          <h2 className="mb-2 font-sans text-sm font-semibold uppercase tracking-[0.12em] text-[#B3A89E]">Conservação</h2>
          <p className="whitespace-pre-line text-xl leading-relaxed">{ficha.conservacao}</p>
        </section>
      )}
    </>
  )
}
