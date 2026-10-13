import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { haAlteracoesPendentes } from '../components/Alteracoes'

// Atualização do app instalado (PWA).
// O service worker novo fica esperando ("prompt"). Quando ele chega:
//  - sem alterações não salvas: troca e recarrega sozinho, uma vez;
//  - com alterações: mostra o aviso "Nova versão disponível" e espera o clique.

const VERIFICAR_A_CADA = 30 * 60 * 1000 // 30 min
const MARCA_RECARGA = 'paggio-recarregou-em'

let disponivel = false
let aplicar: ((recarregar?: boolean) => Promise<void>) | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

/** evita loop: no máximo uma recarga automática a cada 60 s */
function podeRecarregarSozinho() {
  try {
    const ultima = Number(sessionStorage.getItem(MARCA_RECARGA) ?? 0)
    if (Date.now() - ultima < 60_000) return false
    sessionStorage.setItem(MARCA_RECARGA, String(Date.now()))
  } catch {
    // sem sessionStorage: segue, o service worker já estará ativo na próxima abertura
  }
  return true
}

export function iniciarAtualizacao() {
  if (!('serviceWorker' in navigator)) return

  aplicar = registerSW({
    immediate: true,
    onNeedRefresh() {
      disponivel = true
      avisar()
      if (!haAlteracoesPendentes() && podeRecarregarSozinho()) aplicar?.(true)
    },
    onRegisteredSW(_url, registro) {
      if (!registro) return
      // o navegador só procura sw.js novo ao abrir a página; um app instalado
      // fica aberto o dia todo, então verificamos de tempos em tempos
      const verificar = () => {
        if (navigator.onLine) registro.update().catch(() => {})
      }
      setInterval(verificar, VERIFICAR_A_CADA)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') verificar()
      })
      window.addEventListener('online', verificar)
    },
  })
}

/** botão "Atualizar" do aviso */
export function atualizarAgora() {
  if (haAlteracoesPendentes() && !window.confirm('Há alterações não salvas. Atualizar agora e perder as alterações?')) return
  if (aplicar) aplicar(true)
  else window.location.reload()
}

export function useNovaVersao() {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      return () => ouvintes.delete(f)
    },
    () => disponivel
  )
}

const dataBuild = new Date(__APP_BUILD__)
export const VERSAO = [
  __APP_COMMIT__,
  `${dataBuild.toLocaleDateString('pt-BR')} ${dataBuild.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
]
  .filter(Boolean)
  .join(' · ')
