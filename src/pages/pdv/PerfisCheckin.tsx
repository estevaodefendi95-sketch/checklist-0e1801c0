import { useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { reais } from '../../lib/formato'

export interface Perfil { id: string; nome: string; percentual: number; ordem: number; ativo: boolean }
export interface Cobranca { id: string; nome: string; tipo: 'couvert' | 'rodizio'; valor: number; dias_semana: number[]; ativo: boolean }

export function usePerfisCobrancas() {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [cobrancas, setCobrancas] = useState<Cobranca[]>([])
  const [exige, setExige] = useState(true)
  useEffect(() => {
    Promise.all([
      db.from('pdv_perfis').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_cobrancas').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_config').select('checkin_exige_perfil').eq('id', 1).single(),
    ]).then(([p, c, cfg]) => {
      setPerfis((p.data ?? []) as Perfil[])
      setCobrancas((c.data ?? []) as Cobranca[])
      setExige(cfg.data?.checkin_exige_perfil ?? true)
    })
  }, [])
  return { perfis, cobrancas, exige }
}

const NOME_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export const rotuloDias = (d: number[]) => (d.length === 7 ? 'todos os dias' : d.map((x) => NOME_DIA[x]).join(', '))

/** cobranças que valem hoje e quanto cada perfil paga (espelha a função pdv_aplicar_perfis do banco) */
export function calcularCobranca(perfis: Perfil[], cobrancas: Cobranca[], qtds: Record<string, number>) {
  const dow = new Date().getDay()
  const linhas: { nome: string; qtd: number; unit: number; tipo: string }[] = []
  for (const c of cobrancas.filter((x) => x.ativo && x.valor > 0 && x.dias_semana.includes(dow))) {
    for (const p of perfis) {
      const q = qtds[p.id] ?? 0
      if (q > 0 && p.percentual > 0) linhas.push({ nome: `${c.nome} (${p.nome})`, qtd: q, unit: Math.round(c.valor * p.percentual) / 100, tipo: c.tipo })
    }
  }
  return { linhas, total: linhas.reduce((s, l) => s + l.qtd * l.unit, 0) }
}

export function PerfisCheckin({
  perfis, cobrancas, qtds, onChange,
}: { perfis: Perfil[]; cobrancas: Cobranca[]; qtds: Record<string, number>; onChange: (q: Record<string, number>) => void }) {
  const { linhas, total } = useMemo(() => calcularCobranca(perfis, cobrancas, qtds), [perfis, cobrancas, qtds])
  const pessoas = Object.values(qtds).reduce((s, n) => s + n, 0)
  const mudar = (id: string, d: number) => onChange({ ...qtds, [id]: Math.max(0, (qtds[id] ?? 0) + d) })
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Quem chegou</span>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">{pessoas} {pessoas === 1 ? 'pessoa' : 'pessoas'}</span>
      </div>
      <div className="grid auto-rows-fr grid-cols-2 gap-2">
        {perfis.map((p) => {
          const q = qtds[p.id] ?? 0
          return (
            <div key={p.id} className={`relative flex flex-col items-center justify-between rounded-2xl border-2 p-3 text-center transition-colors [&:last-child:nth-child(odd)]:col-span-2 ${q > 0 ? 'border-brand bg-brand-soft' : 'border-line bg-surface'}`}>
              <button type="button" onClick={() => mudar(p.id, 1)} className="w-full">
                <span className="flex min-h-[2.5rem] items-center justify-center text-base font-semibold leading-tight">{p.nome}</span>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${p.percentual === 0 ? 'bg-emerald-100 text-emerald-800' : p.percentual < 100 ? 'bg-amber-100 text-amber-800' : 'bg-surface text-ink-soft ring-1 ring-line'}`}>
                  {p.percentual === 0 ? 'não paga' : p.percentual < 100 ? `paga ${p.percentual}%` : 'paga inteiro'}
                </span>
                <span className="mt-2 block text-4xl font-bold leading-none">{q}</span>
              </button>
              <div className="mt-3 flex w-full gap-2">
                <button type="button" aria-label={`Menos ${p.nome}`} disabled={q === 0} className="min-h-[48px] flex-1 rounded-xl border border-line bg-white text-2xl disabled:opacity-30" onClick={() => mudar(p.id, -1)}>−</button>
                <button type="button" aria-label={`Mais ${p.nome}`} className="min-h-[48px] flex-1 rounded-xl bg-brand text-2xl text-brand-ink" onClick={() => mudar(p.id, 1)}>+</button>
              </div>
            </div>
          )
        })}
      </div>
      {linhas.length > 0 ? (
        <div className="rounded-xl bg-brand-soft p-3 text-sm">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">Entra na comanda</div>
          {linhas.map((l, i) => <div key={i} className="flex justify-between"><span>{l.qtd}× {l.nome}</span><span>{reais(l.qtd * l.unit)}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-brand/20 pt-1 font-semibold"><span>Total de couvert/rodízio</span><span>{reais(total)}</span></div>
        </div>
      ) : (
        <p className="text-xs text-ink-soft">Sem couvert ou rodízio hoje (configure valores e dias em Configurações do PDV › Check-in).</p>
      )}
    </div>
  )
}
