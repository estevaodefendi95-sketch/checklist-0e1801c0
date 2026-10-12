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

  const [inicio, setInicio] = useState(format(new Date(Date.now() - 6 * 864e5), 'yyyy-MM-dd'))
  const [fim, setFim] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [calculando, setCalculando] = useState(false)
  const [erroBal, setErroBal] = useState<string | null>(null)
  const [balanco, setBalanco] = useState<BalancoModelo[] | null>(null)

  async function calcularBalanco() {
    setErroBal(null)
    setBalanco(null)
    if (!inicio || !fim || inicio > fim) {
      setErroBal('A data inicial precisa ser igual ou anterior à data final.')
      return
    }
    setCalculando(true)
    const [{ data: tpls }, { data: areas }] = await Promise.all([
      db.from('checklist_templates').select('*').eq('contagem_estoque', true),
      db.from('areas').select('*'),
    ])
    const modelos = ((tpls ?? []) as ChecklistTemplate[]).filter((t) => podeAcessarArea(t.area_id))
    const areaMap = Object.fromEntries(((areas ?? []) as Area[]).map((a) => [a.id, a]))
    if (modelos.length === 0) {
      setErroBal('Nenhum modelo com contagem de estoque nas áreas que você acessa.')
      setCalculando(false)
      return
    }
    const ids = modelos.map((m) => m.id)
    const [{ data: execs }, { data: itens }] = await Promise.all([
      db
        .from('checklist_execucoes')
        .select('*')
        .in('template_id', ids)
        .gte('data', inicio)
        .lte('data', fim),
      db.from('checklist_items').select('*').in('template_id', ids).order('ordem'),
    ])
    const execTyped = (execs ?? []) as ChecklistExecucao[]
    const itensTyped = (itens ?? []) as ChecklistItem[]
    let resps: ChecklistResposta[] = []
    if (execTyped.length > 0) {
      const { data: r } = await db
        .from('checklist_respostas')
        .select('*')
        .in('execucao_id', execTyped.map((e) => e.id))
      resps = (r ?? []) as ChecklistResposta[]
    }
    const execMap = Object.fromEntries(execTyped.map((e) => [e.id, e]))

    const resultado: BalancoModelo[] = []
    for (const m of modelos) {
      const linhas: BalancoLinha[] = []
      for (const item of itensTyped.filter((i) => i.template_id === m.id)) {
        const serie = resps
          .filter((r) => r.item_id === item.id && execMap[r.execucao_id])
          .map((r) => {
            let c: number | null = r.quantidade != null ? Number(r.quantidade) : null
            if (c == null && item.tipo_campo === 'quantidade' && r.valor != null && r.valor !== '') {
              const n = Number(r.valor)
              c = isNaN(n) ? null : n
            }
            return { data: execMap[r.execucao_id].data, contagem: c, entrada: Number(r.entrada ?? 0) }
          })
          .filter((x) => x.contagem != null)
          .sort((a, b) => a.data.localeCompare(b.data)) as { data: string; contagem: number; entrada: number }[]
        if (serie.length === 0) continue
        const un = item.unidade ? ' ' + item.unidade : ''
        const ini = serie[0]
        if (serie.length === 1) {
          linhas.push({ produto: item.nome_campo, inicio: `${ini.contagem}${un} (${dm(ini.data)})`, entradas: '—', fim: '—', saida: 'precisa de 2 contagens' })
          continue
        }
        const ult = serie[serie.length - 1]
        const entradas = serie.slice(1).reduce((s, x) => s + x.entrada, 0)
        const saida = ini.contagem + entradas - ult.contagem
        linhas.push({
          produto: item.nome_campo,
          inicio: `${ini.contagem}${un} (${dm(ini.data)})`,
          entradas: `${num(entradas)}${un}`,
          fim: `${ult.contagem}${un} (${dm(ult.data)})`,
          saida: `${num(saida)}${un}`,
        })
      }
      if (linhas.length > 0)
        resultado.push({ titulo: `${areaMap[m.area_id]?.nome ?? '—'} · ${m.nome}`, linhas })
    }
    if (resultado.length === 0) setErroBal('Nenhuma contagem registrada nesse período.')
    else setBalanco(resultado)
    setCalculando(false)
  }

  function baixarBalanco() {
    if (!balanco) return
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(`Balanço de estoque — ${dmy(inicio)} a ${dmy(fim)}`, 14, 16)
    doc.setFontSize(9)
    doc.text('saída estimada = contagem inicial + entradas − contagem final', 14, 22)
    let y = 30
    for (const m of balanco) {
      if (y > 260) {
        doc.addPage()
        y = 16
      }
      doc.setFontSize(11)
      doc.text(m.titulo, 14, y)
      autoTable(doc, {
        startY: y + 3,
        head: [['produto', 'início', 'entradas', 'fim', 'saída']],
        body: m.linhas.map((l) => [l.produto, l.inicio, l.entradas, l.fim, l.saida]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [47, 111, 79] },
        margin: { left: 14, right: 14 },
      })
      // @ts-expect-error jspdf-autotable adiciona lastAutoTable ao doc
      y = doc.lastAutoTable.finalY + 10
    }
    doc.save(`balanco-${inicio}-a-${fim}.pdf`)
  }

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

      <h2 className="display mb-2 mt-10 text-lg font-medium">balanço de estoque</h2>
      <p className="mb-4 text-sm text-ink-soft">
        Compara a primeira e a última contagem do período. Saída = início + entradas − fim.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">data inicial</span>
          <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
            className="w-full rounded border border-line bg-paper px-2 py-2 text-sm outline-none focus:border-ink" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-soft">data final</span>
          <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
            className="w-full rounded border border-line bg-paper px-2 py-2 text-sm outline-none focus:border-ink" />
        </label>
      </div>
      {erroBal && (
        <p className="mb-4 rounded border border-warn-soft bg-warn-soft px-3 py-2 text-xs text-warn">{erroBal}</p>
      )}
      <button onClick={calcularBalanco} disabled={calculando}
        className="w-full rounded bg-ink py-2 text-sm font-medium text-paper disabled:opacity-50">
        {calculando ? 'calculando…' : 'calcular balanço'}
      </button>

      {balanco && (
        <div className="mt-6 space-y-6">
          {balanco.map((m) => (
            <div key={m.titulo}>
              <h3 className="mb-2 text-sm font-medium">{m.titulo}</h3>
              <div className="overflow-x-auto rounded border border-line">
                <table className="w-full min-w-[480px] text-xs">
                  <thead className="bg-paper-dim/40 text-left text-ink-soft">
                    <tr>{['produto', 'início', 'entradas', 'fim', 'saída'].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {m.linhas.map((l) => (
                      <tr key={l.produto}>
                        <td className="px-2 py-1.5">{l.produto}</td>
                        <td className="px-2 py-1.5">{l.inicio}</td>
                        <td className="px-2 py-1.5">{l.entradas}</td>
                        <td className="px-2 py-1.5">{l.fim}</td>
                        <td className={`px-2 py-1.5 ${l.saida.startsWith('precisa') ? 'text-ink-soft' : 'font-medium'}`}>{l.saida}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <button onClick={baixarBalanco}
            className="w-full rounded border border-ink py-2 text-sm font-medium text-ink">
            baixar PDF do balanço
          </button>
        </div>
      )}
    </div>
  )
}

interface BalancoLinha { produto: string; inicio: string; entradas: string; fim: string; saida: string }
interface BalancoModelo { titulo: string; linhas: BalancoLinha[] }
const dm = (d: string) => format(new Date(d + 'T00:00:00'), 'dd/MM')
const dmy = (d: string) => format(new Date(d + 'T00:00:00'), 'dd/MM/yyyy')
const num = (n: number) => String(Math.round(n * 1000) / 1000)
