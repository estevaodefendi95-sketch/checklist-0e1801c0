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

/** último lançamento de contagem de um item: quantidade na unidade do item e data (yyyy-MM-dd) */
interface Ultimo {
  qtd: number
  data: string
}

const numBR = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/**
 * Último lançamento de cada item de um checklist de contagem: a resposta mais
 * recente (quantidade) entre as últimas 30 execuções concluídas do modelo e,
 * para itens ligados a insumo, a última estoque_contagens, se for mais nova.
 */
async function buscarUltimos(
  templateId: string,
  antesDe: string,
  itens: ChecklistItem[]
): Promise<Record<string, Ultimo>> {
  const execs = await db
    .from('checklist_execucoes')
    .select('id,data')
    .eq('template_id', templateId)
    .eq('status', 'concluido')
    .lt('data', antesDe)
    .order('data', { ascending: false })
    .limit(30)
  if (execs.error) throw execs.error
  const lista = (execs.data ?? []) as { id: string; data: string }[]
  const dataExec = Object.fromEntries(lista.map((e) => [e.id, e.data]))

  const ultimos: Record<string, Ultimo> = {}
  // em lotes de 10 execuções (bem abaixo do limite de 1000 linhas por consulta),
  // da mais nova para a mais antiga, até achar todos os itens
  for (let i = 0; i < lista.length && Object.keys(ultimos).length < itens.length; i += 10) {
    const lote = lista.slice(i, i + 10).map((e) => e.id)
    const r = await db
      .from('checklist_respostas')
      .select('item_id,execucao_id,quantidade')
      .in('execucao_id', lote)
      .not('quantidade', 'is', null)
    if (r.error) throw r.error
    for (const x of (r.data ?? []) as { item_id: string; execucao_id: string; quantidade: number }[]) {
      const data = dataExec[x.execucao_id]
      const atual = ultimos[x.item_id]
      if (!atual || data > atual.data) ultimos[x.item_id] = { qtd: Number(x.quantidade), data }
    }
  }

  const comInsumo = itens.filter((i) => i.insumo_id)
  if (comInsumo.length) {
    const r = await db
      .from('estoque_contagens')
      .select('insumo_id,data,quantidade')
      .in('insumo_id', [...new Set(comInsumo.map((i) => i.insumo_id))])
      .order('data', { ascending: false })
      .limit(1000)
    if (r.error) throw r.error
    // soma as contagens do dia mais recente de cada insumo (como v_contagens)
    const porInsumo: Record<string, Ultimo> = {}
    for (const x of (r.data ?? []) as { insumo_id: string; data: string; quantidade: number }[]) {
      const atual = porInsumo[x.insumo_id]
      if (!atual) porInsumo[x.insumo_id] = { qtd: Number(x.quantidade), data: x.data }
      else if (atual.data === x.data) atual.qtd += Number(x.quantidade)
    }
    for (const item of comInsumo) {
      const c = porInsumo[item.insumo_id!]
      if (!c) continue
      const fator = Number(item.fator_contagem) || 1
      const atual = ultimos[item.id]
      if (!atual || c.data > atual.data) ultimos[item.id] = { qtd: c.qtd / fator, data: c.data }
    }
  }
  return ultimos
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
  // último lançamento por item (só checklists de contagem); undefined = carregando
  const [ultimos, setUltimos] = useState<Record<string, Ultimo> | undefined>(undefined)
  const [ultimosErro, setUltimosErro] = useState(false)

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
      setUltimos(undefined)
      setUltimosErro(false)
      buscarUltimos(tpl.id, hoje, ((its ?? []) as ChecklistItem[]).filter((i) => i.tipo_campo === 'checkbox'))
        .then(setUltimos)
        .catch(() => setUltimosErro(true))
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
          concluído {execucao.horario_fim && format(new Date(execucao.horario_fim), 'às HH:mm')}
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

      {ultimosErro && (
        <p className="mt-4 text-xs text-ink-soft" role="status">
          Não foi possível carregar os últimos lançamentos. O checklist funciona normalmente.
        </p>
      )}

      <div className="mt-4 divide-y divide-line rounded border border-line">
        {items.map((item) => (
          <ItemCampo
            key={item.id}
            item={item}
            resposta={respostas[item.id]}
            somenteLeitura={somenteLeitura}
            onSalvar={(valor) => salvarResposta(item, valor)}
            contagem={!!template.contagem_estoque && item.tipo_campo !== 'quantidade'}
            onSalvarEstoque={(campo, v) => salvarEstoque(item, campo, v)}
            ultimo={
              template.contagem_estoque && item.tipo_campo === 'checkbox' && !ultimosErro
                ? ultimos === undefined
                  ? undefined
                  : (ultimos[item.id] ?? null)
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
  ultimo,
}: {
  contagem?: boolean
  /** último lançamento: objeto, null = nunca houve, undefined = carregando, false = não mostrar */
  ultimo?: Ultimo | null | false
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

  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
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
          {ultimo !== false && (
            <UltimoLancamento ultimo={ultimo} unidade={item.unidade} digitado={contQtd} />
          )}
        </div>
      )}
    </div>
  )
}

function UltimoLancamento({
  ultimo,
  unidade,
  digitado,
}: {
  ultimo: Ultimo | null | undefined
  unidade?: string | null
  digitado: string
}) {
  if (ultimo === undefined)
    return <p className="col-span-2 text-[11px] text-ink-soft/70">buscando último lançamento…</p>
  if (ultimo === null) return <p className="col-span-2 text-[11px] text-ink-soft">Sem lançamento anterior</p>
  const [, mes, dia] = ultimo.data.split('-')
  const n = digitado.trim() === '' ? NaN : Number(digitado)
  const dif = Number.isFinite(n) ? Math.round((n - ultimo.qtd) * 1000) / 1000 : 0
  return (
    <div className="col-span-2 text-[11px] leading-snug">
      <p className="text-ink-soft">
        Último: {numBR(ultimo.qtd)}
        {unidade ? ` ${unidade}` : ''} · {dia}/{mes}
      </p>
      {dif !== 0 && (
        <p className={`font-medium ${dif < 0 ? 'text-warn' : 'text-ok'}`}>
          {dif < 0 ? `−${numBR(-dif)}` : `+${numBR(dif)}`} desde o último lançamento
        </p>
      )}
    </div>
  )
}
