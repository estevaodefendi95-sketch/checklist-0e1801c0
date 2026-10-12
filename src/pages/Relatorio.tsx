import { useState } from 'react'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { db } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  Area,
  ChecklistExecucao,
  ChecklistTemplate,
  ChecklistItem,
  ChecklistResposta,
  Aprovacao,
  Profile,
} from '../lib/types'
import { dataReferencia } from '../lib/periodo'

export function Relatorio() {
  const { podeAcessarArea } = useAuth()
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gerarPdf() {
    setGerando(true)
    setErro(null)

    const base = new Date(data + 'T00:00:00')
    const [{ data: execucoes }, { data: areas }, { data: templates }, { data: profiles }] =
      await Promise.all([
        db
          .from('checklist_execucoes')
          .select('*')
          .gte('data', dataReferencia('semanal', base))
          .lte('data', data),
        db.from('areas').select('*'),
        db.from('checklist_templates').select('*'),
        db.from('profiles').select('*'),
      ])

    const execucoesTyped = (execucoes ?? []) as ChecklistExecucao[]
    const areasTyped = (areas ?? []) as Area[]
    const templatesTyped = (templates ?? []) as ChecklistTemplate[]
    const profilesTyped = (profiles ?? []) as Profile[]

    const areaMap = Object.fromEntries(areasTyped.map((a) => [a.id, a]))
    const templateMap = Object.fromEntries(templatesTyped.map((t) => [t.id, t]))
    const profileMap = Object.fromEntries(profilesTyped.map((p) => [p.id, p]))

    const execVisiveis = execucoesTyped.filter(
      (e) =>
        podeAcessarArea(e.area_id) &&
        e.data === dataReferencia(templateMap[e.template_id]?.frequencia, base)
    )

    if (execVisiveis.length === 0) {
      setErro('Nenhum checklist encontrado para essa data nas áreas que você acessa.')
      setGerando(false)
      return
    }

    const execIds = execVisiveis.map((e) => e.id)
    const [{ data: respostas }, { data: itens }, { data: aprovacoes }] = await Promise.all([
      db.from('checklist_respostas').select('*').in('execucao_id', execIds),
      db.from('checklist_items').select('*'),
      db.from('aprovacoes').select('*').in('execucao_id', execIds),
    ])

    const respostasTyped = (respostas ?? []) as ChecklistResposta[]
    const itensTyped = (itens ?? []) as ChecklistItem[]
    const aprovacoesTyped = (aprovacoes ?? []) as Aprovacao[]

    const itemMap = Object.fromEntries(itensTyped.map((i) => [i.id, i]))

    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(`Relatório de checklist — ${format(base, 'dd/MM/yyyy')}`, 14, 16)

    let y = 26
    for (const exec of execVisiveis) {
      const area = areaMap[exec.area_id]
      const template = templateMap[exec.template_id]
      const preenchidoPor = profileMap[exec.preenchido_por]
      const aprovacao = aprovacoesTyped.find((a) => a.execucao_id === exec.id)
      const aprovador = aprovacao ? profileMap[aprovacao.aprovado_por] : null

      if (y > 260) {
        doc.addPage()
        y = 16
      }

      doc.setTextColor(0, 0, 0)
      doc.setFontSize(11)
      doc.text(
        `${area?.nome ?? '—'} · ${template?.tipo ?? '—'}${template?.frequencia === 'semanal' ? ' (semanal)' : ''}`,
        14,
        y
      )
      doc.setFontSize(9)
      doc.text(
        `preenchido por ${preenchidoPor?.nome ?? '—'} às ${format(new Date(exec.horario_inicio), 'HH:mm')} · status: ${exec.status}`,
        14,
        y + 5
      )
      if (aprovacao && aprovador) {
        doc.text(
          `aprovado por ${aprovador.nome} (${aprovacao.role_no_momento}) às ${format(new Date(aprovacao.horario_aprovacao), 'HH:mm')}`,
          14,
          y + 10
        )
      }

      const respostasExec = respostasTyped.filter((r) => r.execucao_id === exec.id)
      const repor: string[] = []
      const reporRows = new Set<number>()
      const rows = respostasExec.map((r, idx) => {
        const item = itemMap[r.item_id]
        const un = item?.unidade ? ' ' + item.unidade : ''
        const isQtd = item?.tipo_campo === 'quantidade'
        const temMin = isQtd && item.estoque_minimo != null
        const abaixo =
          temMin && r.valor != null && r.valor !== '' && Number(r.valor) < Number(item.estoque_minimo)
        if (abaixo) {
          reporRows.add(idx)
          repor.push(`${item.nome_campo} (${r.valor}${un}, mín. ${item.estoque_minimo}${un})`)
        }
        return [
          item?.nome_campo ?? '—',
          r.valor ? (isQtd ? r.valor + un : r.valor) : '—',
          temMin ? `${item.estoque_minimo}${un}` : '—',
          abaixo ? 'REPOR' : temMin ? 'ok' : '—',
        ]
      })

      autoTable(doc, {
        startY: y + (aprovacao ? 14 : 9),
        head: [['item', 'contagem', 'mínimo', 'situação']],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [47, 111, 79] },
        margin: { left: 14, right: 14 },
        didParseCell: (hook) => {
          if (hook.section === 'body' && reporRows.has(hook.row.index)) {
            hook.cell.styles.textColor = [180, 30, 30]
            hook.cell.styles.fontStyle = 'bold'
          }
        },
      })

      // @ts-expect-error jspdf-autotable adiciona lastAutoTable ao doc
      y = doc.lastAutoTable.finalY + 6

      if (repor.length > 0) {
        const linhas = doc.splitTextToSize(`Para repor: ${repor.join('; ')}`, 180)
        if (y + linhas.length * 4 > 285) {
          doc.addPage()
          y = 16
        }
        doc.setFontSize(9)
        doc.setTextColor(180, 30, 30)
        doc.text(linhas, 14, y)
        doc.setTextColor(0, 0, 0)
        y += linhas.length * 4
      }
      y += 6
    }

    doc.save(`checklist-${data}.pdf`)
    setGerando(false)
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="display mb-4 text-xl font-medium">relatório</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Gera um PDF com todos os checklists do dia escolhido, itens, respostas e aprovação.
      </p>

      <label className="mb-1 block text-xs text-ink-soft">data</label>
      <input
        type="date"
        value={data}
        onChange={(e) => setData(e.target.value)}
        className="mb-4 w-full rounded border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
      />

      {erro && (
        <p className="mb-4 rounded border border-warn-soft bg-warn-soft px-3 py-2 text-xs text-warn">
          {erro}
        </p>
      )}

      <button
        onClick={gerarPdf}
        disabled={gerando}
        className="w-full rounded bg-ink py-2 text-sm font-medium text-paper disabled:opacity-50"
      >
        {gerando ? 'gerando…' : 'gerar PDF'}
      </button>
    </div>
  )
}
