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

function camposEstoque(tipo: CampoTipo, unidade: string, minimo: string) {
  if (tipo !== 'quantidade') return { unidade: null, estoque_minimo: null }
  return {
    unidade: unidade.trim() || null,
    estoque_minimo: minimo.trim() === '' ? null : Number(minimo),
  }
}

function CamposEstoque({
  unidade,
  minimo,
  setUnidade,
  setMinimo,
}: {
  unidade: string
  minimo: string
  setUnidade: (v: string) => void
  setMinimo: (v: string) => void
}) {
  return (
    <div className="flex gap-2">
      <input
        placeholder="unidade (kg, un, cx)"
        value={unidade}
        onChange={(e) => setUnidade(e.target.value)}
        className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
      />
      <input
        type="number"
        inputMode="decimal"
        min={0}
        placeholder="estoque mínimo"
        value={minimo}
        onChange={(e) => setMinimo(e.target.value)}
        className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
      />
    </div>
  )
}

export function AdminTemplates() {
  const [areas, setAreas] = useState<Area[]>([])
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [templateSelecionado, setTemplateSelecionado] = useState<string | null>(null)
  const [salvandoFrequencia, setSalvandoFrequencia] = useState(false)

  const [novaAreaNome, setNovaAreaNome] = useState('')

  const [novoNome, setNovoNome] = useState('')
  const [novaArea, setNovaArea] = useState('')
  const [novoTipo, setNovoTipo] = useState('abertura')
  const [novaFrequencia, setNovaFrequencia] = useState<'diaria' | 'semanal'>('diaria')

  const [novoItemNome, setNovoItemNome] = useState('')
  const [novoItemTipo, setNovoItemTipo] = useState<CampoTipo>('checkbox')
  const [novoItemUnidade, setNovoItemUnidade] = useState('')
  const [novoItemMinimo, setNovoItemMinimo] = useState('')

  const [itemEditando, setItemEditando] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editTipo, setEditTipo] = useState<CampoTipo>('checkbox')
  const [editUnidade, setEditUnidade] = useState('')
  const [editMinimo, setEditMinimo] = useState('')

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
    const ok = window.confirm(
      'Excluir essa área também apaga os modelos e o histórico de checklists dela. Continuar?'
    )
    if (!ok) return
    const { error } = await db.from('areas').delete().eq('id', id)
    if (error) {
      alert('Não foi possível excluir: ' + error.message)
      return
    }
    setAreas((prev) => prev.filter((a) => a.id !== id))
    setTemplates((prev) => prev.filter((t) => t.area_id !== id))
  }

  async function criarTemplate() {
    if (!novoNome || !novaArea || !novoTipo.trim()) return
    const { data } = await db
      .from('checklist_templates')
      .insert({
        nome: novoNome,
        area_id: novaArea,
        tipo: novoTipo.trim().toLowerCase(),
        frequencia: novaFrequencia,
      })
      .select()
      .single()
    if (data) {
      setTemplates((prev) => [...prev, data])
      setNovoNome('')
    }
  }

  async function alterarFrequencia(id: string, frequencia: 'diaria' | 'semanal') {
    setSalvandoFrequencia(true)
    const { data, error } = await db
      .from('checklist_templates')
      .update({ frequencia })
      .eq('id', id)
      .select()
      .single()
    setSalvandoFrequencia(false)
    if (error) {
      alert('Não foi possível alterar: ' + error.message)
      return
    }
    if (data) setTemplates((prev) => prev.map((t) => (t.id === id ? data : t)))
  }

  async function alterarContagem(id: string, contagem_estoque: boolean) {
    setSalvandoFrequencia(true)
    const { data, error } = await db
      .from('checklist_templates')
      .update({ contagem_estoque })
      .eq('id', id)
      .select()
      .single()
    setSalvandoFrequencia(false)
    if (error) {
      alert('Não foi possível alterar: ' + error.message)
      return
    }
    if (data) setTemplates((prev) => prev.map((t) => (t.id === id ? data : t)))
  }

  async function excluirTemplate(id: string) {
    const ok = window.confirm(
      'Excluir esse modelo também apaga o histórico de checklists já preenchidos com ele. Continuar?'
    )
    if (!ok) return
    const { error } = await db.from('checklist_templates').delete().eq('id', id)
    if (error) {
      alert('Não foi possível excluir: ' + error.message)
      return
    }
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
        ...camposEstoque(novoItemTipo, novoItemUnidade, novoItemMinimo),
      })
      .select()
      .single()
    if (data) {
      setItems((prev) => [...prev, data])
      setNovoItemNome('')
      setNovoItemUnidade('')
      setNovoItemMinimo('')
    }
  }

  async function excluirItem(id: string) {
    const { error } = await db.from('checklist_items').delete().eq('id', id)
    if (error) {
      alert('Não foi possível excluir: ' + error.message)
      return
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  function iniciarEdicaoItem(item: ChecklistItem) {
    setItemEditando(item.id)
    setEditNome(item.nome_campo)
    setEditTipo(item.tipo_campo)
    setEditUnidade(item.unidade ?? '')
    setEditMinimo(item.estoque_minimo != null ? String(item.estoque_minimo) : '')
  }

  async function salvarEdicaoItem(id: string) {
    if (!editNome.trim()) return
    const { data, error } = await db
      .from('checklist_items')
      .update({
        nome_campo: editNome.trim(),
        tipo_campo: editTipo,
        ...camposEstoque(editTipo, editUnidade, editMinimo),
      })
      .eq('id', id)
      .select()
      .single()
    if (error) {
      alert('Não foi possível salvar: ' + error.message)
      return
    }
    if (data) {
      setItems((prev) => prev.map((i) => (i.id === id ? data : i)))
    }
    setItemEditando(null)
  }

  async function moverItem(id: string, direcao: -1 | 1) {
    const lista = items
      .filter((i) => i.template_id === templateSelecionado)
      .sort((a, b) => a.ordem - b.ordem)
    const idx = lista.findIndex((i) => i.id === id)
    const alvo = lista[idx + direcao]
    if (!alvo) return
    const atual = lista[idx]

    const [{ data: a }, { data: b }] = await Promise.all([
      db.from('checklist_items').update({ ordem: alvo.ordem }).eq('id', atual.id).select().single(),
      db.from('checklist_items').update({ ordem: atual.ordem }).eq('id', alvo.id).select().single(),
    ])
    if (a && b) {
      setItems((prev) => prev.map((i) => (i.id === a.id ? a : i.id === b.id ? b : i)))
    }
  }

  const templateAtual = templates.find((t) => t.id === templateSelecionado)

  const itensDoTemplate = items
    .filter((i) => i.template_id === templateSelecionado)
    .sort((a, b) => a.ordem - b.ordem)

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
          <select
            value={novaFrequencia}
            onChange={(e) => setNovaFrequencia(e.target.value as 'diaria' | 'semanal')}
            className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
          >
            <option value="diaria">conferência diária</option>
            <option value="semanal">conferência semanal</option>
          </select>
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
                <span className="ml-2 text-xs text-ink-soft">
                  <span className="capitalize">{t.tipo}</span> ·{' '}
                  {t.frequencia === 'semanal' ? 'semanal' : 'diário'}
                </span>
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
              <label className="block text-xs font-medium text-ink-soft">
                frequência da conferência deste modelo
              </label>
              <select
                value={templateAtual?.frequencia ?? 'diaria'}
                disabled={salvandoFrequencia}
                onChange={(e) =>
                  templateAtual &&
                  alterarFrequencia(templateAtual.id, e.target.value as 'diaria' | 'semanal')
                }
                className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink disabled:opacity-50"
              >
                <option value="diaria">conferência diária</option>
                <option value="semanal">conferência semanal</option>
              </select>
              <p className="text-xs text-ink-soft">
                Os itens e o histórico são mantidos. Só muda como a contagem é aberta.
              </p>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!templateAtual?.contagem_estoque}
                  disabled={salvandoFrequencia}
                  onChange={(e) =>
                    templateAtual && alterarContagem(templateAtual.id, e.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 shrink-0 accent-ok"
                />
                <span>registrar quantidade em cada item (contagem de estoque)</span>
              </label>
              <p className="mt-1 text-[11px] text-ink-soft/70">
                Além do check, aparece o campo de contagem e de entrada na frente de cada produto. O
                relatório de balanço usa esses números.
              </p>
            </div>

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
              {novoItemTipo === 'quantidade' && (
                <CamposEstoque
                  unidade={novoItemUnidade}
                  minimo={novoItemMinimo}
                  setUnidade={setNovoItemUnidade}
                  setMinimo={setNovoItemMinimo}
                />
              )}
              <button
                onClick={criarItem}
                className="w-full rounded bg-ink py-1.5 text-sm font-medium text-paper"
              >
                adicionar item
              </button>
            </div>

            <div className="divide-y divide-line rounded border border-line">
              {itensDoTemplate.map((i, idx) =>
                itemEditando === i.id ? (
                  <div key={i.id} className="space-y-2 bg-paper-dim/40 px-3 py-2">
                    <input
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
                    />
                    <select
                      value={editTipo}
                      onChange={(e) => setEditTipo(e.target.value as CampoTipo)}
                      className="w-full rounded border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-ink"
                    >
                      {Object.entries(camposLabel).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {editTipo === 'quantidade' && (
                      <CamposEstoque
                        unidade={editUnidade}
                        minimo={editMinimo}
                        setUnidade={setEditUnidade}
                        setMinimo={setEditMinimo}
                      />
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => salvarEdicaoItem(i.id)}
                        className="flex-1 rounded bg-ink py-1.5 text-xs font-medium text-paper"
                      >
                        salvar
                      </button>
                      <button
                        onClick={() => setItemEditando(null)}
                        className="flex-1 rounded border border-line py-1.5 text-xs text-ink-soft"
                      >
                        cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="flex items-center gap-1 text-ink-soft">
                      <button
                        onClick={() => moverItem(i.id, -1)}
                        disabled={idx === 0}
                        className="px-1 disabled:opacity-20"
                        title="mover pra cima"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moverItem(i.id, 1)}
                        disabled={idx === itensDoTemplate.length - 1}
                        className="px-1 disabled:opacity-20"
                        title="mover pra baixo"
                      >
                        ↓
                      </button>
                    </div>
                    <span className="min-w-0 flex-1 break-words">
                      {i.nome_campo}
                      <span className="ml-2 text-xs text-ink-soft">
                        {camposLabel[i.tipo_campo]}
                        {i.tipo_campo === 'quantidade' && i.estoque_minimo != null &&
                          ` · mín. ${i.estoque_minimo}${i.unidade ? ' ' + i.unidade : ''}`}
                      </span>
                    </span>
                    <div className="flex shrink-0 gap-3 text-xs">
                      <button
                        onClick={() => iniciarEdicaoItem(i)}
                        className="text-ink-soft hover:underline"
                      >
                        editar
                      </button>
                      <button
                        onClick={() => excluirItem(i.id)}
                        className="text-alert hover:underline"
                      >
                        excluir
                      </button>
                    </div>
                  </div>
                )
              )}
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
