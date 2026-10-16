import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

/** item da cotação: só nome e unidade (nenhum preço ou custo do sistema vai para o fornecedor) */
export interface ItemCotacao {
  nome: string
  unidade: string
}

/** logo já carregado como data URL, com as proporções */
export interface Logo {
  dataUrl: string
  largura: number
  altura: number
}

const RESTAURANTE = 'Paggio Gastro Bar, Franca/SP'
const RODAPE = 'Por favor, devolva com o preço unitário e a validade da proposta.'

// paleta da marca (mocha)
const TINTA: [number, number, number] = [42, 33, 28]
const APOIO: [number, number, number] = [110, 98, 90]
const MOCHA: [number, number, number] = [92, 74, 62]
const MOCHA_CLARO: [number, number, number] = [239, 231, 224]
const LINHA_ALTERNADA: [number, number, number] = [250, 247, 244]

const MARGEM = 15
const LARGURA_A4 = 210
const ALTURA_A4 = 297
const RESERVA_RODAPE = 20

/** "Hortifrúti São João" → "hortifruti-sao-joao" */
export function slugArquivo(texto: string) {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'fornecedor'
  )
}

/** tenta carregar /logo-paggio.png; devolve null se não existir (o servidor pode responder com o index.html) */
export async function carregarLogo(url = '/logo-paggio.png'): Promise<Logo | null> {
  try {
    const r = await fetch(url, { cache: 'no-cache' })
    if (!r.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) return null
    const blob = await r.blob()
    const dataUrl = await new Promise<string>((ok, falha) => {
      const leitor = new FileReader()
      leitor.onload = () => ok(String(leitor.result))
      leitor.onerror = () => falha(leitor.error)
      leitor.readAsDataURL(blob)
    })
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    return { dataUrl, largura: img.naturalWidth, altura: img.naturalHeight }
  } catch {
    return null
  }
}

/** Monta o PDF "Pedido de cotação" (A4 retrato). Não salva: quem chama decide. */
export function montarCotacaoPdf(fornecedor: string, itens: ItemCotacao[], data: Date, logo: Logo | null) {
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
  doc.text('Pedido de cotação', direita, 20, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...APOIO)
  doc.text(`Emitido em ${dataBR}`, direita, 26, { align: 'right' })

  doc.setDrawColor(...MOCHA_CLARO)
  doc.setLineWidth(0.6)
  doc.line(MARGEM, 34, direita, 34)

  // ---------- fornecedor e restaurante ----------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...TINTA)
  const nomeLinhas = doc.splitTextToSize(fornecedor, direita - MARGEM) as string[]
  doc.text(nomeLinhas, MARGEM, 44)
  let y = 44 + (nomeLinhas.length - 1) * 6.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Para: ${fornecedor}`, MARGEM, y + 7)
  doc.setFontSize(9)
  doc.setTextColor(...APOIO)
  doc.text(`De: ${RESTAURANTE}`, MARGEM, y + 12.5)
  y += 20

  // ---------- tabela ----------
  autoTable(doc, {
    startY: y,
    margin: { left: MARGEM, right: MARGEM, top: 18, bottom: RESERVA_RODAPE },
    head: [['Nº', 'Produto', 'Unidade de compra', 'Quantidade desejada', 'Preço unitário cotado', 'Observação']],
    body: itens.map((i, n) => [String(n + 1), i.nome, i.unidade === 'l' ? 'L' : i.unidade, '', '', '']),
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      textColor: TINTA,
      minCellHeight: 10,
      valign: 'middle',
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      lineColor: MOCHA_CLARO,
      lineWidth: { bottom: 0.2 },
    },
    headStyles: {
      fontStyle: 'bold',
      fillColor: MOCHA_CLARO,
      textColor: TINTA,
      fontSize: 8.5,
      minCellHeight: 10,
    },
    alternateRowStyles: { fillColor: LINHA_ALTERNADA },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 58 },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 30 },
      4: { cellWidth: 32 },
      5: { cellWidth: 'auto' },
    },
    // linha para escrever à mão em quantidade e preço
    didDrawCell: (c) => {
      if (c.section !== 'body' || (c.column.index !== 3 && c.column.index !== 4)) return
      const yl = c.cell.y + c.cell.height - 2.5
      doc.setDrawColor(...APOIO)
      doc.setLineWidth(0.2)
      doc.line(c.cell.x + 3, yl, c.cell.x + c.cell.width - 3, yl)
    },
  })

  // ---------- validade e assinatura ----------
  // @ts-expect-error jspdf-autotable adiciona lastAutoTable ao doc
  let yf: number = doc.lastAutoTable.finalY + 14
  if (yf + 22 > ALTURA_A4 - RESERVA_RODAPE) {
    doc.addPage()
    yf = 26
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...TINTA)
  doc.setDrawColor(...TINTA)
  doc.setLineWidth(0.2)
  const rotuloValidade = 'Validade da cotação:'
  doc.text(rotuloValidade, MARGEM, yf)
  const xv = MARGEM + doc.getTextWidth(rotuloValidade) + 2
  doc.line(xv, yf + 1, xv + 45, yf + 1)
  const rotuloAssinatura = 'Assinatura / carimbo do fornecedor:'
  doc.text(rotuloAssinatura, MARGEM, yf + 14)
  const xa = MARGEM + doc.getTextWidth(rotuloAssinatura) + 2
  doc.line(xa, yf + 15, direita, yf + 15)

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
    doc.text(RODAPE, MARGEM, yr)
    doc.text(`Página ${p} de ${total}`, direita, yr, { align: 'right' })
  }

  return doc
}

/** nome do arquivo: cotacao-[fornecedor]-AAAA-MM-DD.pdf, sem acentos */
export function nomeArquivoCotacao(fornecedor: string, data: Date) {
  const iso = [data.getFullYear(), String(data.getMonth() + 1).padStart(2, '0'), String(data.getDate()).padStart(2, '0')].join('-')
  return `cotacao-${slugArquivo(fornecedor)}-${iso}.pdf`
}

/** gera e baixa o PDF; devolve se o logo foi usado */
export async function baixarCotacaoPdf(fornecedor: string, itens: ItemCotacao[]) {
  const data = new Date()
  const logo = await carregarLogo()
  montarCotacaoPdf(fornecedor, itens, data, logo).save(nomeArquivoCotacao(fornecedor, data))
  return { comLogo: !!logo }
}
