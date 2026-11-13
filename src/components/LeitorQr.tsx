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
    <div className="fixed inset-0 z-50 bg-black text-white">
      <style>{`@keyframes qr-varrer{0%{top:6%}50%{top:92%}100%{top:6%}}`}</style>
      {!erro && <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" style={cam === 'user' ? { transform: 'scaleX(-1)' } : undefined} />}
      {/* moldura: escurece em volta e destaca o quadrado de leitura */}
      {!erro && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(72vw,52vh,420px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.62)]">
          {['left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-3xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-3xl'].map((c) => (
            <span key={c} className={`absolute h-14 w-14 border-emerald-400 ${c}`} />
          ))}
          <span className="absolute inset-x-4 h-0.5 rounded-full bg-emerald-400/90 shadow-[0_0_12px_2px_rgba(52,211,153,0.8)]" style={{ animation: 'qr-varrer 2.4s ease-in-out infinite' }} />
        </div>
      )}
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent p-5 pt-8">
        <h2 className="mx-auto max-w-md text-center text-xl font-semibold drop-shadow">{titulo ?? 'Aponte a câmera para o QR Code da sua mesa'}</h2>
      </div>
      {erro && <p className="absolute inset-0 grid place-items-center p-8 text-center text-base">{erro}</p>}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-black/85 to-transparent p-5 pb-8">
        <p className="max-w-sm text-center text-sm opacity-90">Encaixe o QR Code do cartão dentro da moldura, com boa luz. A leitura é automática.</p>
        <div className="flex gap-3">
          <button className="min-h-[52px] rounded-xl border border-white/70 bg-black/30 px-6 backdrop-blur" onClick={() => { setErro(''); setCam((c) => (c === 'user' ? 'environment' : 'user')) }}>Trocar câmera</button>
          <button className="min-h-[52px] rounded-xl border border-white/70 bg-black/30 px-6 backdrop-blur" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
