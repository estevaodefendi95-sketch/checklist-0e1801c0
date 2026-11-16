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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md" role="dialog" aria-modal="true" onClick={onCancelar}>
      <style>{`@keyframes qr-varrer{0%{top:6%}50%{top:92%}100%{top:6%}}`}</style>
      <div className="w-full max-w-[480px] rounded-[28px] bg-white p-6 text-center text-[#222] shadow-[0_30px_90px_rgba(0,0,0,0.85)] ring-4 ring-white/25" onClick={(x) => x.stopPropagation()}>
        <h2 className="text-2xl font-semibold leading-tight">{titulo ?? 'Aponte a câmera para o QR Code da sua mesa'}</h2>
        <div className="relative mx-auto mt-4 aspect-square w-[min(100%,52vh)] overflow-hidden rounded-2xl bg-black">
          {!erro && <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" style={cam === 'user' ? { transform: 'scaleX(-1)' } : undefined} />}
          {erro && <p className="absolute inset-0 grid place-items-center p-5 text-center text-sm text-white">{erro}</p>}
          {!erro && (
            <div className="pointer-events-none absolute inset-3">
              {['left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl'].map((c) => (
                <span key={c} className={`absolute h-10 w-10 border-emerald-400 ${c}`} />
              ))}
              <span className="absolute inset-x-3 h-0.5 rounded-full bg-emerald-400/90 shadow-[0_0_12px_2px_rgba(52,211,153,0.8)]" style={{ animation: 'qr-varrer 2.4s ease-in-out infinite' }} />
            </div>
          )}
        </div>
        <p className="mt-3 text-sm text-[#666]">Encaixe o QR Code do cartão na moldura. A leitura é automática.</p>
        <div className="mt-4 flex justify-center gap-3">
          <button className="min-h-[52px] rounded-xl border border-black/15 px-6 text-base font-medium active:bg-black/5" onClick={() => { setErro(''); setCam((c) => (c === 'user' ? 'environment' : 'user')) }}>Trocar câmera</button>
          <button className="min-h-[52px] rounded-xl bg-[#222] px-7 text-base font-medium text-white active:opacity-80" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
