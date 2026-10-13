import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Area, ChecklistExecucao, ChecklistTemplate } from '../lib/types'
import { format } from 'date-fns'
import { dataReferencia } from '../lib/periodo'
import { usePermissoes } from '../context/PermissoesContext'
import { PainelCustos } from '../components/PainelCustos'
import { Cabecalho } from '../components/Cabecalho'
import { Carregando, Erro, Vazio, cartaoCls } from '../components/Estado'

interface AreaCard {
  area: Area
  templates: ChecklistTemplate[]
  execucoesHoje: ChecklistExecucao[]
}

type Status = 'pendente' | 'em andamento' | 'concluído'
const ORDEM: Record<Status, number> = { pendente: 0, 'em andamento': 1, concluído: 2 }
const COR: Record<Status, string> = {
  concluído: 'bg-ok-soft text-ok',
  'em andamento': 'bg-warn-soft text-warn',
  pendente: 'bg-paper-dim text-ink-soft',
}

function statusDe(t: ChecklistTemplate, execucoes: ChecklistExecucao[]): Status {
  const ref = dataReferencia(t.frequencia)
  const exec = execucoes.find((e) => e.template_id === t.id && e.data === ref)
  return exec?.status === 'concluido' ? 'concluído' : exec ? 'em andamento' : 'pendente'
}

/**
 * modo "hoje": todos os checklists do dia numa lista só, pendentes primeiro (+ painel de custos)
 * modo "areas": os mesmos checklists agrupados por área (a tela inicial antiga)
 */
export function Dashboard({ modo }: { modo: 'hoje' | 'areas' }) {
  const { profile, podeAcessarArea } = useAuth()
  const { pode } = usePermissoes()
  const [cards, setCards] = useState<AreaCard[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (profile) load()
  }, [profile])

  async function load() {
    setLoading(true)
    const { data: areas, error: e1 } = await db.from('areas').select('*').order('nome')
    const { data: templates, error: e2 } = await db
      .from('checklist_templates')
      .select('*')
      .eq('ativo', true)
    const { data: execucoes, error: e3 } = await db
      .from('checklist_execucoes')
      .select('*')
      .gte('data', dataReferencia('semanal'))
    const falha = e1 ?? e2 ?? e3
    setErro(falha ? 'Não foi possível carregar os checklists: ' + falha.message : null)

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

  const hoje = format(new Date(), 'dd/MM/yyyy')
  const todos = cards.flatMap(({ area, templates, execucoesHoje }) =>
    templates.map((t) => ({ area, t, status: statusDe(t, execucoesHoje) }))
  )
  const pendentes = todos.filter((x) => x.status !== 'concluído').length

  return (
    <div>
      {modo === 'hoje' && pode('ver_custos') && <PainelCustos />}
      <Cabecalho
        titulo={modo === 'hoje' ? 'Checklists de hoje' : 'Áreas'}
        subtitulo={
          loading
            ? hoje
            : modo === 'hoje'
              ? `${hoje} · ${pendentes === 0 ? 'tudo concluído' : `${pendentes} para fazer`}`
              : `${hoje} · ${cards.length} ${cards.length === 1 ? 'área' : 'áreas'}`
        }
      />

      {erro && <Erro texto={erro} />}
      {loading ? (
        <Carregando />
      ) : cards.length === 0 ? (
        <Vazio texto="Você ainda não tem acesso a nenhuma área. Peça ao administrador para liberar." />
      ) : modo === 'hoje' ? (
        todos.length === 0 ? (
          <Vazio texto="Nenhum checklist cadastrado nas suas áreas." />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...todos]
              .sort((a, b) => ORDEM[a.status] - ORDEM[b.status] || a.area.nome.localeCompare(b.area.nome, 'pt-BR'))
              .map(({ area, t, status }) => (
                <li key={t.id}>
                  <Link
                    to={`/checklist/${t.id}`}
                    className={`${cartaoCls} flex min-h-[72px] items-center justify-between gap-3 px-4 py-3 transition-shadow hover:shadow-md`}
                  >
                    <span className="min-w-0">
                      <span className="apoio block">
                        {area.nome}
                        {t.frequencia === 'semanal' && ' · semanal'}
                      </span>
                      <span className="subtitulo block truncate capitalize">{t.tipo}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${COR[status]}`}>{status}</span>
                  </Link>
                </li>
              ))}
          </ul>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ area, templates, execucoesHoje }) => (
            <section key={area.id} className={`${cartaoCls} p-4`}>
              <h2 className="subtitulo mb-3">{area.nome}</h2>
              <div className="space-y-2">
                {templates.length === 0 && <p className="apoio">sem modelo cadastrado</p>}
                {templates.map((t) => {
                  const status = statusDe(t, execucoesHoje)
                  return (
                    <Link
                      key={t.id}
                      to={`/checklist/${t.id}`}
                      className="flex min-h-[48px] items-center justify-between gap-2 rounded-[10px] bg-paper px-3 text-sm hover:bg-paper-dim"
                    >
                      <span>
                        <span className="capitalize">{t.tipo}</span>
                        {t.frequencia === 'semanal' && <span className="ml-2 text-xs text-ink-soft">semanal</span>}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COR[status]}`}>{status}</span>
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
