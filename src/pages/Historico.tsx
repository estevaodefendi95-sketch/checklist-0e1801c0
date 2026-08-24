import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { db } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Area, ChecklistExecucao, ChecklistTemplate, Profile } from '../lib/types'

export function Historico() {
  const { podeAcessarArea } = useAuth()
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [execucoes, setExecucoes] = useState<ChecklistExecucao[]>([])
  const [areas, setAreas] = useState<Record<string, Area>>({})
  const [templates, setTemplates] = useState<Record<string, ChecklistTemplate>>({})
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [data])

  async function load() {
    setLoading(true)
    const [{ data: exec }, { data: ars }, { data: tpls }, { data: profs }] = await Promise.all([
      db.from('checklist_execucoes').select('*').eq('data', data),
      db.from('areas').select('*'),
      db.from('checklist_templates').select('*'),
      db.from('profiles').select('*'),
    ])

    const execTyped = (exec ?? []) as ChecklistExecucao[]
    const arsTyped = (ars ?? []) as Area[]
    const tplsTyped = (tpls ?? []) as ChecklistTemplate[]
    const profsTyped = (profs ?? []) as Profile[]

    setAreas(Object.fromEntries(arsTyped.map((a) => [a.id, a])))
    setTemplates(Object.fromEntries(tplsTyped.map((t) => [t.id, t])))
    setProfiles(Object.fromEntries(profsTyped.map((p) => [p.id, p])))
    setExecucoes(execTyped.filter((e) => podeAcessarArea(e.area_id)))
    setLoading(false)
  }

  return (
    <div>
      <h1 className="display mb-4 text-xl font-medium">histórico</h1>

      <input
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        className="mb-6 rounded border border-line bg-paper px-3 py-1.5 text-sm outline-none focus:border-ink"
      />

      {loading ? (
        <p className="text-sm text-ink-soft">Carregando…</p>
      ) : execucoes.length === 0 ? (
        <p className="text-sm text-ink-soft">Nenhum checklist registrado nesse dia.</p>
      ) : (
        <div className="divide-y divide-line rounded border border-line">
          {execucoes.map((e) => (
            <Link
              key={e.id}
              to={`/checklist/${e.template_id}`}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-paper-dim/40"
            >
              <div>
                <span className="font-medium">{areas[e.area_id]?.nome}</span>
                <span className="ml-2 capitalize text-ink-soft">
                  {templates[e.template_id]?.tipo}
                </span>
              </div>
              <div className="text-right text-xs text-ink-soft">
                <div>{profiles[e.preenchido_por]?.nome}</div>
                <div>
                  {e.status === 'concluido' ? 'concluído' : 'em andamento'} ·{' '}
                  {format(new Date(e.horario_inicio), 'HH:mm')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
