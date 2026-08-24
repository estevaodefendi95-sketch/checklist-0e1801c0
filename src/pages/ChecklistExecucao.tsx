import { useEffect, useState } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  ChecklistTemplate,
  ChecklistItem,
  ChecklistExecucao as Execucao,
  ChecklistResposta,
  Aprovacao,
  Profile,
} from '../lib/types'

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
    const hoje = format(new Date(), 'yyyy-MM-dd')

    const { data: tpl } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('id', templateId)
      .single()
    if (!tpl) {
      setLoading(false)
      return
    }
    setTemplate(tpl)

    const { data: its } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('template_id', templateId)
      .order('ordem')
    setItems(its ?? [])

    let { data: exec } = await supabase
      .from('checklist_execucoes')
      .select('*')
      .eq('template_id', templateId)
      .eq('data', hoje)
      .maybeSingle()

    // cria a execução do dia se ainda não existir e o usuário pode editar
    if (!exec && podeEditar() && podeAcessarArea(tpl.area_id) && profile) {
      const { data: novo } = await supabase
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
      const { data: resps } = await supabase
        .from('checklist_respostas')
        .select('*')
        .eq('execucao_id', exec.id)
      const map: Record<string, ChecklistResposta> = {}
      for (const r of resps ?? []) map[r.item_id] = r
      setRespostas(map)

      const { data: apr } = await supabase
        .from('aprovacoes')
        .select('*')
        .eq('execucao_id', exec.id)
        .maybeSingle()
      setAprovacao(apr ?? null)
    }

    const { data: profs } = await supabase.from('profiles').select('*')
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
    const { data } = await supabase
      .from('checklist_respostas')
      .upsert(
        { execucao_id: execucao.id, item_id: item.id, valor, updated_at: new Date().toISOString() },
        { onConflict: 'execucao_id,item_id' }
      )
      .select()
      .single()
    if (data) setRespostas((prev) => ({ ...prev, [item.id]: data }))
    setSaving(false)
  }

  async function concluirChecklist() {
    if (!execucao) return
    await supabase
      .from('checklist_execucoes')
      .update({ status: 'concluido', horario_fim: new Date().toISOString() })
      .eq('id', execucao.id)
    setExecucao({ ...execucao, status: 'concluido', horario_fim: new Date().toISOString() })
  }

  async function aprovar() {
    if (!execucao || !profile) return
    const { data } = await supabase
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

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/" className="mb-4 inline-block text-xs text-ink-soft hover:text-ink">
        ← voltar
      </Link>
      <h1 className="display text-xl font-medium capitalize">{template.tipo}</h1>
      <p className="mb-1 text-sm text-ink-soft">
        {format(new Date(), 'dd/MM/yyyy')} · início{' '}
        {execucao ? format(new Date(execucao.horario_inicio), 'HH:mm') : '—'}
      </p>
      {execucao?.status === 'concluido' && (
        <p className="mb-4 inline-block rounded bg-ok-soft px-2 py-0.5 text-xs text-ok">
          concluído {execucao.horario_fim && format(new Date(execucao.horario_fim), 'às HH:mm')}
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

function ItemCampo({
  item,
  resposta,
  somenteLeitura,
  onSalvar,
}: {
  item: ChecklistItem
  resposta?: ChecklistResposta
  somenteLeitura: boolean
  onSalvar: (valor: string) => void
}) {
  const [texto, setTexto] = useState(resposta?.valor ?? '')

  useEffect(() => {
    setTexto(resposta?.valor ?? '')
  }, [resposta?.valor])

  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <span className="text-sm">
        {item.nome_campo}
        {item.obrigatorio && <span className="text-alert"> *</span>}
      </span>

      {item.tipo_campo === 'checkbox' && (
        <input
          type="checkbox"
          checked={resposta?.valor === 'true'}
          disabled={somenteLeitura}
          onChange={(e) => onSalvar(e.target.checked ? 'true' : 'false')}
          className="h-5 w-5 accent-ok"
        />
      )}

      {item.tipo_campo === 'sim_nao' && (
        <div className="flex gap-1 text-xs">
          {['sim', 'não'].map((opt) => (
            <button
              key={opt}
              disabled={somenteLeitura}
              onClick={() => onSalvar(opt)}
              className={`rounded border px-2 py-1 ${
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
        <input
          type="number"
          disabled={somenteLeitura}
          defaultValue={resposta?.valor ?? ''}
          onBlur={(e) => onSalvar(e.target.value)}
          className="w-20 rounded border border-line bg-paper px-2 py-1 text-right text-sm outline-none focus:border-ink"
        />
      )}

      {item.tipo_campo === 'texto' && (
        <input
          type="text"
          disabled={somenteLeitura}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => onSalvar(texto)}
          className="w-40 rounded border border-line bg-paper px-2 py-1 text-sm outline-none focus:border-ink"
        />
      )}
    </div>
  )
}
