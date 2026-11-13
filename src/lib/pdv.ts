import { useEffect, useRef } from 'react'
import { supabase } from './supabase'


export type Destino = 'caixa' | 'bar' | 'cozinha'
export const DESTINOS: Destino[] = ['cozinha', 'bar', 'caixa']
export const FORMAS = [
  { v: 'dinheiro', r: 'Dinheiro' },
  { v: 'credito', r: 'Crédito' },
  { v: 'debito', r: 'Débito' },
  { v: 'pix', r: 'Pix' },
  { v: 'voucher', r: 'Voucher' },
  { v: 'outros', r: 'Outros' },
] as const
const EXTRAS: Record<string, string> = { folha: 'Folha', a_receber: 'A receber', cortesia: 'Consumo interno' }
export const rotuloForma = (v: string) => FORMAS.find((f) => f.v === v)?.r ?? EXTRAS[v] ?? v

export interface Sala { id: string; nome: string; ordem: number; ativo: boolean }
/** Tamanho fixo por formato: toda mesa de um mesmo formato fica idêntica em qualquer tela */
export const TAM_FORMA = { quadrada: { w: 100, h: 100 }, redonda: { w: 100, h: 100 }, retangular: { w: 170, h: 100 } } as const
export const dimMesa = (m: { forma: keyof typeof TAM_FORMA }) => TAM_FORMA[m.forma] ?? TAM_FORMA.quadrada

export interface Mesa {
  id: string; sala_id: string | null; numero: string; capacidade: number
  forma: 'quadrada' | 'redonda' | 'retangular'
  pos_x: number; pos_y: number; largura: number; altura: number; qr_token: string; ativo: boolean
}
export interface Faixa { dia: number; inicio: string; fim: string }
export interface Horario { horarios: Faixa[] | null }
export interface Categoria extends Horario { id: string; nome: string; ordem: number; destino_padrao: Destino; ativo: boolean; visivel_tablet: boolean }
export interface Produto extends Horario {
  visivel_tablet: boolean; foto_url?: string | null;
  id: string; categoria_id: string | null; ficha_id: string | null; codigo: string | null; nome: string
  descricao: string | null; preco: number; destino: Destino; ativo: boolean; disponivel: boolean; ordem: number
  ncm: string | null; cest: string | null; cfop: string | null; unidade: string | null; origem: number | null
  csosn: string | null; cst_icms: string | null; aliquota_icms: number | null; cst_pis: string | null; cst_cofins: string | null
}
export interface Comanda {
  id: string; numero: number; mesa_id: string | null; nome_cliente: string | null; telefone: string | null
  pessoas: number; origem: string; status: 'aberta' | 'pedindo_conta' | 'fechada' | 'cancelada'
  aberta_em: string; fechada_em: string | null; taxa_servico_pct: number; desconto: number; desconto_detalhe?: unknown
  cpf_cnpj_nota: string | null; sessao_id: string | null; observacao: string | null; funcionario_id?: string | null
}
export interface Item {
  id: string; comanda_id: string; produto_id: string | null; nome: string; qtd: number; preco_unit: number
  obs: string | null; destino: Destino; origem: string
  status: 'enviado' | 'preparando' | 'pronto' | 'entregue' | 'cancelado'; criado_em: string
  tipo: 'produto' | 'couvert' | 'rodizio'
  opcoes?: { id?: string; nome: string; preco: number }[]
}
export interface Totais { comanda_id: string; subtotal: number; servico: number; total: number; pago: number }
export interface Impressora {
  id: string; nome: string; funcao: Destino; ip: string | null; porta: number; colunas: number
  codepage: string; corta_papel: boolean; via_extra: number; ativo: boolean; ultimo_ok: string | null
}
export interface Sessao {
  id: string; caixa: string; status: 'aberto' | 'fechado'; aberto_por: string | null; aberto_em: string
  fundo_inicial: number; fechado_em: string | null; contado: Record<string, number> | null; observacao: string | null
}

export const num = (v: unknown) => Number(v ?? 0)
export const hora = (v: string) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
export function minutosDesde(v: string) { return Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 60000)) }
export const soDigitos = (s: string) => s.replace(/\D/g, '')

/** Reexecuta `cb` quando uma das tabelas do PDV muda (Realtime) e a cada `cada` ms como reserva. */
export function useAoVivo(tabelas: string[], cb: () => void, cada = 15000) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => {
    const canal = supabase.channel('pdv-' + tabelas.join('-') + Math.random().toString(36).slice(2))
    tabelas.forEach((t) =>
      canal.on('postgres_changes', { event: '*', schema: 'checklist', table: t }, () => ref.current())
    )
    canal.subscribe()
    ref.current() // carga inicial (o Realtime só avisa de mudanças)
    const iv = setInterval(() => ref.current(), cada)
    return () => {
      clearInterval(iv)
      supabase.removeChannel(canal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabelas.join(',')])
}

/** Enfileira uma impressão (conta, fechamento de caixa, teste) na impressora de uma função. */
export async function enfileirar(
  db: any,
  funcao: Destino,
  tipo: 'conta' | 'fechamento_caixa' | 'teste' | 'cupom',
  conteudo: Record<string, unknown>,
  comandaId?: string
) {
  const { data: imp } = await db.from('pdv_impressoras').select('id').eq('funcao', funcao).eq('ativo', true).limit(1)
  if (!imp?.length) return { erro: `Nenhuma impressora ativa para "${funcao}". Cadastre em PDV · Configurações.` }
  const { error } = await db
    .from('pdv_fila_impressao')
    .insert({ impressora_id: imp[0].id, tipo, conteudo, comanda_id: comandaId ?? null })
  return { erro: error?.message }
}

/** Sem faixas = sempre visível; com faixas = só dentro de alguma. Faixa com fim < início vira a madrugada do dia seguinte. */
export function noHorarios(h: Faixa[] | null | undefined, d = new Date()) {
  if (!h?.length) return true
  const min = d.getHours() * 60 + d.getMinutes(), hoje = d.getDay(), ontem = (hoje + 6) % 7
  const m = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5))
  return h.some((f) => { const a = m(f.inicio), b = m(f.fim); return a <= b ? f.dia === hoje && min >= a && min < b : (f.dia === hoje && min >= a) || (f.dia === ontem && min < b) })
}

/**
 * Comandas de consumo interno (família/casa) que NÃO entram no faturamento: as encerradas como "consumo interno" (cortesia)
 * e as que usaram uma regra de desconto marcada "fora do faturamento". O consumo de funcionário já sai pelo funcionario_id.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function idsConsumoInterno(db: any, comandas: { id: string; desconto_detalhe?: unknown }[]): Promise<Set<string>> {
  const fora = new Set<string>()
  if (!comandas.length) return fora
  const [pg, rg] = await Promise.all([
    db.from('pdv_pagamentos').select('comanda_id').in('comanda_id', comandas.map((c) => c.id)).eq('forma', 'cortesia').eq('estornado', false),
    db.from('pdv_descontos_regras').select('id').eq('fora_faturamento', true),
  ])
  ;((pg.data ?? []) as { comanda_id: string }[]).forEach((p) => fora.add(p.comanda_id))
  const regras = new Set(((rg.data ?? []) as { id: string }[]).map((r) => r.id))
  comandas.forEach((c) => { const rid = (c.desconto_detalhe as { regra_id?: string | null } | null)?.regra_id; if (rid && regras.has(rid)) fora.add(c.id) })
  return fora
}
