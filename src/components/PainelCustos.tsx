import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/supabase'
import { reais, dataBR } from '../lib/formato'
import { Erro } from './Estado'

interface Dados {
  revisar: number
  semPreco: number
  precoVelho: number
  acimaMeta: number
  ultimaVenda: { data_inicio: string; data_fim: string; status: string } | null
  difEstoque: { valor: number; inicio: string; fim: string } | null
}

/** Cards do painel inicial para quem tem ver_custos. Nenhum custo é calculado aqui. */
export function PainelCustos() {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const limite = new Date(Date.now() - 60 * 86400000).toISOString()
      const [rev, sem, velho, cmv, venda, cont] = await Promise.all([
        db.from('fichas').select('id', { count: 'exact', head: true }).eq('ativo', true).eq('precisa_revisao', true),
        db.from('insumos').select('id', { count: 'exact', head: true }).eq('ativo', true).is('preco', null),
        db.from('insumos').select('id', { count: 'exact', head: true }).eq('ativo', true).not('preco', 'is', null).or(`preco_atualizado_em.is.null,preco_atualizado_em.lt.${limite}`),
        db.from('v_fichas_custo').select('cmv_pct,meta_cmv').neq('tipo', 'preparacao').not('cmv_pct', 'is', null),
        db.from('vendas_importacoes').select('data_inicio,data_fim,status').neq('status', 'cancelada').order('criado_em', { ascending: false }).limit(1),
        db.from('v_contagens').select('data').order('data', { ascending: false }).limit(500),
      ])
      const falha = [rev, sem, velho, cmv].find((r) => r.error)
      if (falha) return setErro(falha.error.message)

      // diferença de estoque entre as duas últimas datas com contagem
      let difEstoque: Dados['difEstoque'] = null
      const datas = [...new Set(((cont.data ?? []) as { data: string }[]).map((r) => r.data))]
      if (datas.length >= 2) {
        const [fim, inicio] = datas
        const comp = await db.rpc('estoque_comparativo', { p_inicio: inicio, p_fim: fim })
        if (!comp.error) {
          const valor = ((comp.data ?? []) as { diferenca_valor: number | null }[]).reduce(
            (s, r) => s + Number(r.diferenca_valor ?? 0),
            0
          )
          difEstoque = { valor, inicio, fim }
        }
      }

      setD({
        revisar: rev.count ?? 0,
        semPreco: sem.count ?? 0,
        precoVelho: velho.count ?? 0,
        acimaMeta: ((cmv.data ?? []) as { cmv_pct: number; meta_cmv: number }[]).filter(
          (r) => Number(r.cmv_pct) > Number(r.meta_cmv)
        ).length,
        ultimaVenda: venda.data?.[0] ?? null,
        difEstoque,
      })
    })()
  }, [])

  if (erro) return <Erro texto={erro} />
  return (
    <div className="mb-8">
      <h1 className="display mb-3 text-xl font-medium">painel</h1>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Card titulo="fichas para revisar" valor={d?.revisar} para="/fichas?revisar=1" alerta={!!d?.revisar} />
        <Card titulo="insumos sem preço" valor={d?.semPreco} para="/insumos?filtro=sem_preco" alerta={!!d?.semPreco} />
        <Card titulo="preços com +60 dias" valor={d?.precoVelho} para="/insumos?filtro=desatualizado" alerta={!!d?.precoVelho} />
        <Card titulo="pratos acima da meta de CMV" valor={d?.acimaMeta} para="/fichas?acima=1" alerta={!!d?.acimaMeta} />
        <Card
          titulo="última importação de vendas"
          valor={d ? (d.ultimaVenda ? `${dataBR(d.ultimaVenda.data_inicio)} a ${dataBR(d.ultimaVenda.data_fim)}` : 'nenhuma') : undefined}
          detalhe={d?.ultimaVenda?.status}
          pequeno
        />
        <Card
          titulo="diferença de estoque"
          valor={d ? (d.difEstoque ? reais(d.difEstoque.valor) : 'sem contagens') : undefined}
          detalhe={d?.difEstoque ? `${dataBR(d.difEstoque.inicio)} a ${dataBR(d.difEstoque.fim)}` : undefined}
          alerta={!!d?.difEstoque && d.difEstoque.valor < 0}
          pequeno
        />
      </div>
    </div>
  )
}

function Card({
  titulo,
  valor,
  para,
  alerta,
  detalhe,
  pequeno,
}: {
  titulo: string
  valor: number | string | undefined
  para?: string
  alerta?: boolean
  detalhe?: string
  pequeno?: boolean
}) {
  const corpo = (
    <>
      <div className="text-xs text-ink-soft">{titulo}</div>
      <div className={`display ${pequeno ? 'text-base' : 'text-2xl'} ${alerta ? 'text-warn' : ''}`}>
        {valor ?? '…'}
      </div>
      {detalhe && <div className="text-xs text-ink-soft">{detalhe}</div>}
    </>
  )
  const cls = 'block min-h-[44px] rounded border border-line p-3'
  return para ? (
    <Link to={para} className={`${cls} hover:border-ink`}>
      {corpo}
    </Link>
  ) : (
    <div className={cls}>{corpo}</div>
  )
}
