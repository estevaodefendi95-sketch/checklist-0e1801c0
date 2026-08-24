import { useState } from 'react'
import { format } from 'date-fns'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function Relatorio() {
  const { podeAcessarArea } = useAuth()
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gerarPdf() {
    setGerando(true)
    setErro(null)

    const [{ data: execucoes }, { data: areas }, { data: templates }, { data: profiles }] =
      await Promise.all([
        supabase.from('checklist_execucoes').select('*').eq('data', data),
        supabase.from('areas').select('*'),
        supabase.from('checklist_templates').select('*'),
        supabase.from('profiles').select('*'),
      ])

    const execVisiveis = (execucoes ?? []).filter((e) => podeAcessarArea(e.area_id))

    if (execVisiveis.length === 0) {
      setErro('Nenhum checklist encontrado para essa data nas áreas que você acessa.')
      setGerando(false)
      return
    }

    const areaMap = Object.fromEntries((areas ?? []).map((a) => [a.id, a]))
    const templateMap = Object.fromEntries((templates ?? []).map((t) => [t.id, t]))
    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

    const execIds = execVisiveis.map((e) => e.id)
    const [{ data: respostas }, { data: itens }, { data: aprovacoes }] = await Promise.all([
      supabase.from('checklist_respostas').select('*').in('execucao_id', execIds),
      supabase.from('checklist_items').select('*'),
      supabase.from('aprovacoes').select('*').in('execucao_id', execIds),
    ])

    const itemMap = Object.fromEntries((itens ?? []).map((i) => [i.id, i]))

    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(`Relatório de checklist — ${format(new Date(data + 'T00:00:00'), 'dd/MM/yyyy')}`, 14, 16)

    let y = 26
    for (const exec of execVisiveis) {
      const area = areaMap[exec.area_id]
      const template = templateMap[exec.template_id]
      const preenchidoPor = profileMap[exec.preenchido_por]
      const aprovacao = (aprovacoes ?? []).find((a) => a.execucao_id === exec.id)
      const aprovador = aprovacao ? profileMap[aprovacao.aprovado_por] : null

      if (y > 260) {
        doc.addPage()
        y = 16
      }

      doc.setFontSize(11)
      doc.text(`${area?.nome ?? '—'} · ${template?.tipo ?? '—'}`, 14, y)
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

      const respostasExec = (respostas ?? []).filter((r) => r.execucao_id === exec.id)
      const rows = respostasExec.map((r) => [
        itemMap[r.item_id]?.nome_campo ?? '—',
        r.valor ?? '—',
      ])

      autoTable(doc, {
        startY: y + (aprovacao ? 14 : 9),
        head: [['item', 'valor']],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [47, 111, 79] },
        margin: { left: 14, right: 14 },
      })

      // @ts-expect-error jspdf-autotable adiciona lastAutoTable ao doc
      y = doc.lastAutoTable.finalY + 12
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
