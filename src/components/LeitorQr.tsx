import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

// Leitor de QR Code pela câmera do tablet (BarcodeDetector quando existe; jsQR como alternativa).
export function LeitorQr({ onLido, onCancelar, titulo, camera = 'environment' }: { onLido: (texto: string) => void; onCancelar: () => void; titulo?: string; camera?: 'user' | 'environment' }) {
  const video = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState('')
  const [cam, setCam] = useState<'user' | 'environment'>(camera) // 'user' = câmera de selfie (frontal)
  const cb = useRef(onLido)
  useEffect(() => { cb.current = onLido })
  useEffect(() => {
    let parado = false
    let stream: MediaStream | null = null
    let raf = 0
    const canvas = document.createElement('canvas')
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cam } }, audio: false })
        if (parado || !video.current) return
        video.current.srcObject = stream
        await video.current.play()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Det = (window as any).BarcodeDetector
        const det = Det ? new Det({ formats: ['qr_code'] }) : null
        const ler = async () => {
          if (parado || !video.current) return
          const v = video.current
          if (v.readyState >= 2 && v.videoWidth) {
            let texto = ''
            if (det) { try { const r = await det.detect(v); texto = r[0]?.rawValue ?? '' } catch { /* tenta de novo */ } }
            else {
              canvas.width = v.videoWidth; canvas.height = v.videoHeight
              const ctx = canvas.getContext('2d', { willReadFrequently: true })
              if (ctx) { ctx.drawImage(v, 0, 0); const img = ctx.getImageData(0, 0, canvas.width, canvas.height); texto = jsQR(img.data, img.width, img.height)?.data ?? '' }
            }
            if (texto) { parado = true; cb.current(texto); return }
          }
          raf = window.setTimeout(ler, 250)
        }
        ler()
      } catch { setErro('Não consegui abrir a câmera. Permita o acesso à câmera ou chame o garçom.') }
    })()
    return () => { parado = true; clearTimeout(raf); stream?.getTracks().forEach((t) => t.stop()) }
  }, [cam])
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4 text-white">
      <h2 className="text-center text-xl font-semibold">{titulo ?? 'Aponte a câmera para o QR Code da sua mesa'}</h2>
      {erro ? <p className="max-w-sm text-center text-sm">{erro}</p> : (
        <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border-4 border-white/70">
          <video ref={video} playsInline muted className="aspect-square w-full object-cover" style={cam === 'user' ? { transform: 'scaleX(-1)' } : undefined} />
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-dashed border-white/80" />
        </div>
      )}
      <p className="max-w-sm text-center text-sm opacity-80">Segure o cartão da comanda de frente para a câmera, bem iluminado. Ao ler, enviamos o pedido para a sua comanda.</p>
      <div className="flex gap-3">
        <button className="min-h-[48px] rounded-xl border border-white/60 px-6" onClick={() => { setErro(''); setCam((c) => (c === 'user' ? 'environment' : 'user')) }}>Trocar câmera</button>
        <button className="min-h-[48px] rounded-xl border border-white/60 px-6" onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  )
}
