// localStorage pode falhar (aba anônima, dados bloqueados): tudo aqui é
// conveniência do aparelho, então qualquer erro vira o valor padrão.

/** `bruto` = guardado como texto puro, sem JSON (mantém chaves antigas compatíveis) */
export function ler<T>(chave: string, padrao: T, bruto = false): T {
  try {
    const v = localStorage.getItem(chave)
    if (v == null) return padrao
    return bruto ? (v as T) : (JSON.parse(v) as T)
  } catch {
    return padrao
  }
}

export function gravar(chave: string, valor: unknown, bruto = false) {
  try {
    localStorage.setItem(chave, bruto ? String(valor) : JSON.stringify(valor))
  } catch {
    // sem armazenamento: a escolha vale só nesta sessão
  }
}

// ---------- fichas favoritas e usadas hoje (por aparelho) ----------
const FAVORITAS = 'paggio-fichas-favoritas'
const USADAS = 'paggio-fichas-usadas'

const hoje = () => new Date().toLocaleDateString('sv-SE') // aaaa-mm-dd local

export function fichasFavoritas(): string[] {
  const v = ler<unknown>(FAVORITAS, [])
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
}

export function alternarFavorita(id: string): string[] {
  const atual = fichasFavoritas()
  const nova = atual.includes(id) ? atual.filter((x) => x !== id) : [id, ...atual]
  gravar(FAVORITAS, nova)
  return nova
}

/** ids abertos no modo cozinha hoje, do mais recente para o mais antigo */
export function fichasUsadasHoje(): string[] {
  const v = ler<{ data?: string; ids?: unknown }>(USADAS, {})
  return v.data === hoje() && Array.isArray(v.ids) ? v.ids.filter((x) => typeof x === 'string') : []
}

export function registrarUsoFicha(id: string) {
  const ids = [id, ...fichasUsadasHoje().filter((x) => x !== id)].slice(0, 12)
  gravar(USADAS, { data: hoje(), ids })
}
