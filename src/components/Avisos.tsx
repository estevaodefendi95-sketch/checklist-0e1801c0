import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, supabase } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { Icone } from './Icone'
import { ALERTA_ESTILO, type TipoAlerta } from './Estado'

export interface Aviso {
  id: string; tipo: string; nivel: 'info' | 'aviso' | 'erro'; titulo: string; mensagem: string | null
  lida: boolean; criado_em: string
}
const COR = { info: 'border-brand/30', aviso: 'border-warn', erro: 'border-alert' } as const
const TIPO: Record<Aviso['nivel'], { t: TipoAlerta; rotulo: string }> = { info: { t: 'info', rotulo: 'Informação' }, aviso: { t: 'aviso', rotulo: 'Atenção' }, erro: { t: 'erro', rotulo: 'Erro' } }

/** Avisos do PDV (cancelamentos, erros de impressão/fiscal, estornos) em tempo real. */
export function useAvisos(ativo: boolean) {
  const [lista, setLista] = useState<Aviso[]>([])
  const [novo, setNovo] = useState<Aviso | null>(null)
  const vistos = useRef<Set<string> | null>(null)
  const carregar = useCallback(async () => {
    const { data } = await db.from('pdv_notificacoes').select('*').order('criado_em', { ascending: false }).limit(60)
    const l = (data ?? []) as Aviso[]
    setLista(l)
    if (vistos.current === null) vistos.current = new Set(l.map((x) => x.id))
    else {
      const nv = l.find((x) => !vistos.current!.has(x.id) && !x.lida)
      l.forEach((x) => vistos.current!.add(x.id))
      if (nv) setNovo(nv)
    }
  }, [])
  useEffect(() => {
    if (!ativo) return
    carregar()
    const canal = supabase.channel('avisos-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'checklist', table: 'pdv_notificacoes' }, () => carregar()).subscribe()
    const iv = setInterval(carregar, 30000)
    return () => { clearInterval(iv); supabase.removeChannel(canal) }
  }, [ativo, carregar])
  useEffect(() => { if (novo) { const t = setTimeout(() => setNovo(null), 9000); return () => clearTimeout(t) } }, [novo])

  async function marcar(ids: string[]) {
    if (!ids.length) return
    const uid = (await supabase.auth.getUser()).data.user?.id
    await db.from('pdv_notificacoes').update({ lida: true, lida_por: uid, lida_em: new Date().toISOString() }).in('id', ids)
    carregar()
  }
  return { lista, naoLidas: lista.filter((x) => !x.lida), novo, fecharNovo: () => setNovo(null), marcar }
}

export const Quando = ({ v }: { v: string }) => {
  const m = Math.round((Date.now() - new Date(v).getTime()) / 60000)
  return <>{m < 1 ? 'agora' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : new Date(v).toLocaleDateString('pt-BR')}</>
}

export function ItemAviso({ a, marcar }: { a: Aviso; marcar: (ids: string[]) => void }) {
  const k = TIPO[a.nivel] ?? TIPO.info
  const e = ALERTA_ESTILO[k.t]
  return (
    <li className={`flex gap-3 px-4 py-3.5 ${a.lida ? 'opacity-55' : ''}`}>
      <span aria-hidden className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${e.badge}`}>{e.simbolo}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-soft">
          <span className="font-semibold">{k.rotulo}</span><span>·</span><span><Quando v={a.criado_em} /></span>
          {!a.lida && <span className="ml-auto h-2 w-2 rounded-full bg-alert" aria-label="não lido" />}
        </div>
        <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{a.titulo}</p>
        {a.mensagem && <p className="mt-1 whitespace-pre-line rounded-lg bg-paper-dim px-3 py-2 text-sm leading-relaxed text-ink-soft">{a.mensagem}</p>}
        {!a.lida && <button className="mt-2 text-xs font-medium text-brand underline" onClick={() => marcar([a.id])}>marcar como lido</button>}
      </div>
    </li>
  )
}

/** Sino com contador e painel suspenso; mostra um balão quando chega um aviso novo. */
export function Sino({ className = '', rotulo }: { className?: string; rotulo?: boolean }) {
  const { pode } = usePermissoes()
  const av = useAvisos(pode('pdv_operar'))
  const [aberto, setAberto] = useState(false)
  if (!pode('pdv_operar')) return null
  const n = av.naoLidas.length
  return (
    <>
      <button onClick={() => setAberto((x) => !x)} className={`relative flex min-h-[44px] items-center gap-3 rounded-[10px] px-2.5 text-sm ${className}`} title="Avisos" aria-label={`Avisos (${n} não lidos)`}>
        <Icone nome="sino" />
        {rotulo && 'Avisos'}
        {n > 0 && <span className="absolute left-6 top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-alert px-1 text-[11px] font-bold text-white">{n > 99 ? '99+' : n}</span>}
      </button>
      {av.novo && !aberto && (
        <button onClick={() => { av.fecharNovo(); setAberto(true) }} className={`fixed right-4 top-4 z-50 max-w-sm rounded-2xl border-l-4 bg-surface p-4 text-left text-sm shadow-2xl ring-1 ring-line ${COR[av.novo.nivel]}`}>
          <b className="block text-[15px]">{av.novo.titulo}</b><span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{av.novo.mensagem}</span>
        </button>
      )}
      {aberto && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="Avisos">
          <button className="absolute inset-0 bg-ink/30" onClick={() => setAberto(false)} aria-label="Fechar" />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-2xl">
            <header className="flex items-center justify-between border-b border-line p-4">
              <b>Avisos do sistema</b>
              <span className="flex items-center gap-3 text-sm">
                {n > 0 && <button className="text-brand underline" onClick={() => av.marcar(av.naoLidas.map((x) => x.id))}>marcar todos</button>}
                <button onClick={() => setAberto(false)} aria-label="Fechar"><Icone nome="fechar" /></button>
              </span>
            </header>
            <ul className="flex-1 divide-y divide-line overflow-y-auto">
              {!av.lista.length ? <li className="p-6 text-center text-sm text-ink-soft">Nenhum aviso. Cancelamentos, estornos e erros de impressão/NFC-e aparecem aqui.</li> : av.lista.map((a) => <ItemAviso key={a.id} a={a} marcar={av.marcar} />)}
            </ul>
            <footer className="border-t border-line p-3 text-xs text-ink-soft">
              Erro de impressão? <Link className="text-brand underline" to="/pdv/config" onClick={() => setAberto(false)}>PDV · Configurações › Impressoras</Link> (há o botão "reenfileirar erros").
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
