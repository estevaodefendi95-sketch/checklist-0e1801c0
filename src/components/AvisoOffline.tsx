import { useEffect, useState } from 'react'
import { enviarFila, filaComProblema, limparProblemas, useFila, useOnline } from '../lib/offline'

/** Faixa no topo: sem conexão, pedidos na fila e reenvio automático ao voltar a internet. */
export function AvisoOffline() {
  const on = useOnline()
  const fila = useFila()
  const [ok, setOk] = useState(0)
  const [, forca] = useState(0)
  const problemas = filaComProblema()

  useEffect(() => {
    const tentar = async () => {
      if (!navigator.onLine || !fila.length) return
      const n = await enviarFila()
      if (n) { setOk(n); setTimeout(() => setOk(0), 6000) }
      forca((x) => x + 1)
    }
    tentar()
    const iv = setInterval(tentar, 15000)
    window.addEventListener('online', tentar)
    return () => { clearInterval(iv); window.removeEventListener('online', tentar) }
  }, [fila.length, on])

  if (on && !fila.length && !ok && !problemas.length) return null
  const cls = !on ? 'bg-amber-500 text-black' : problemas.length ? 'bg-alert text-white' : fila.length ? 'bg-amber-400 text-black' : 'bg-emerald-600 text-white'
  return (
    <div role="status" className={`sticky top-0 z-50 px-4 py-2 text-center text-sm font-semibold ${cls}`}>
      {!on && <>Sem conexão — você pode continuar lançando pedidos nas comandas abertas. {fila.length ? `${fila.length} na fila.` : ''}</>}
      {on && fila.length > 0 && <>Enviando {fila.length} pedido(s) guardado(s)…</>}
      {on && !fila.length && ok > 0 && <>Conexão de volta: {ok} pedido(s) enviado(s) para a cozinha.</>}
      {on && !fila.length && !ok && problemas.length > 0 && (
        <>
          {problemas.length} pedido(s) guardado(s) não puderam ser enviados (ex.: comanda já fechada): {problemas.map((p) => p.linhas.map((l) => `${l.qtd}× ${l.nome}`).join(', ')).join(' | ')}.{' '}
          <button className="underline" onClick={() => { limparProblemas(); forca((x) => x + 1) }}>Entendi</button>
        </>
      )}
    </div>
  )
}
