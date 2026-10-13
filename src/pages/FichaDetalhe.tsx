import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { reais, pct, numero, dataBR } from '../lib/formato'
import { Carregando, Erro, btnCls, btnSecCls } from '../components/Estado'
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
        <Link to="/fichas" className="text-xs text-ink-soft underline">
          ← fichas técnicas
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="display text-2xl font-medium">{ficha.nome}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
              <span>{TIPO_LABEL[ficha.tipo]}</span>
              {dados.cardapios.map((c) => (
                <span key={c.id} className="rounded border border-line px-1.5 py-0.5">
                  {c.nome}
                </span>
              ))}
              {!ficha.ativo && <span className="rounded bg-paper-dim px-1.5 py-0.5">inativa</span>}
              {ficha.precisa_revisao && (
                <span className="rounded bg-warn-soft px-1.5 py-0.5 text-warn">Revisar</span>
              )}
            </div>
            {ficha.precisa_revisao && ficha.observacao_revisao && (
              <p className="mt-2 text-xs text-warn">{ficha.observacao_revisao}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/fichas/${ficha.id}/cozinha`} className={`${btnSecCls} flex items-center`}>
              modo cozinha
            </Link>
            {edita && (
              <Link to={`/fichas/${ficha.id}/editar`} className={`${btnCls} flex items-center`}>
                editar
              </Link>
            )}
          </div>
        </div>
        {edita && ficha.precisa_revisao && (
          <button onClick={marcarRevisada} disabled={marcando} className={`${btnSecCls} mt-3 border-warn text-warn`}>
            {marcando ? 'salvando…' : 'Marcar como revisada'}
          </button>
        )}
      </div>

      {ficha.foto_url && (
        <img src={ficha.foto_url} alt={ficha.nome} className="max-h-72 w-full rounded border border-line object-cover" />
      )}

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

      <section>
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

      <section>
        <h2 className="display mb-2 text-lg">modo de preparo</h2>
        <Passos texto={ficha.modo_preparo} />
      </section>

      {ficha.montagem && (
        <section>
          <h2 className="display mb-2 text-lg">montagem</h2>
          <Passos texto={ficha.montagem} />
        </section>
      )}
      {ficha.utensilios && (
        <section>
          <h2 className="display mb-2 text-lg">utensílios</h2>
          <p className="whitespace-pre-line text-sm">{ficha.utensilios}</p>
        </section>
      )}
      {ficha.conservacao && (
        <section>
          <h2 className="display mb-2 text-lg">conservação</h2>
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
    <div className="rounded border border-line p-3">
      <div className="text-xs text-ink-soft">{titulo}</div>
      <div className={`display text-xl ${cor ?? ''}`}>{valor}</div>
    </div>
  )
}
