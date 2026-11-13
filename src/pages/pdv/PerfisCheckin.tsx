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
export function calcularCobranca(perfis: Perfil[], cobrancas: Cobranca[], qtds: Record<string, number>, sel: string[]) {
  const dow = new Date().getDay()
  const linhas: { nome: string; qtd: number; unit: number; tipo: string }[] = []
  for (const c of cobrancas.filter((x) => x.ativo && x.valor > 0 && x.dias_semana.includes(dow) && sel.includes(x.id))) {
    for (const p of perfis) {
      const q = qtds[p.id] ?? 0
      if (q > 0 && p.percentual > 0) linhas.push({ nome: `${c.nome} (${p.nome})`, qtd: q, unit: Math.round(c.valor * p.percentual) / 100, tipo: c.tipo })
    }
  }
  return { linhas, total: linhas.reduce((s, l) => s + l.qtd * l.unit, 0) }
}

export function PerfisCheckin({
  perfis, cobrancas, qtds, onChange, sel, onSel,
}: { perfis: Perfil[]; cobrancas: Cobranca[]; qtds: Record<string, number>; onChange: (q: Record<string, number>) => void; sel: string[]; onSel: (ids: string[]) => void }) {
  const { linhas, total } = useMemo(() => calcularCobranca(perfis, cobrancas, qtds, sel), [perfis, cobrancas, qtds, sel])
  const hoje = cobrancas.filter((c) => c.ativo && c.valor > 0 && c.dias_semana.includes(new Date().getDay()))
  const pessoas = Object.values(qtds).reduce((s, n) => s + n, 0)
  const mudar = (id: string, d: number) => onChange({ ...qtds, [id]: Math.max(0, (qtds[id] ?? 0) + d) })
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Quem chegou</span>
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">{pessoas} {pessoas === 1 ? 'pessoa' : 'pessoas'}</span>
      </div>
      <div className="divide-y divide-line">
        {perfis.map((p) => {
          const q = qtds[p.id] ?? 0
          return (
            <div key={p.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0 text-sm font-medium leading-tight">{p.nome}<span className={`ml-2 text-[11px] font-normal ${p.percentual === 0 ? 'text-emerald-600' : 'text-ink-soft'}`}>{p.percentual === 0 ? 'não paga' : p.percentual < 100 ? `${p.percentual}%` : ''}</span></span>
              <span className="flex shrink-0 items-center gap-1.5">
                <button type="button" aria-label={`Menos ${p.nome}`} disabled={q === 0} className="h-10 w-10 rounded-lg border border-line text-xl disabled:opacity-30" onClick={() => mudar(p.id, -1)}>−</button>
                <span className="w-7 text-center text-lg font-bold tabular-nums">{q}</span>
                <button type="button" aria-label={`Mais ${p.nome}`} className="h-10 w-10 rounded-lg bg-brand text-xl text-brand-ink" onClick={() => mudar(p.id, 1)}>+</button>
              </span>
            </div>
          )
        })}
      </div>
      {hoje.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Lançar na comanda</span>
          <div className="flex flex-wrap gap-2">
            {hoje.map((c) => {
              const on = sel.includes(c.id)
              return (
                <button type="button" key={c.id} aria-pressed={on} onClick={() => onSel(on ? sel.filter((x) => x !== c.id) : [...sel, c.id])}
                  className={`min-h-[44px] rounded-xl border-2 px-4 text-sm font-medium ${on ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-soft'}`}>
                  {on ? '✓ ' : ''}{c.nome} · {reais(c.valor)}
                </button>
              )
            })}
          </div>
          {!sel.length && <p className="text-xs text-ink-soft">Nada será cobrado. Toque em couvert e/ou rodízio para lançar.</p>}
        </div>
      )}
      {linhas.length > 0 ? (
        <div className="rounded-xl bg-brand-soft p-2.5 text-xs">
          {linhas.map((l, i) => <div key={i} className="flex justify-between"><span>{l.qtd}× {l.nome}</span><span>{reais(l.qtd * l.unit)}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-brand/20 pt-1 font-semibold"><span>Total de couvert/rodízio</span><span>{reais(total)}</span></div>
        </div>
      ) : hoje.length === 0 ? (
        <p className="text-xs text-ink-soft">Sem couvert ou rodízio hoje (configure valores e dias em Configurações do PDV › Check-in).</p>
      ) : null}
    </div>
  )
}
