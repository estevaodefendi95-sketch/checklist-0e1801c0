import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { reais, pct, numero, dataBR } from '../lib/formato'
import { Carregando, Erro, btnCls, btnSecCls, cartaoCls } from '../components/Estado'
import { Cabecalho } from '../components/Cabecalho'
import { Ingredientes, Passos, SeletorPorcoes } from '../components/FichaPartes'
import { FichaHistorico } from '../components/FichaHistorico'
import {
  FichaCusto,
  TIPO_LABEL,
  baseRendimento,
  carregarCusto,
  carregarCustoItens,
  corCmv,
  unidadeRendimento,
  useFicha,
} from '../lib/fichas'

export function FichaDetalhe() {
  const { id } = useParams()
  const { pode } = usePermissoes()
  const verCusto = pode('ver_custos')
  const edita = pode('editar_fichas')
  const { dados, carregando, erro, recarregar } = useFicha(id)
  const [qtd, setQtd] = useState<number | null>(null)
  const [custo, setCusto] = useState<FichaCusto | null>(null)
  const [custoItens, setCustoItens] = useState<Map<string, number | null> | null>(null)
  const [marcando, setMarcando] = useState(false)

  const ficha = dados?.ficha
  useEffect(() => {
    if (ficha) setQtd(baseRendimento(ficha))
  }, [ficha?.id])

  useEffect(() => {
    if (!id || !verCusto) {
      setCusto(null)
      setCustoItens(null)
      return
    }
    carregarCusto(id).then(setCusto)
    carregarCustoItens(id).then(setCustoItens)
  }, [id, verCusto, ficha?.versao])

  async function marcarRevisada() {
    if (!ficha) return
    setMarcando(true)
    const { error } = await db.from('fichas').update({ precisa_revisao: false }).eq('id', ficha.id)
    setMarcando(false)
    if (error) return alert('Não foi possível salvar: ' + error.message)
    recarregar()
  }

  if (carregando && !dados) return <Carregando />
  if (erro) return <Erro texto={erro} />
  if (!dados || !ficha) return null

  const base = baseRendimento(ficha)
  const fator = qtd ? qtd / base : 1

  return (
    <div className="space-y-6">
      <div>
        <Cabecalho
          voltar={{ para: '/fichas', rotulo: 'fichas técnicas' }}
          topo={
            ficha.foto_url ? (
              <img
                src={ficha.foto_url}
                alt={ficha.nome}
                className="aspect-[4/3] w-full rounded-[14px] bg-paper-dim object-cover shadow-card md:max-h-[420px]"
              />
            ) : (
              <div className="flex min-h-[112px] items-center justify-center rounded-[14px] bg-paper-dim px-4 py-6 text-center">
                <span className="display text-2xl text-ink-soft md:text-3xl">{ficha.nome}</span>
              </div>
            )
          }
          titulo={ficha.nome}
          subtitulo={
            <span className="flex flex-wrap items-center gap-1.5">
              <span>{TIPO_LABEL[ficha.tipo]}</span>
              {dados.cardapios.map((c) => (
                <span key={c.id} className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
                  {c.nome}
                </span>
              ))}
              {!ficha.ativo && <span className="rounded-full bg-paper-dim px-2 py-0.5 text-xs">inativa</span>}
              {ficha.precisa_revisao && (
                <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">Revisar</span>
              )}
            </span>
          }
          acoes={
            <>
              {/* um único CTA: editar para quem edita; senão, o modo cozinha */}
              <Link to={`/fichas/${ficha.id}/cozinha`} className={edita ? btnSecCls : btnCls}>
                Modo cozinha
              </Link>
              {edita && (
                <Link to={`/fichas/${ficha.id}/editar`} className={btnCls}>
                  Editar ficha
                </Link>
              )}
            </>
          }
        />
        {ficha.precisa_revisao && ficha.observacao_revisao && (
          <p className="-mt-3 mb-3 text-sm text-warn">{ficha.observacao_revisao}</p>
        )}
        {edita && ficha.precisa_revisao && (
          <button onClick={marcarRevisada} disabled={marcando} className={`${btnSecCls} border-warn/50 text-warn hover:border-warn hover:bg-warn-soft`}>
            {marcando ? 'Salvando…' : 'Marcar como revisada'}
          </button>
        )}
      </div>

      {verCusto && custo && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Info titulo={ficha.tipo === 'preparacao' ? `custo por ${ficha.rendimento_unidade}` : 'custo por porção'} valor={reais(custo.custo_unitario)} />
          {ficha.tipo !== 'preparacao' && (
            <>
              <Info titulo="preço de venda" valor={reais(ficha.preco_venda)} />
              <Info
                titulo={`CMV (meta ${pct(ficha.meta_cmv)})`}
                valor={pct(custo.cmv_pct)}
                cor={corCmv(custo.cmv_pct, ficha.meta_cmv)}
              />
              <Info titulo="preço sugerido" valor={reais(custo.preco_sugerido)} />
            </>
          )}
        </div>
      )}

      <section className={`${cartaoCls} p-4 md:p-6`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="display text-lg">ingredientes</h2>
          {qtd != null && (
            <SeletorPorcoes valor={qtd} base={base} unidade={unidadeRendimento(ficha)} onChange={setQtd} />
          )}
        </div>
        <p className="mb-2 text-xs text-ink-soft">
          rende {numero(base)} {unidadeRendimento(ficha)}
          {ficha.tipo === 'preparacao' && ficha.porcoes > 1 && ` · ${numero(ficha.porcoes)} porções`}
          {' · '}perda {pct(ficha.perda_pct)}
          {ficha.tempo_preparo_min ? ` · ${ficha.tempo_preparo_min} min` : ''}
        </p>
        <Ingredientes
          itens={dados.itens}
          fator={fator}
          pendencias={verCusto ? dados.pendencias : undefined}
          custos={verCusto ? custoItens : null}
        />
        {verCusto && custoItens && fator !== 1 && (
          <p className="mt-2 text-xs text-ink-soft">O custo por linha aparece no rendimento original da ficha.</p>
        )}
      </section>

      <section className={`${cartaoCls} p-4 md:p-6`}>
        <h2 className="subtitulo mb-3">modo de preparo</h2>
        <Passos texto={ficha.modo_preparo} />
      </section>

      {ficha.montagem && (
        <section>
          <h2 className="subtitulo mb-3">montagem</h2>
          <Passos texto={ficha.montagem} />
        </section>
      )}
      {ficha.utensilios && (
        <section>
          <h2 className="subtitulo mb-3">utensílios</h2>
          <p className="whitespace-pre-line text-sm">{ficha.utensilios}</p>
        </section>
      )}
      {ficha.conservacao && (
        <section>
          <h2 className="subtitulo mb-3">conservação</h2>
          <p className="whitespace-pre-line text-sm">{ficha.conservacao}</p>
        </section>
      )}

      <p className="text-xs text-ink-soft">
        versão {ficha.versao} · atualizada em {dataBR(ficha.atualizado_em)}
      </p>

      {edita && <FichaHistorico ficha={ficha} itensAtuais={dados.itens} onRestaurado={recarregar} />}
    </div>
  )
}

function Info({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className={`${cartaoCls} p-3 md:p-4`}>
      <div className="text-xs text-ink-soft">{titulo}</div>
      <div className={`display text-xl ${cor ?? ''}`}>{valor}</div>
    </div>
  )
}
