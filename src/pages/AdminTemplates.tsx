import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { Area, ChecklistItem, ChecklistTemplate, CampoTipo } from '../lib/types'

const camposLabel: Record<CampoTipo, string> = {
  checkbox: 'marcar (sim/não simples)',
  sim_nao: 'sim / não',
  quantidade: 'quantidade',
  texto: 'texto livre',
}

const tiposSugeridos = ['abertura', 'fechamento', 'estoque']

export function AdminTemplates() {
  const [areas, setAreas] = useState<Area[]>([])
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [templateSelecionado, setTemplateSelecionado] = useState<string | null>(null)

  const [novaAreaNome, setNovaAreaNome] = useState('')

  const [novoNome, setNovoNome] = useState('')
  const [novaArea, setNovaArea] = useState('')
  const [novoTipo, setNovoTipo] = useState('abertura')

  const [novoItemNome, setNovoItemNome] = useState('')
  const [novoItemTipo, setNovoItemTipo] = useState<CampoTipo>('checkbox')

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const [{ data: ars }, { data: tpls }, { data: its }] = await Promise.all([
      db.from('areas').select('*').order('nome'),
      db.from('checklist_templates').select('*').order('created_at'),
      db.from('checklist_items').select('*').order('ordem'),
    ])
    setAreas(ars ?? [])
    setTemplates(tpls ?? [])
    setItems(its ?? [])
    if (ars && ars.length > 0 && !novaArea) setNovaArea(ars[0].id)
  }

  async function criarArea() {
    if (!novaAreaNome.trim()) return
    const { data } = await db
      .from('areas')
      .insert({ nome: novaAreaNome.trim() })
      .select()
      .single()
    if (data) {
      setAreas((prev) => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)))
      setNovaAreaNome('')
      if (!novaArea) setNovaArea(data.id)
    }
  }

  async function excluirArea(id: string) {
    await db.from('areas').delete().eq('id', id)
    setAreas((prev) => prev.filter((a) => a.id !== id))
  }

  async function criarTemplate() {
    if (!novoNome || !novaArea || !novoTipo.trim()) return
    const { data } = await db
      .from('checklist_templates')
      .insert({ nome: novoNome, area_id: novaArea, tipo: novoTipo.trim().toLowerCase() })
      .select()
      .single()
    if (data) {
      setTemplates((prev) => [...prev, data])
      setNovoNome('')
    }
  }

  async function excluirTemplate(id: string) {
    await db.from('checklist_templates').delete().eq('id', id)
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    if (templateSelecionado === id) setTemplateSelecionado(null)
  }

  async function criarItem() {
    if (!novoItemNome || !templateSelecionado) return
    const ordem = items.filter((i) => i.template_id === templateSelecionado).length
    const { data } = await db
      .from('checklist_items')
      .insert({
        template_id: templateSelecionado,
        nome_campo: novoItemNome,
        tipo_campo: novoItemTipo,
        ordem,
      })
      .select()
      .single()
    if (data) {
      setItems((prev) => [...prev, data])
      setNovoItemNome('')
    }
  }

  async function excluirItem(id: string) {
    await db.from('checklist_items').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const itensDoTemplate = items.filter((i) => i.template_id === templateSelecionado)

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <div>
        <h1 className="display mb-4 text-xl font-medium">áreas</h1>

        <div className="mb-4 flex gap-2 rounded border border-line bg-paper-dim/40 p-3">
          <input
            placeholder="nome da nova área (ex: estoque)"
            value={novaAreaNome}
            onChange={(e) => setNovaAreaNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && criarArea()}
            className="flex-1 rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
          />
          <button
            onClick={criarArea}
            className="rounded bg-ink px-3 py-1.5 text-sm font-medium text-paper"
          >
            criar
          </button>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {areas.map((a) => (
            <span
              key={a.id}
              className="flex items-center gap-2 rounded border border-line bg-paper px-2 py-1 text-xs"
            >
              {a.nome}
              <button
                onClick={() => excluirArea(a.id)}
                className="text-alert hover:underline"
                title="excluir área"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        <h1 className="display mb-4 text-xl font-medium">modelos</h1>

        <div className="mb-4 space-y-2 rounded border border-line bg-paper-dim/40 p-3">
          <input
            placeholder="nome do modelo (ex: abertura cozinha)"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={novaArea}
              onChange={(e) => setNovaArea(e.target.value)}
              className="rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink sm:flex-1"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
            <input
              list="tipos-sugeridos"
              placeholder="tipo (ex: estoque)"
              value={novoTipo}
              onChange={(e) => setNovoTipo(e.target.value)}
              className="rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink sm:w-40"
            />
            <datalist id="tipos-sugeridos">
              {tiposSugeridos.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <button
            onClick={criarTemplate}
            className="w-full rounded bg-ink py-1.5 text-sm font-medium text-paper"
          >
            criar modelo
          </button>
        </div>

        <div className="divide-y divide-line rounded border border-line">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplateSelecionado(t.id)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper-dim/40 ${
                templateSelecionado === t.id ? 'bg-paper-dim/60' : ''
              }`}
            >
              <span className="min-w-0 break-words">
                {areas.find((a) => a.id === t.area_id)?.nome} · {t.nome}
                <span className="ml-2 text-xs capitalize text-ink-soft">{t.tipo}</span>
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  excluirTemplate(t.id)
                }}
                className="shrink-0 text-xs text-alert hover:underline"
              >
                excluir
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="display mb-4 text-xl font-medium">
          {templateSelecionado
            ? `itens — ${templates.find((t) => t.id === templateSelecionado)?.nome}`
            : 'itens'}
        </h2>

        {!templateSelecionado ? (
          <p className="text-sm text-ink-soft">Selecione um modelo à esquerda.</p>
        ) : (
          <>
            <div className="mb-4 space-y-2 rounded border border-line bg-paper-dim/40 p-3">
              <input
                placeholder="nome do item (ex: temperatura da câmara fria)"
                value={novoItemNome}
                onChange={(e) => setNovoItemNome(e.target.value)}
                className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
              />
              <select
                value={novoItemTipo}
                onChange={(e) => setNovoItemTipo(e.target.value as CampoTipo)}
                className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
              >
                {Object.entries(camposLabel).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                onClick={criarItem}
                className="w-full rounded bg-ink py-1.5 text-sm font-medium text-paper"
              >
                adicionar item
              </button>
            </div>

            <div className="divide-y divide-line rounded border border-line">
              {itensDoTemplate.map((i) => (
                <div key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {i.nome_campo}
                    <span className="ml-2 text-xs text-ink-soft">{camposLabel[i.tipo_campo]}</span>
                  </span>
                  <button
                    onClick={() => excluirItem(i.id)}
                    className="text-xs text-alert hover:underline"
                  >
                    excluir
                  </button>
                </div>
              ))}
              {itensDoTemplate.length === 0 && (
                <p className="px-3 py-2 text-sm text-ink-soft">nenhum item ainda</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
