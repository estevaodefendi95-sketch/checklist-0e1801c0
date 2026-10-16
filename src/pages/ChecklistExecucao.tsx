import { useEffect, useState } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { db } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  ChecklistTemplate,
  ChecklistItem,
  ChecklistExecucao as Execucao,
  ChecklistResposta,
  Aprovacao,
  Profile,
} from '../lib/types'
import { dataReferencia } from '../lib/periodo'

function abaixoDoMinimo(item: ChecklistItem, valor?: string | null) {
  return (
    item.tipo_campo === 'quantidade' &&
    item.estoque_minimo != null &&
    valor != null &&
    valor !== '' &&
    Number(valor) < Number(item.estoque_minimo)
  )
}

/**
 * Referência de estoque de um item, na unidade de contagem do item: a última
 * contagem (data da execução e horário da resposta) e as entradas lançadas
 * depois desse horário, até ontem. A entrada de hoje vem do próprio checklist.
 */
interface Referencia {
  qtd: number
  data: string
  horario: number
  entradas: number
}

const numBR = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const ms = (iso: string) => new Date(iso).getTime()

/**
 * Referências dos itens de um checklist de contagem. Uma consulta às respostas
 * das execuções concluídas do modelo e, só se houver item ligado a insumo, uma
 * a estoque_entradas. Não considera vendas (módulo ainda inativo).
 */
async function buscarReferencias(
  templateId: string,
  antesDe: string,
  itens: ChecklistItem[]
): Promise<Record<string, Referencia>> {
  const r = await db
    .from('checklist_respostas')
    .select('item_id,quantidade,entrada,updated_at,checklist_execucoes!inner(data)')
    .eq('checklist_execucoes.template_id', templateId)
    .eq('checklist_execucoes.status', 'concluido')
    .lt('checklist_execucoes.data', antesDe)
    .or('quantidade.not.is.null,entrada.not.is.null')
    .order('updated_at', { ascending: false })
    .limit(1000)
  if (r.error) throw r.error
  const linhas = (r.data ?? []) as unknown as {
    item_id: string
    quantidade: number | null
    entrada: number | null
    updated_at: string
    checklist_execucoes: { data: string }
  }[]

  const refs: Record<string, Referencia> = {}
  // da mais recente para a mais antiga: a primeira com quantidade é a última contagem
  for (const x of linhas) {
    if (x.quantidade == null || refs[x.item_id]) continue
    refs[x.item_id] = {
      qtd: Number(x.quantidade),
      data: x.checklist_execucoes.data,
      horario: ms(x.updated_at),
      entradas: 0,
    }
  }
  // entradas lançadas depois do horário da contagem (a do mesmo horário não entra)
  for (const x of linhas) {
    const ref = refs[x.item_id]
    if (ref && x.entrada != null && ms(x.updated_at) > ref.horario) ref.entradas += Number(x.entrada)
  }

  const ligados = itens.filter((i) => i.insumo_id && refs[i.id])
  if (ligados.length) {
    const desde = Math.min(...ligados.map((i) => refs[i.id].horario))
    const e = await db
      .from('estoque_entradas')
      .select('insumo_id,quantidade,criado_em')
      .in('insumo_id', [...new Set(ligados.map((i) => i.insumo_id))])
      .gt('criado_em', new Date(desde).toISOString())
      .limit(1000)
    if (e.error) throw e.error
    const entradas = (e.data ?? []) as { insumo_id: string; quantidade: number; criado_em: string }[]
    for (const item of ligados) {
      const ref = refs[item.id]
      const fator = Number(item.fator_contagem) || 1
      for (const x of entradas)
        if (x.insumo_id === item.insumo_id && ms(x.criado_em) > ref.horario) ref.entradas += Number(x.quantidade) / fator
    }
  }
  return refs
}

export function ChecklistExecucao() {
  const { templateId } = useParams()
  const { profile, podeAcessarArea, podeEditar } = useAuth()

  const [template, setTemplate] = useState<ChecklistTemplate | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [execucao, setExecucao] = useState<Execucao | null>(null)
  const [respostas, setRespostas] = useState<Record<string, ChecklistResposta>>({})
  const [aprovacao, setAprovacao] = useState<Aprovacao | null>(null)
  const [aprovadorNome, setAprovadorNome] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // referência de estoque por item (só checklists de contagem); undefined = carregando
  const [refs, setRefs] = useState<Record<string, Referencia> | undefined>(undefined)
  const [refsErro, setRefsErro] = useState(false)

  useEffect(() => {
    load()
  }, [templateId])

  async function load() {
    if (!templateId) return
    setLoading(true)

    const { data: tpl } = await db
      .from('checklist_templates')
      .select('*')
      .eq('id', templateId)
      .single()
    if (!tpl) {
      setLoading(false)
      return
    }
    setTemplate(tpl)
    const hoje = dataReferencia(tpl.frequencia)

    const { data: its } = await db
      .from('checklist_items')
      .select('*')
      .eq('template_id', templateId)
      .order('ordem')
    setItems(its ?? [])

    // não segura o checklist: o histórico chega depois
    if (tpl.contagem_estoque) {
      setRefs(undefined)
      setRefsErro(false)
      buscarReferencias(tpl.id, hoje, ((its ?? []) as ChecklistItem[]).filter((i) => i.tipo_campo === 'checkbox'))
        .then(setRefs)
        .catch(() => setRefsErro(true))
    }

    let { data: exec } = await db
      .from('checklist_execucoes')
      .select('*')
      .eq('template_id', templateId)
      .eq('data', hoje)
      .maybeSingle()

    // cria a execução do dia se ainda não existir e o usuário pode editar
    if (!exec && podeEditar() && podeAcessarArea(tpl.area_id) && profile) {
      const { data: novo } = await db
        .from('checklist_execucoes')
        .insert({
          template_id: tpl.id,
          area_id: tpl.area_id,
          tipo: tpl.tipo,
          data: hoje,
          preenchido_por: profile.id,
        })
        .select()
        .single()
      exec = novo
    }
    setExecucao(exec ?? null)

    if (exec) {
      const { data: resps } = await db
        .from('checklist_respostas')
        .select('*')
        .eq('execucao_id', exec.id)
      const map: Record<string, ChecklistResposta> = {}
      for (const r of resps ?? []) map[r.item_id] = r
      setRespostas(map)

      const { data: apr } = await db
        .from('aprovacoes')
        .select('*')
        .eq('execucao_id', exec.id)
        .maybeSingle()
      setAprovacao(apr ?? null)
    }

    const { data: profs } = await db.from('profiles').select('*')
    setProfiles(profs ?? [])

    setLoading(false)
  }

  useEffect(() => {
    if (aprovacao) {
      const p = profiles.find((p) => p.id === aprovacao.aprovado_por)
      setAprovadorNome(p?.nome ?? null)
    }
  }, [aprovacao, profiles])

  async function salvarResposta(item: ChecklistItem, valor: string) {
    if (!execucao) return
    setSaving(true)
    const { data } = await db
      .from('checklist_respostas')
      .upsert(
        {
          execucao_id: execucao.id,
          item_id: item.id,
          valor,
          updated_at: new Date().toISOString(),
          atualizado_por: profile?.id,
        },
        { onConflict: 'execucao_id,item_id' }
      )
      .select()
      .single()
    if (data) setRespostas((prev) => ({ ...prev, [item.id]: data }))
    setSaving(false)
  }

  async function salvarEstoque(item: ChecklistItem, campo: 'quantidade' | 'entrada', texto: string) {
    if (!execucao) return
    const valor = texto.trim() === '' ? null : Number(texto)
    setSaving(true)
    const { data } = await db
      .from('checklist_respostas')
      .upsert(
        {
          execucao_id: execucao.id,
          item_id: item.id,
          [campo]: valor,
          updated_at: new Date().toISOString(),
          atualizado_por: profile?.id,
        },
        { onConflict: 'execucao_id,item_id' }
      )
      .select()
      .single()
    if (data) setRespostas((prev) => ({ ...prev, [item.id]: data }))
    setSaving(false)
  }

  async function concluirChecklist() {
    if (!execucao) return
    await db
      .from('checklist_execucoes')
      .update({ status: 'concluido', horario_fim: new Date().toISOString() })
      .eq('id', execucao.id)
    setExecucao({ ...execucao, status: 'concluido', horario_fim: new Date().toISOString() })
  }

  async function aprovar() {
    if (!execucao || !profile) return
    const { data } = await db
      .from('aprovacoes')
      .insert({
        execucao_id: execucao.id,
        aprovado_por: profile.id,
        role_no_momento: profile.role,
      })
      .select()
      .single()
    if (data) setAprovacao(data)
  }

  if (loading) return <p className="text-sm text-ink-soft">Carregando…</p>
  if (!template) return <p className="text-sm text-ink-soft">Modelo não encontrado.</p>
  if (!podeAcessarArea(template.area_id)) return <Navigate to="/" replace />

  const somenteLeitura = !podeEditar() || execucao?.status === 'concluido'
  const todosPreenchidos = items
    .filter((i) => i.obrigatorio)
    .every((i) => respostas[i.id]?.valor)
  const semanal = template.frequencia === 'semanal'
  const paraRepor = items.filter((i) => abaixoDoMinimo(i, respostas[i.id]?.valor))

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/" className="-ml-2 mb-1 inline-flex min-h-[44px] items-center rounded-[10px] px-2 text-sm text-ink-soft hover:text-ink">
        ← voltar
      </Link>
      <h1 className="titulo capitalize">{template.tipo}</h1>
      <p className="mb-1 text-xs text-ink-soft/70">
        {semanal
          ? `semana de ${format(new Date(dataReferencia('semanal') + 'T00:00:00'), 'dd/MM/yyyy')}`
          : format(new Date(), 'dd/MM/yyyy')}
        {execucao && (
          <>
            {' · '}
            {profiles.find((p) => p.id === execucao.preenchido_por)?.nome ?? '—'}
            {' às '}
            {format(new Date(execucao.horario_inicio), 'HH:mm')}
          </>
        )}
      </p>
      {execucao?.status === 'concluido' && (
        <p className="mb-4 inline-block rounded bg-ok-soft px-2 py-0.5 text-xs text-ok">
          concluído{execucao.horario_fim && ' às ' + format(new Date(execucao.horario_fim), 'HH:mm')}
        </p>
      )}

      {paraRepor.length > 0 && (
        <div className="mt-4 rounded border border-alert-soft bg-alert-soft p-3 text-sm text-alert">
          <p className="mb-1 font-medium">para repor ({paraRepor.length})</p>
          <ul className="space-y-0.5 text-xs">
            {paraRepor.map((i) => (
              <li key={i.id}>
                {i.nome_campo}: {respostas[i.id]?.valor}
                {i.unidade ? ' ' + i.unidade : ''} ({textoMinimo(i)})
              </li>
            ))}
          </ul>
        </div>
      )}

      {refsErro && (
        <p className="mt-4 text-xs text-ink-soft" role="status">
          Não foi possível carregar a referência de estoque. O checklist funciona normalmente.
        </p>
      )}
      {template.contagem_estoque && !refsErro && (
        <p className="mt-4 text-[11px] text-ink-soft/70">referência estimada, sem vendas</p>
      )}

      <div className={`${template.contagem_estoque ? 'mt-1' : 'mt-4'} divide-y divide-line rounded border border-line`}>
        {items.map((item) => (
          <ItemCampo
            key={item.id}
            item={item}
            resposta={respostas[item.id]}
            somenteLeitura={somenteLeitura}
            onSalvar={(valor) => salvarResposta(item, valor)}
            contagem={!!template.contagem_estoque && item.tipo_campo !== 'quantidade'}
            onSalvarEstoque={(campo, v) => salvarEstoque(item, campo, v)}
            referencia={
              template.contagem_estoque && item.tipo_campo === 'checkbox' && !refsErro
                ? refs === undefined
                  ? undefined
                  : (refs[item.id] ?? null)
                : false
            }
            nomeAutor={
              profiles.find((p) => p.id === respostas[item.id]?.atualizado_por)?.nome
            }
          />
        ))}
        {items.length === 0 && (
          <p className="p-4 text-sm text-ink-soft">
            Nenhum item cadastrado nesse modelo ainda.
          </p>
        )}
      </div>

      {!somenteLeitura && execucao && (
        <button
          onClick={concluirChecklist}
          disabled={!todosPreenchidos || saving}
          className="mt-4 w-full rounded bg-ink py-2 text-sm font-medium text-paper disabled:opacity-40"
        >
          {todosPreenchidos ? 'concluir checklist' : 'preencha os itens obrigatórios'}
        </button>
      )}

      <div className="mt-6 rounded border border-line bg-paper-dim/40 p-4">
        <h3 className="mb-2 text-sm font-medium">aprovação</h3>
        {aprovacao ? (
          <p className="text-sm text-ok">
            aprovado por {aprovadorNome ?? '—'} ({aprovacao.role_no_momento}) às{' '}
            {format(new Date(aprovacao.horario_aprovacao), 'HH:mm')}
          </p>
        ) : execucao?.status === 'concluido' && podeEditar() ? (
          <button
            onClick={aprovar}
            className="rounded border border-ok px-3 py-1.5 text-sm text-ok hover:bg-ok-soft"
          >
            aprovar checklist
          </button>
        ) : (
          <p className="text-sm text-ink-soft">
            {execucao?.status === 'concluido'
              ? 'aguardando aprovação'
              : 'disponível após concluir o checklist'}
          </p>
        )}
      </div>
    </div>
  )
}

function textoMinimo(item: ChecklistItem) {
  return `mín. ${item.estoque_minimo}${item.unidade ? ' ' + item.unidade : ''}`
}

function ItemCampo({
  item,
  resposta,
  somenteLeitura,
  onSalvar,
  nomeAutor,
  contagem,
  onSalvarEstoque,
  referencia,
}: {
  contagem?: boolean
  /** referência de estoque: objeto, null = sem contagem anterior, undefined = carregando, false = não mostrar */
  referencia?: Referencia | null | false
  onSalvarEstoque?: (campo: 'quantidade' | 'entrada', valor: string) => void
  item: ChecklistItem
  resposta?: ChecklistResposta
  somenteLeitura: boolean
  onSalvar: (valor: string) => void
  nomeAutor?: string
}) {
  const [texto, setTexto] = useState(resposta?.valor ?? '')
  const [qtd, setQtd] = useState(resposta?.valor ?? '')

  useEffect(() => {
    setTexto(resposta?.valor ?? '')
    setQtd(resposta?.valor ?? '')
  }, [resposta?.valor])

  const [contQtd, setContQtd] = useState('')
  const [contEnt, setContEnt] = useState('')
  useEffect(() => {
    setContQtd(resposta?.quantidade != null ? String(resposta.quantidade) : '')
  }, [resposta?.quantidade])
  useEffect(() => {
    setContEnt(resposta?.entrada != null ? String(resposta.entrada) : '')
  }, [resposta?.entrada])

  const abaixo = abaixoDoMinimo(item, qtd)

  // estimado = última contagem + entradas desde então + entrada digitada hoje
  const num = (t: string) => (t.trim() === '' ? NaN : Number(t))
  const entHoje = num(contEnt)
  const estimado = referencia
    ? referencia.qtd + referencia.entradas + (Number.isFinite(entHoje) ? entHoje : 0)
    : null
  const contado = num(contQtd)
  const dif =
    estimado != null && Number.isFinite(contado) ? Math.round((contado - estimado) * 1000) / 1000 : 0
  const mostrarRef = contagem && referencia !== false

  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 sm:flex-1">
        <span className="text-sm break-words">
          {item.nome_campo}
          {item.obrigatorio && <span className="text-alert"> *</span>}
        </span>
        {item.tipo_campo === 'quantidade' && item.estoque_minimo != null && (
          <p className={`text-[11px] ${abaixo ? 'text-alert' : 'text-ink-soft/70'}`}>
            {abaixo ? `abaixo do mínimo · ${textoMinimo(item)}` : textoMinimo(item)}
          </p>
        )}
        {nomeAutor && resposta?.updated_at && (
          <p className="text-[11px] text-ink-soft/60">
            {nomeAutor} às {format(new Date(resposta.updated_at), 'HH:mm')}
          </p>
        )}
      </div>

      {item.tipo_campo === 'checkbox' && (
        <input
          type="checkbox"
          checked={resposta?.valor === 'true'}
          disabled={somenteLeitura}
          onChange={(e) => onSalvar(e.target.checked ? 'true' : 'false')}
          className="h-6 w-6 shrink-0 accent-ok"
        />
      )}

      {item.tipo_campo === 'sim_nao' && (
        <div className="flex shrink-0 gap-2 text-sm">
          {['sim', 'não'].map((opt) => (
            <button
              key={opt}
              disabled={somenteLeitura}
              onClick={() => onSalvar(resposta?.valor === opt ? '' : opt)}
              className={`rounded border px-3 py-1.5 ${
                resposta?.valor === opt
                  ? 'border-ok bg-ok-soft text-ok'
                  : 'border-line text-ink-soft'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      {item.tipo_campo === 'quantidade' && (
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            disabled={somenteLeitura}
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            onBlur={() => onSalvar(qtd)}
            className={`w-full rounded border bg-paper px-2 py-1.5 text-right text-sm outline-none sm:w-20 ${
              abaixo ? 'border-alert text-alert' : 'border-line focus:border-ink'
            }`}
          />
          {item.unidade && <span className="text-xs text-ink-soft">{item.unidade}</span>}
        </div>
      )}

      {item.tipo_campo === 'texto' && (
        <input
          type="text"
          disabled={somenteLeitura}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => onSalvar(texto)}
          className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink sm:w-40"
        />
      )}

      {mostrarRef && (
        <ColunaReferencia
          referencia={referencia}
          estimado={estimado}
          unidade={item.unidade}
          apagada={somenteLeitura}
        />
      )}

      {contagem && (
        <div className="grid w-full grid-cols-2 gap-2 sm:w-44 sm:shrink-0">
          {(
            [
              ['contagem', 'quantidade', contQtd, setContQtd],
              ['entrada', 'entrada', contEnt, setContEnt],
            ] as const
          ).map(([rotulo, campo, v, setV]) => (
            <label key={campo} className="block">
              <span className="block text-[10px] text-ink-soft/70">{rotulo}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                disabled={somenteLeitura}
                value={v}
                onChange={(e) => setV(e.target.value)}
                onBlur={() => onSalvarEstoque?.(campo, v)}
                className="w-full rounded border border-line bg-paper px-2 py-1.5 text-right text-sm outline-none focus:border-ink"
              />
            </label>
          ))}
          {mostrarRef && !somenteLeitura && dif !== 0 && (
            <p className={`col-span-2 text-[11px] font-medium ${dif < 0 ? 'text-warn' : 'text-ok'}`}>
              {dif < 0 ? `−${numBR(-dif)}` : `+${numBR(dif)}`} em relação ao estimado
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** coluna de referência (tablet) ou linha única acima dos campos (celular) */
function ColunaReferencia({
  referencia,
  estimado,
  unidade,
  apagada,
}: {
  referencia: Referencia | null | undefined
  estimado: number | null
  unidade?: string | null
  apagada: boolean
}) {
  const cor = apagada ? 'text-ink-soft/60' : 'text-ink-soft'
  if (referencia === undefined)
    return <p className="text-[11px] text-ink-soft/70 sm:w-28 sm:shrink-0">buscando referência…</p>
  if (referencia === null)
    return <p className={`text-[11px] ${cor} sm:w-28 sm:shrink-0`}>sem referência</p>
  const [, mes, dia] = referencia.data.split('-')
  const un = unidade ? ` ${unidade}` : ''
  const contagem = `${numBR(referencia.qtd)}${un} · ${dia}/${mes}`
  const ent = referencia.entradas
  return (
    <>
      <p className={`text-[11px] ${cor} sm:hidden`}>
        ref. {contagem}
        {ent > 0 && ` · +${numBR(ent)} ent.`} · ≈ {numBR(estimado ?? referencia.qtd)}
        {un}
      </p>
      <div className={`hidden text-[11px] leading-snug ${cor} sm:block sm:w-28 sm:shrink-0`}>
        <p>{contagem}</p>
        {ent > 0 && <p>+{numBR(ent)} entradas</p>}
        <p>
          ≈ {numBR(estimado ?? referencia.qtd)}
          {un} estimado
        </p>
      </div>
    </>
  )
}
