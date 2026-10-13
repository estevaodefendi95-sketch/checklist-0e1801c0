import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router-dom'
import { btnCls, btnSecCls } from './Estado'

const AVISO = 'Há alterações não salvas. Sair mesmo assim e perder as alterações?'

/**
 * Avisa antes de sair da tela (navegação interna e fechar/recarregar a aba)
 * enquanto `sujo` for verdadeiro. `liberar()` desliga o aviso logo antes de
 * uma navegação intencional, como depois de salvar ou excluir.
 */
export function useAlteracoesPendentes(sujo: boolean) {
  const liberado = useRef(false)
  const ativo = sujo && !liberado.current

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      sujo && !liberado.current && currentLocation.pathname !== nextLocation.pathname
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(AVISO)) blocker.proceed()
    else blocker.reset()
  }, [blocker])

  useEffect(() => {
    if (!ativo) return
    const antes = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', antes)
    return () => window.removeEventListener('beforeunload', antes)
  }, [ativo])

  return {
    liberar: () => {
      liberado.current = true
    },
    /** para fechar painéis e gavetas: pergunta só se houver alterações */
    confirmarDescarte: () => !sujo || window.confirm(AVISO),
  }
}

/** Selo "● alterações não salvas" */
export function SeloAlteracoes({ texto = 'alterações não salvas' }: { texto?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-warn" role="status">
      <span className="h-2 w-2 rounded-full bg-warn" aria-hidden="true" />
      {texto}
    </span>
  )
}

/**
 * Barra de salvar no padrão da prévia: quando há alterações, mostra o selo
 * com fundo âmbar, "Descartar" e "Salvar alterações".
 */
export function BarraSalvar({
  sujo,
  salvando,
  onSalvar,
  onDescartar,
  rotulo = 'Salvar alterações',
  extra,
  fixa,
}: {
  sujo: boolean
  salvando?: boolean
  onSalvar: () => void
  onDescartar?: () => void
  rotulo?: string
  /** ações secundárias à esquerda (ex.: excluir) */
  extra?: React.ReactNode
  /** gruda no rodapé da tela, acima da barra inferior do celular */
  fixa?: boolean
}) {
  return (
    <div
      className={`${
        fixa ? 'sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 lg:bottom-4' : ''
      } flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-card ${
        sujo ? 'border-line border-l-4 border-l-warn bg-warn-soft' : 'border-line bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {sujo ? <SeloAlteracoes /> : <span className="apoio">tudo salvo</span>}
        {extra}
      </div>
      <div className="flex flex-wrap gap-2">
        {sujo && onDescartar && (
          <button type="button" onClick={onDescartar} disabled={salvando} className={btnSecCls}>
            Descartar
          </button>
        )}
        <button type="button" onClick={onSalvar} disabled={salvando || !sujo} className={btnCls}>
          {salvando ? 'Salvando…' : rotulo}
        </button>
      </div>
    </div>
  )
}
