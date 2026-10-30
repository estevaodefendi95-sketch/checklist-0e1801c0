import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  ALTURA_A4,
  APOIO,
  LARGURA_A4,
  LINHA_ALTERNADA,
  Logo,
  MARGEM,
  MOCHA,
  MOCHA_CLARO,
  RESERVA_RODAPE,
  RESTAURANTE,
  TINTA,
  carregarLogo,
} from './cotacaoPdf'
import { Secao } from './estoqueRelatorio'

// tons de destaque (os mesmos da tela: warn e alert)
const AVISO: [number, number, number] = [138, 90, 18]
const ALERTA: [number, number, number] = [154, 52, 18]

export interface RelatorioPdf {
  titulo: string
  /** período e filtro */
  subtitulo: string
  nota?: string
  secoes: Secao[]
}

/** Monta um relatório em tabelas no layout da cotação (A4 retrato). Não salva. */
export function montarRelatorioPdf(r: RelatorioPdf, data: Date, logo: Logo | null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const direita = LARGURA_A4 - MARGEM
  const dataBR = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // ---------- cabeçalho ----------
  if (logo) {
    const altura = 18
    const largura = Math.min((logo.largura / logo.altura) * altura, 70)
    doc.addImage(logo.dataUrl, MARGEM, 12, largura, altura)
  } else {
    doc.setFont('times', 'bold')
    doc.setFontSize(28)
    doc.setTextColor(...MOCHA)
    doc.text('Paggio', MARGEM, 25)
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...TINTA)
  doc.text(r.titulo, direita, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...APOIO)
  doc.text(`Emitido em ${dataBR}`, direita, 26, { align: 'right' })

  doc.setDrawColor(...MOCHA_CLARO)
  doc.setLineWidth(0.6)
  doc.line(MARGEM, 34, direita, 34)

  doc.setFontSize(10)
  doc.setTextColor(...TINTA)
  doc.text(r.subtitulo, MARGEM, 42)
  let y = 42
  if (r.nota) {
    doc.setFontSize(8.5)
    doc.setTextColor(...APOIO)
    doc.text(r.nota, MARGEM, y + 5)
    y += 5
  }
  y += 10

  // ---------- uma tabela por seção ----------
  for (const s of r.secoes) {
    if (y + 24 > ALTURA_A4 - RESERVA_RODAPE) {
      doc.addPage()
      y = 20
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...TINTA)
    doc.text(s.titulo, MARGEM, y)
    const linhas = s.linhas.length ? s.linhas : [{ celulas: ['Nada a mostrar.'] }]
    autoTable(doc, {
      startY: y + 3,
      margin: { left: MARGEM, right: MARGEM, top: 18, bottom: RESERVA_RODAPE },
      head: [s.colunas],
      body: linhas.map((l) =>
        'naoConcluida' in l && l.naoConcluida ? [`${l.celulas[0]} (não concluída)`, ...l.celulas.slice(1)] : l.celulas
      ),
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        textColor: TINTA,
        valign: 'middle',
        cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
        lineColor: MOCHA_CLARO,
        lineWidth: { bottom: 0.2 },
      },
      headStyles: { fontStyle: 'bold', fillColor: MOCHA_CLARO, textColor: TINTA, fontSize: 8.5 },
      alternateRowStyles: { fillColor: LINHA_ALTERNADA },
      didParseCell: (c) => {
        if (c.section !== 'body') return
        const tom = (linhas[c.row.index] as { tom?: string }).tom
        if (tom === 'aviso') c.cell.styles.textColor = AVISO
        else if (tom === 'alerta') c.cell.styles.textColor = ALERTA
        else if (tom === 'suave' || !s.linhas.length) c.cell.styles.textColor = APOIO
      },
    })
    // @ts-expect-error jspdf-autotable adiciona lastAutoTable ao doc
    y = doc.lastAutoTable.finalY + 10
  }

  // ---------- rodapé em todas as páginas ----------
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    const yr = ALTURA_A4 - 10
    doc.setDrawColor(...MOCHA_CLARO)
    doc.setLineWidth(0.3)
    doc.line(MARGEM, yr - 5, direita, yr - 5)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...APOIO)
    doc.text(RESTAURANTE, MARGEM, yr)
    doc.text(`Página ${p} de ${total}`, direita, yr, { align: 'right' })
  }
  return doc
}

/** gera e baixa o PDF */
export async function baixarRelatorioPdf(r: RelatorioPdf, arquivo: string) {
  const logo = await carregarLogo()
  montarRelatorioPdf(r, new Date(), logo).save(arquivo)
}
