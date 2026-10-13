import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Ingredientes, Passos, SeletorPorcoes } from '../components/FichaPartes'
import { baseRendimento, unidadeRendimento, useFicha } from '../lib/fichas'

/** Tela cheia para a cozinha: letra grande, fundo escuro e nenhum valor em R$ */
export function FichaCozinha() {
  const { id } = useParams()
  const { dados, carregando, erro } = useFicha(id)
  const [qtd, setQtd] = useState<number | null>(null)
  const ficha = dados?.ficha

  useEffect(() => {
    if (ficha) setQtd(baseRendimento(ficha))
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

  return (
    <div className="min-h-screen bg-[#111] px-4 py-4 text-[#f2efe6] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link
            to={id ? `/fichas/${id}` : '/fichas'}
            className="flex min-h-[44px] items-center rounded border border-[#444] px-4 text-base"
          >
            ← sair
          </Link>
          {ficha && qtd != null && (
            <SeletorPorcoes valor={qtd} base={baseRendimento(ficha)} unidade={unidadeRendimento(ficha)} onChange={setQtd} grande />
          )}
        </div>

        {carregando && !dados && <p className="text-xl">Carregando…</p>}
        {erro && <p className="text-xl text-[#ff9b8f]">{erro}</p>}

        {dados && ficha && (
          <div className="space-y-8 [&_.divide-line>*]:border-[#333]">
            <h1 className="display text-3xl font-medium sm:text-4xl">{ficha.nome}</h1>
            <section>
              <h2 className="mb-2 text-sm uppercase tracking-widest text-[#aaa]">ingredientes</h2>
              <Ingredientes itens={dados.itens} fator={qtd ? qtd / baseRendimento(ficha) : 1} grande />
            </section>
            <section>
              <h2 className="mb-3 text-sm uppercase tracking-widest text-[#aaa]">modo de preparo</h2>
              <Passos texto={ficha.modo_preparo} grande />
            </section>
            {ficha.montagem && (
              <section>
                <h2 className="mb-3 text-sm uppercase tracking-widest text-[#aaa]">montagem</h2>
                <Passos texto={ficha.montagem} grande />
              </section>
            )}
            {ficha.conservacao && (
              <section>
                <h2 className="mb-2 text-sm uppercase tracking-widest text-[#aaa]">conservação</h2>
                <p className="whitespace-pre-line text-xl">{ficha.conservacao}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
