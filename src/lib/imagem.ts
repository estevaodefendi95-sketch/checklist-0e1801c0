/** Reduz a imagem para a largura máxima (JPEG) quando for maior; senão devolve o arquivo como está. */
export async function reduzir(arquivo: File, larg = 1600): Promise<File> {
  const img = await createImageBitmap(arquivo)
  try {
    if (img.width <= larg) return arquivo
    const c = document.createElement('canvas')
    c.width = larg; c.height = Math.round((img.height * larg) / img.width)
    const ctx = c.getContext('2d'); if (!ctx) return arquivo
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.85))
    return blob ? new File([blob], arquivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : arquivo
  } finally { img.close() }
}
