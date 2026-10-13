import { useEffect, useState } from 'react'
import { db } from './supabase'

export type TipoFicha = 'preparacao' | 'prato' | 'rodizio'
export type Unidade = 'kg' | 'g' | 'l' | 'ml' | 'un'

export const TIPO_LABEL: Record<TipoFicha, string> = {
  prato: 'prato',
  preparacao: 'preparação-base',
  rodizio: 'rodízio',
}
export const UNIDADES_ITEM: Unidade[] = ['g', 'kg', 'ml', 'l', 'un']
export const UNIDADES_RENDIMENTO: Unidade[] = ['kg', 'l', 'un']

export interface Ficha {
  id: string
  tipo: TipoFicha
  nome: string
  rendimento: number
  rendimento_unidade: Unidade
  porcoes: number
  perda_pct: number
  preco_venda: number | null
  meta_cmv: number
  tempo_preparo_min: number | null
  modo_preparo: string | null
  montagem: string | null
  conservacao: string | null
  utensilios: string | null
  foto_url: string | null
  precisa_revisao: boolean
  observacao_revisao: string | null
  ativo: boolean
  versao: number
  atualizado_em: string
}

export interface FichaItem {
  id: string
  ficha_id: string
  insumo_id: string | null
  sub_ficha_id: string | null
  quantidade: number
  unidade: Unidade
  grupo_escolha: string | null
  observacao: string | null
  ordem: number
}

/** item com o nome do insumo ou da preparação-base já resolvido */
export interface ItemView extends FichaItem {
  nome: string
}

/** linha de v_fichas_custo (só volta para quem tem ver_custos) */
export interface FichaCusto {
  id: string
  custo_unitario: number | null
  cmv_pct: number | null
  margem: number | null
  preco_sugerido: number | null
  pendencias: number
}

export interface Pendencia {
  item: string
  problema: string
}

/** cor do CMV: verde até a meta, âmbar até meta + 5 pontos, vermelho acima */
export function corCmv(cmv: number | null | undefined, meta: number) {
  if (cmv == null) return 'text-ink-soft'
  if (cmv <= meta) return 'text-ok'
  if (cmv <= meta + 5) return 'text-warn'
  return 'text-alert'
}

/** cada linha do texto é um passo; tira numeração que já venha digitada */
export function passos(texto: string | null) {
  return (texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*\d+[.)-]\s*/, '').trim())
    .filter(Boolean)
}

/** quanto a receita rende na unidade em que o seletor de porções trabalha */
export function baseRendimento(f: Pick<Ficha, 'tipo' | 'rendimento' | 'porcoes'>) {
  return f.tipo === 'preparacao' ? Number(f.rendimento) : Number(f.porcoes)
}
export function unidadeRendimento(f: Pick<Ficha, 'tipo' | 'rendimento_unidade'>) {
  return f.tipo === 'preparacao' ? f.rendimento_unidade : 'porções'
}

export interface FichaCompleta {
  ficha: Ficha
  itens: ItemView[]
  cardapios: { id: string; nome: string }[]
  pendencias: Pendencia[]
}

export async function carregarFicha(id: string): Promise<FichaCompleta> {
  const [f, it, fc, pend] = await Promise.all([
    db.from('fichas').select('*').eq('id', id).maybeSingle(),
    db.from('ficha_itens').select('*').eq('ficha_id', id).order('ordem'),
    db.from('ficha_cardapios').select('cardapio_id, cardapios(id, nome, ordem)').eq('ficha_id', id),
    db.from('v_itens_pendentes').select('item, problema').eq('ficha_id', id),
  ])
  if (f.error) throw new Error(f.error.message)
  if (!f.data) throw new Error('Ficha não encontrada.')
  if (it.error) throw new Error(it.error.message)

  const itens = (it.data ?? []) as FichaItem[]
  const idsInsumo = itens.map((i) => i.insumo_id).filter(Boolean)
  const idsSub = itens.map((i) => i.sub_ficha_id).filter(Boolean)
  const [ins, sub] = await Promise.all([
    idsInsumo.length ? db.from('insumos').select('id, nome').in('id', idsInsumo) : { data: [] },
    idsSub.length ? db.from('fichas').select('id, nome').in('id', idsSub) : { data: [] },
  ])
  const nomes = new Map<string, string>()
  for (const r of [...(ins.data ?? []), ...(sub.data ?? [])] as { id: string; nome: string }[])
    nomes.set(r.id, r.nome)

  const cardapios = ((fc.data ?? []) as { cardapios: { id: string; nome: string; ordem: number } | null }[])
    .map((r) => r.cardapios)
    .filter((c): c is { id: string; nome: string; ordem: number } => !!c)
    .sort((a, b) => a.ordem - b.ordem)

  return {
    ficha: f.data as Ficha,
    itens: itens.map((i) => ({ ...i, nome: nomes.get(i.insumo_id ?? i.sub_ficha_id ?? '') ?? '(item)' })),
    cardapios,
    pendencias: (pend.data ?? []) as Pendencia[],
  }
}

export function useFicha(id: string | undefined) {
  const [dados, setDados] = useState<FichaCompleta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  async function recarregar() {
    if (!id) return
    setCarregando(true)
    try {
      setDados(await carregarFicha(id))
      setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    }
    setCarregando(false)
  }
  useEffect(() => {
    recarregar()
  }, [id])

  return { dados, carregando, erro, recarregar }
}

/** custo e CMV vindos de v_fichas_custo; null quando o usuário não vê custos */
export async function carregarCusto(id: string): Promise<FichaCusto | null> {
  const { data } = await db
    .from('v_fichas_custo')
    .select('id, custo_unitario, cmv_pct, margem, preco_sugerido, pendencias')
    .eq('id', id)
    .maybeSingle()
  return (data as FichaCusto | null) ?? null
}

/**
 * Custo de cada linha via RPC custo_itens_ficha. Enquanto a função não existir
 * no banco (arquivo 4_custo_itens_ficha.sql), devolve null e a tela esconde a coluna.
 */
export async function carregarCustoItens(id: string): Promise<Map<string, number | null> | null> {
  const { data, error } = await db.rpc('custo_itens_ficha', { p_ficha: id })
  if (error) return null
  return new Map(((data ?? []) as { item_id: string; custo: number | null }[]).map((r) => [r.item_id, r.custo]))
}
