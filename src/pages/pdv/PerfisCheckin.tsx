import { useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { reais } from '../../lib/formato'
import { btnSecCls } from '../../components/Estado'

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
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Quem chegou ({pessoas})</div>
      {perfis.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
          <span className="text-sm">{p.nome}{p.percentual < 100 && <em className="ml-1 text-xs text-ink-soft">({p.percentual === 0 ? 'não paga' : `paga ${p.percentual}%`})</em>}</span>
          <span className="flex items-center gap-2">
            <button type="button" className={btnSecCls + ' !min-h-[40px] !w-10 !px-0'} onClick={() => onChange({ ...qtds, [p.id]: Math.max(0, (qtds[p.id] ?? 0) - 1) })}>−</button>
            <b className="w-6 text-center">{qtds[p.id] ?? 0}</b>
            <button type="button" className={btnSecCls + ' !min-h-[40px] !w-10 !px-0'} onClick={() => onChange({ ...qtds, [p.id]: (qtds[p.id] ?? 0) + 1 })}>+</button>
          </span>
        </div>
      ))}
      {linhas.length > 0 ? (
        <div className="rounded-xl bg-brand-soft p-3 text-sm">
          {linhas.map((l, i) => <div key={i} className="flex justify-between"><span>{l.qtd}× {l.nome}</span><span>{reais(l.qtd * l.unit)}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-brand/20 pt-1 font-semibold"><span>Entra na comanda</span><span>{reais(total)}</span></div>
        </div>
      ) : (
        <p className="text-xs text-ink-soft">Sem couvert ou rodízio hoje (configure valores e dias em Configurações do PDV › Check-in).</p>
      )}
    </div>
  )
}
