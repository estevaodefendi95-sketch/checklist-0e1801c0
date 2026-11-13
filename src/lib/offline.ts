import { useEffect, useState } from 'react'
import { db } from './supabase'
import { ler, gravar } from './armazenamento'

// ---------- cache de leitura (cardápio, salão, comandas) ----------
const PREF = 'paggio-cache:'
export function cacheGravar(chave: string, valor: unknown) {
  gravar(PREF + chave, { t: Date.now(), v: valor })
}
export function cacheLer<T>(chave: string): { t: number; v: T } | null {
  return ler<{ t: number; v: T } | null>(PREF + chave, null)
}

// ---------- fila de pedidos sem internet ----------
const FILA = 'paggio-fila-pedidos'
export interface PedidoPendente {
  chave: string
  comanda_id: string
  criado: number
  linhas: Record<string, unknown>[]
}
export const filaLer = () => ler<PedidoPendente[]>(FILA, [])
const filaGravar = (f: PedidoPendente[]) => {
  gravar(FILA, f)
  window.dispatchEvent(new Event('paggio-fila'))
}

export function enfileirarPedido(comanda_id: string, linhas: Record<string, unknown>[]) {
  const chave = crypto.randomUUID()
  filaGravar([...filaLer(), { chave, comanda_id, criado: Date.now(), linhas }])
}

/** erro de rede (sem conexão) em vez de erro do banco (permissão, dado inválido) */
export function erroDeRede(e: { message?: string; code?: string } | null | undefined) {
  if (!e) return false
  if (!navigator.onLine) return true
  return /failed to fetch|networkerror|load failed|network request failed|timeout/i.test(e.message ?? '')
}

let enviando = false
/** Reenvia a fila em ordem. Itens já enviados são ignorados pela chave. */
export async function enviarFila(): Promise<number> {
  if (enviando) return 0
  enviando = true
  let enviados = 0
  try {
    for (const p of filaLer()) {
      const linhas = p.linhas.map((l, i) => ({ ...l, chave_offline: `${p.chave}:${i}` }))
      const { error } = await db.from('pdv_pedido_itens').upsert(linhas, { onConflict: 'chave_offline', ignoreDuplicates: true })
      if (error) {
        if (erroDeRede(error)) break // ainda sem rede: tenta depois
        // erro de verdade (ex.: comanda fechada): guarda como "com problema" e segue
        gravar(FILA + '-erro', [...ler<PedidoPendente[]>(FILA + '-erro', []), { ...p, motivo: error.message }])
      }
      filaGravar(filaLer().filter((x) => x.chave !== p.chave))
      if (!error) enviados++
    }
  } finally {
    enviando = false
  }
  return enviados
}

export const filaComProblema = () => ler<(PedidoPendente & { motivo?: string })[]>(FILA + '-erro', [])
export function limparProblemas() {
  gravar(FILA + '-erro', [])
  window.dispatchEvent(new Event('paggio-fila'))
}

export function useFila() {
  const [n, setN] = useState(() => filaLer())
  useEffect(() => {
    const f = () => setN(filaLer())
    window.addEventListener('paggio-fila', f)
    return () => window.removeEventListener('paggio-fila', f)
  }, [])
  return n
}

export function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine)
  useEffect(() => {
    const a = () => setOn(true)
    const b = () => setOn(false)
    window.addEventListener('online', a)
    window.addEventListener('offline', b)
    return () => {
      window.removeEventListener('online', a)
      window.removeEventListener('offline', b)
    }
  }, [])
  return on
}
