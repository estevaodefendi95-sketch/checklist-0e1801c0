import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Area, ChecklistExecucao, ChecklistTemplate } from '../lib/types'
import { format } from 'date-fns'

interface AreaCard {
  area: Area
  templates: ChecklistTemplate[]
  execucoesHoje: ChecklistExecucao[]
}

export function Dashboard() {
  const { profile, podeAcessarArea } = useAuth()
  const [cards, setCards] = useState<AreaCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) load()
  }, [profile])

  async function load() {
    setLoading(true)
    const hoje = format(new Date(), 'yyyy-MM-dd')

    const { data: areas } = await db.from('areas').select('*').order('nome')
    const { data: templates } = await db
      .from('checklist_templates')
      .select('*')
      .eq('ativo', true)
    const { data: execucoes } = await db
      .from('checklist_execucoes')
      .select('*')
      .eq('data', hoje)

    const areasTyped = (areas ?? []) as Area[]
    const templatesTyped = (templates ?? []) as ChecklistTemplate[]
    const execucoesTyped = (execucoes ?? []) as ChecklistExecucao[]

    const visiveis = areasTyped.filter((a) => podeAcessarArea(a.id))

    setCards(
      visiveis.map((area) => ({
        area,
        templates: templatesTyped.filter((t) => t.area_id === area.id),
        execucoesHoje: execucoesTyped.filter((e) => e.area_id === area.id),
      }))
    )
    setLoading(false)
  }

  if (loading) return <p className="text-sm text-ink-soft">Carregando…</p>

  if (cards.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        Você ainda não tem acesso a nenhuma área. Peça ao administrador para liberar.
      </p>
    )
  }

  return (
    <div>
      <h1 className="display mb-1 text-xl font-medium">áreas</h1>
      <p className="mb-6 text-sm text-ink-soft">{format(new Date(), 'dd/MM/yyyy')}</p>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ area, templates, execucoesHoje }) => (
          <div key={area.id} className="rounded border border-line bg-paper-dim/40 p-4">
            <h2 className="display mb-3 font-medium">{area.nome}</h2>
            <div className="space-y-2">
              {templates.length === 0 && (
                <p className="text-xs text-ink-soft">sem modelo cadastrado</p>
              )}
              {templates.map((t) => {
                const exec = execucoesHoje.find((e) => e.template_id === t.id)
                const status = exec?.status === 'concluido' ? 'concluído' : exec ? 'em andamento' : 'pendente'
                const color =
                  status === 'concluído'
                    ? 'bg-ok-soft text-ok'
                    : status === 'em andamento'
                    ? 'bg-warn-soft text-warn'
                    : 'bg-paper-dim text-ink-soft'
                return (
                  <Link
                    key={t.id}
                    to={`/checklist/${t.id}`}
                    className="flex items-center justify-between rounded border border-line bg-paper px-3 py-2 text-sm hover:border-ink"
                  >
                    <span className="capitalize">{t.tipo}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${color}`}>{status}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
