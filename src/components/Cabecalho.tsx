import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icone } from './Icone'

/** Título da página com subtítulo, ações (o CTA) e "voltar" opcional */
export function Cabecalho({
  titulo,
  subtitulo,
  voltar,
  acoes,
  topo,
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  /** destino do botão voltar, com o rótulo */
  voltar?: { para: string; rotulo?: string }
  acoes?: ReactNode
  /** conteúdo entre o "voltar" e o título (ex.: foto) */
  topo?: ReactNode
}) {
  return (
    <header className="mb-6">
      {voltar && (
        <Link
          to={voltar.para}
          className="-ml-2 mb-1 inline-flex min-h-[44px] items-center gap-1 rounded-[10px] px-2 text-sm text-ink-soft hover:text-ink"
        >
          <Icone nome="voltar" tamanho={18} />
          {voltar.rotulo ?? 'voltar'}
        </Link>
      )}
      {topo && <div className="mb-4">{topo}</div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="titulo">{titulo}</h1>
          {subtitulo && <p className="apoio mt-1">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
    </header>
  )
}
