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
}: {
  contagem?: boolean
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
        </div>
      )}
    </div>
  )
}
