import { db } from './supabase'
import { numero } from './formato'
import { Area, ChecklistItem, ChecklistTemplate, Profile } from './types'

/**
 * Relatório de estoque a partir dos checklists de contagem (modelos com
 * contagem_estoque). A fonte é checklist_respostas: quantidade = contagem do
 * dia e entrada = o que entrou desde a contagem anterior, as duas já na
 * unidade de contagem do item (a mesma do checklist). fator_contagem só
 * converte da unidade do insumo (estoque_entradas), que aqui não é usada.
 */

const PAGINA = 1000

/** lê de 1000 em 1000 até acabar */
async function paginar<T>(
  montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const todos: T[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await montar(de, de + PAGINA - 1)
    if (error) throw error
    const lote = (data ?? []) as T[]
    todos.push(...lote)
    if (lote.length < PAGINA) return todos
  }
}

export interface Base {
  modelos: ChecklistTemplate[]
  areas: Record<string, Area>
  pessoas: Record<string, string>
  itens: ChecklistItem[]
}

/** modelos de contagem das áreas que a pessoa acessa, com áreas, nomes e itens */
export async function carregarBase(podeAcessarArea: (id: string) => boolean): Promise<Base> {
  const [t, a, p] = await Promise.all([
    db.from('checklist_templates').select('*').eq('contagem_estoque', true).order('nome'),
    db.from('areas').select('*').order('nome'),
    db.from('profiles').select('id,nome'),
  ])
  if (t.error) throw t.error
  const modelos = ((t.data ?? []) as ChecklistTemplate[]).filter((m) => podeAcessarArea(m.area_id))
  const itens = modelos.length
    ? await paginar<ChecklistItem>((de, ate) =>
        db
          .from('checklist_items')
          .select('*')
          .in('template_id', modelos.map((m) => m.id))
          .order('ordem')
          .order('id')
          .range(de, ate)
      )
    : []
  return {
    modelos,
    areas: Object.fromEntries(((a.data ?? []) as Area[]).map((x) => [x.id, x])),
    pessoas: Object.fromEntries(((p.data ?? []) as Pick<Profile, 'id' | 'nome'>[]).map((x) => [x.id, x.nome])),
    itens,
  }
}

export interface Lancamento {
  data: string
  /** contagem do dia; null = só entrada */
  contagem: number | null
  entrada: number
  concluida: boolean
  quem: string | null
}

/** histórico por item (ordem de data), até a data final: uma consulta paginada */
export async function carregarLancamentos(base: Base, ate: string): Promise<Record<string, Lancamento[]>> {
  if (!base.modelos.length) return {}
  const linhas = await paginar<{
    item_id: string
    quantidade: number | null
    entrada: number | null
    valor: string | null
    atualizado_por: string | null
    checklist_execucoes: { data: string; status: string; preenchido_por: string | null }
  }>((de, fim) =>
    db
      .from('checklist_respostas')
      .select('id,item_id,quantidade,entrada,valor,atualizado_por,checklist_execucoes!inner(data,status,preenchido_por)')
      .in('checklist_execucoes.template_id', base.modelos.map((m) => m.id))
      .lte('checklist_execucoes.data', ate)
      .order('id')
      .range(de, fim)
  )
  const itemPorId = Object.fromEntries(base.itens.map((i) => [i.id, i]))
  const series: Record<string, Lancamento[]> = {}
  for (const r of linhas) {
    const item = itemPorId[r.item_id]
    if (!item) continue
    let contagem = r.quantidade != null ? Number(r.quantidade) : null
    // item do tipo "quantidade" guarda a contagem em valor
    if (contagem == null && item.tipo_campo === 'quantidade' && r.valor != null && r.valor !== '') {
      const n = Number(r.valor)
      contagem = Number.isFinite(n) ? n : null
    }
    const entrada = Number(r.entrada ?? 0)
    if (contagem == null && !entrada) continue
    const e = r.checklist_execucoes
    ;(series[r.item_id] ??= []).push({
      data: e.data,
      contagem,
      entrada,
      concluida: e.status === 'concluido',
      quem: r.atualizado_por ?? e.preenchido_por,
    })
  }
  for (const s of Object.values(series)) s.sort((a, b) => a.data.localeCompare(b.data))
  return series
}

// ---------- visões ----------

export interface LinhaRel {
  celulas: string[]
  /** aviso = passou do prazo; alerta = abaixo do mínimo; suave = sem dado */
  tom?: 'aviso' | 'alerta' | 'suave'
  naoConcluida?: boolean
}
export interface Secao {
  titulo: string
  colunas: string[]
  linhas: LinhaRel[]
}

export const SEM_REF = 'sem referência'
export const DIAS_LIMITE = 7

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const qtd = (n: number, item: ChecklistItem) => `${numero(n)}${item.unidade ? ' ' + item.unidade : ''}`
const sinal = (n: number, item: ChecklistItem) => {
  const r = Math.round(n * 1000) / 1000
  return (r > 0 ? '+' : r < 0 ? '−' : '') + qtd(Math.abs(r), item)
}
const nomePessoa = (base: Base, id: string | null) => (id ? (base.pessoas[id] ?? '—') : '—')

/** última contagem com data ≤ ate (ou < ate, se estrito) */
function ultimaContagem(serie: Lancamento[] | undefined, ate: string, estrito = false) {
  if (!serie) return null
  for (let i = serie.length - 1; i >= 0; i--) {
    const l = serie[i]
    if (l.contagem != null && (estrito ? l.data < ate : l.data <= ate)) return l
  }
  return null
}
/** soma das entradas com data em (depois, ate] */
function entradasEntre(serie: Lancamento[], depois: string, ate: string) {
  return serie.reduce((s, l) => (l.data > depois && l.data <= ate ? s + l.entrada : s), 0)
}

/** filtro de área/modelo: '' = tudo, 'a:<área>', 't:<modelo>' */
export function modelosFiltrados(base: Base, filtro: string) {
  if (filtro.startsWith('a:')) return base.modelos.filter((m) => m.area_id === filtro.slice(2))
  if (filtro.startsWith('t:')) return base.modelos.filter((m) => m.id === filtro.slice(2))
  return base.modelos
}
const tituloModelo = (base: Base, m: ChecklistTemplate) => `${base.areas[m.area_id]?.nome ?? '—'} · ${m.nome}`
const itensDe = (base: Base, m: ChecklistTemplate) => base.itens.filter((i) => i.template_id === m.id)

export function visaoPorDia(base: Base, series: Record<string, Lancamento[]>, modelos: ChecklistTemplate[], dia: string): Secao[] {
  return modelos.map((m) => ({
    titulo: tituloModelo(base, m),
    colunas: ['Item', 'Contagem do dia', 'Contagem anterior', 'Variação', 'Quem preencheu'],
    linhas: itensDe(base, m).map((item) => {
      const s = series[item.id]
      const hoje = s?.find((l) => l.data === dia && l.contagem != null)
      const antes = ultimaContagem(s, dia, true)
      return {
        celulas: [
          item.nome_campo,
          hoje ? qtd(hoje.contagem!, item) : 'não contado',
          antes ? `${qtd(antes.contagem!, item)} (${dm(antes.data)})` : SEM_REF,
          hoje && antes ? sinal(hoje.contagem! - antes.contagem!, item) : '—',
          hoje ? nomePessoa(base, hoje.quem) : '—',
        ],
        tom: hoje ? undefined : 'suave',
        naoConcluida: hoje ? !hoje.concluida : false,
      }
    }),
  }))
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export const MAX_ITENS_BUSCA = 12

/** itens cujo nome contém a busca, nos modelos filtrados */
export function itensDaBusca(base: Base, modelos: ChecklistTemplate[], busca: string) {
  const b = semAcento(busca.trim())
  if (!b) return []
  const ids = new Set(modelos.map((m) => m.id))
  return base.itens.filter((i) => ids.has(i.template_id) && semAcento(i.nome_campo).includes(b))
}

export function visaoPorItem(
  base: Base,
  series: Record<string, Lancamento[]>,
  itens: ChecklistItem[],
  inicio: string,
  fim: string
): Secao[] {
  const modeloPorId = Object.fromEntries(base.modelos.map((m) => [m.id, m]))
  return itens.slice(0, MAX_ITENS_BUSCA).map((item) => {
    const s = series[item.id] ?? []
    return {
      titulo: `${item.nome_campo} · ${tituloModelo(base, modeloPorId[item.template_id])}`,
      colunas: ['Data', 'Contagem', 'Entrada', 'Consumo aparente', 'Quem preencheu'],
      linhas: s
        .filter((l) => l.data >= inicio && l.data <= fim)
        .map((l) => {
          let consumo = '—'
          if (l.contagem != null) {
            const antes = ultimaContagem(s, l.data, true)
            consumo = antes
              ? qtd(antes.contagem! + entradasEntre(s, antes.data, l.data) - l.contagem, item)
              : SEM_REF
          }
          return {
            celulas: [
              dm(l.data) + '/' + l.data.slice(0, 4),
              l.contagem != null ? qtd(l.contagem, item) : '—',
              l.entrada ? qtd(l.entrada, item) : '—',
              consumo,
              nomePessoa(base, l.quem),
            ],
            naoConcluida: !l.concluida,
          }
        }),
    }
  })
}

/**
 * Consumo aparente no período: contagem de referência (a última até a data
 * inicial; sem ela, a primeira do período) + entradas desde então − última
 * contagem até a data final. Sem vendas.
 */
export function visaoConsumo(
  base: Base,
  series: Record<string, Lancamento[]>,
  modelos: ChecklistTemplate[],
  inicio: string,
  fim: string
): Secao[] {
  return modelos.map((m) => ({
    titulo: tituloModelo(base, m),
    colunas: ['Item', 'Contagem anterior', 'Entradas', 'Contagem atual', 'Consumo aparente'],
    linhas: itensDe(base, m).map((item): LinhaRel => {
      const s = series[item.id] ?? []
      const ini =
        ultimaContagem(s, inicio) ?? s.find((l) => l.contagem != null && l.data >= inicio && l.data <= fim) ?? null
      const fin = ultimaContagem(s, fim)
      if (!ini || !fin || fin.data <= ini.data) {
        return {
          celulas: [
            item.nome_campo,
            ini ? `${qtd(ini.contagem!, item)} (${dm(ini.data)})` : SEM_REF,
            '—',
            fin && ini && fin.data > ini.data ? `${qtd(fin.contagem!, item)} (${dm(fin.data)})` : 'sem contagem nova',
            SEM_REF,
          ],
          tom: 'suave',
        }
      }
      const ent = entradasEntre(s, ini.data, fin.data)
      return {
        celulas: [
          item.nome_campo,
          `${qtd(ini.contagem!, item)} (${dm(ini.data)})`,
          ent ? qtd(ent, item) : '—',
          `${qtd(fin.contagem!, item)} (${dm(fin.data)})`,
          qtd(ini.contagem! + ent - fin.contagem!, item),
        ],
        naoConcluida: !ini.concluida || !fin.concluida,
      }
    }),
  }))
}

/** dias entre duas datas AAAA-MM-DD */
function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(ate + 'T12:00:00') - Date.parse(de + 'T12:00:00')) / 86400000)
}

export function visaoUltima(
  base: Base,
  series: Record<string, Lancamento[]>,
  modelos: ChecklistTemplate[],
  ate: string
): Secao[] {
  const linha = (nome: string, ultima: Lancamento | null): LinhaRel => {
    if (!ultima) return { celulas: [nome, 'nunca contado', '—'], tom: 'aviso' }
    const dias = diasEntre(ultima.data, ate)
    return {
      celulas: [nome, dm(ultima.data) + '/' + ultima.data.slice(0, 4), String(dias)],
      tom: dias > DIAS_LIMITE ? 'aviso' : undefined,
      naoConcluida: !ultima.concluida,
    }
  }
  // por área: a contagem mais recente entre os itens da área
  const areaIds = [...new Set(modelos.map((m) => m.area_id))]
  const porArea: Secao = {
    titulo: 'Por área',
    colunas: ['Área', 'Última contagem', 'Dias sem contar'],
    linhas: areaIds.map((a) => {
      let ultima: Lancamento | null = null
      for (const m of modelos.filter((x) => x.area_id === a))
        for (const item of itensDe(base, m)) {
          const u = ultimaContagem(series[item.id], ate)
          if (u && (!ultima || u.data > ultima.data)) ultima = u
        }
      return linha(base.areas[a]?.nome ?? '—', ultima)
    }),
  }
  return [
    porArea,
    ...modelos.map((m) => ({
      titulo: tituloModelo(base, m),
      colunas: ['Item', 'Última contagem', 'Dias sem contar'],
      linhas: itensDe(base, m).map((item) => linha(item.nome_campo, ultimaContagem(series[item.id], ate))),
    })),
  ]
}

export function visaoAbaixo(
  base: Base,
  series: Record<string, Lancamento[]>,
  modelos: ChecklistTemplate[],
  ate: string
): Secao[] {
  return modelos.map((m) => ({
    titulo: tituloModelo(base, m),
    colunas: ['Item', 'Contagem atual', 'Mínimo', 'Falta'],
    linhas: itensDe(base, m).flatMap((item): LinhaRel[] => {
      if (item.estoque_minimo == null) return []
      const min = Number(item.estoque_minimo)
      const u = ultimaContagem(series[item.id], ate)
      if (!u || u.contagem! >= min) return []
      return [
        {
          celulas: [item.nome_campo, `${qtd(u.contagem!, item)} (${dm(u.data)})`, qtd(min, item), qtd(min - u.contagem!, item)],
          tom: 'alerta',
          naoConcluida: !u.concluida,
        },
      ]
    }),
  }))
}
