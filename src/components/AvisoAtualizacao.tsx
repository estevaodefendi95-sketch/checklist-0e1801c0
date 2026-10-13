import { atualizarAgora, useNovaVersao, VERSAO } from '../lib/atualizacao'

/** Faixa discreta no topo quando há versão nova esperando (aparece em todas as telas) */
export function AvisoAtualizacao() {
  const nova = useNovaVersao()
  if (!nova) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[calc(8px+env(safe-area-inset-top))]"
    >
      <div className="flex items-center gap-3 rounded-full bg-brand py-1.5 pl-4 pr-1.5 text-sm text-brand-ink shadow-[var(--shadow-sheet)]">
        <span>Nova versão disponível.</span>
        <button
          onClick={atualizarAgora}
          className="min-h-[36px] rounded-full bg-brand-ink px-4 text-sm font-semibold text-brand"
        >
          Atualizar
        </button>
      </div>
    </div>
  )
}

/** "versão 9a60532 · 13/10/2026 16:53" para conferir de longe qual build o aparelho usa */
export function LinhaVersao({ className = '' }: { className?: string }) {
  return <p className={`text-[11px] opacity-60 ${className}`}>versão {VERSAO}</p>
}
