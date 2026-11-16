import { reais } from '../../lib/formato'
import { btnCls, cartaoCls } from '../../components/Estado'
import { Comanda, Mesa, Totais, minutosDesde, num } from '../../lib/pdv'
import { Modal } from './PdvCaixa'

/** Agrupa as comandas abertas por mesa (a mesa pode ter várias; o total da mesa é a soma delas). */
export function agruparPorMesa(comandas: Comanda[]) {
  const g = new Map<string, Comanda[]>()
  for (const c of comandas) if (c.mesa_id) g.set(c.mesa_id, [...(g.get(c.mesa_id) ?? []), c])
  for (const l of g.values()) l.sort((a, b) => a.numero - b.numero)
  return g
}
export const totalMesa = (l: Comanda[], totais: Record<string, Totais>) => l.reduce((s, c) => s + num(totais[c.id]?.total), 0)
export const statusMesa = (l: Comanda[]) => (l.length && l.every((c) => c.status === 'pedindo_conta') ? 'pedindo_conta' : 'aberta')

/** Lista as comandas de uma mesa com o valor de cada uma. */
export function ComandasDaMesa({ mesa, lista, totais, onAbrir, onNova, fechar }: {
  mesa: Mesa; lista: Comanda[]; totais: Record<string, Totais>; onAbrir: (id: string) => void; onNova: () => void; fechar: () => void
}) {
  return (
    <Modal titulo={`Mesa ${mesa.numero} · ${reais(totalMesa(lista, totais))}`} fechar={fechar}>
      <ul className={`${cartaoCls} divide-y divide-line overflow-hidden`}>
        {lista.map((c) => (
          <li key={c.id}>
            <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-dim" onClick={() => onAbrir(c.id)}>
              <span className="w-12 shrink-0 font-bold tabular-nums">#{c.numero}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.nome_cliente || 'Sem nome'}</span>
                <span className="block text-xs text-ink-soft">{minutosDesde(c.aberta_em)} min{c.status === 'pedindo_conta' ? ' · conta pedida' : ''}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{reais(totais[c.id]?.total)}</span>
            </button>
          </li>
        ))}
      </ul>
      <button className={btnCls + ' mt-3 w-full'} onClick={onNova}>+ Nova comanda nesta mesa</button>
    </Modal>
  )
}
