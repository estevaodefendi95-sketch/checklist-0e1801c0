import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAoVivo } from '../lib/pdv'
import { usePermissoes } from '../context/PermissoesContext'
import { useAuth } from '../context/AuthContext'

interface Job {
  id: string; tipo: string; comanda_id: string | null; status: string; tentativas: number; erro: string | null; criado_em: string; impressora_id: string
  conteudo: { mesa?: string | null; comanda?: number; cliente?: string | null; nome?: string; qtd?: number; obs?: string | null }
}
interface Grupo { chave: string; comanda_id: string | null; mesa: string | null; comanda?: number; cliente?: string | null; jobs: Job[]; destinos: string[] }
const ATRASO_MS = 45_000 // pedido que fica mais que isso sem imprimir já vira alerta

/** Avisa quando um pedido ficou sem imprimir: qual mesa e comanda, o que era e para onde (cozinha/bar), para o garçom levar à mão. */
export function AlertaImpressao() {
  const { pode } = usePermissoes()
  const { profile } = useAuth()
  const ativo = pode('pdv_operar')
  const [jobs, setJobs] = useState<Job[]>([])
  const [imp, setImp] = useState<Record<string, string>>({})
  const [aberto, setAberto] = useState(false)
  const [, tic] = useState(0)
  const antes = useRef(0)

  const carregar = useCallback(async () => {
    if (!ativo) return
    const desde = new Date(Date.now() - 12 * 3600_000).toISOString()
    const [j, p] = await Promise.all([
      db.from('pdv_fila_impressao').select('id,tipo,comanda_id,status,tentativas,erro,criado_em,impressora_id,conteudo').in('status', ['pendente', 'imprimindo', 'erro']).in('tipo', ['pedido', 'conta']).gte('criado_em', desde).order('criado_em'),
      db.from('pdv_impressoras').select('id,nome,funcao'),
    ])
    if (j.error) return // sem conexão: o aviso de offline já cobre
    setJobs((j.data ?? []) as Job[])
    setImp(Object.fromEntries(((p.data ?? []) as { id: string; nome: string; funcao: string }[]).map((x) => [x.id, x.funcao === 'cozinha' ? 'Cozinha' : x.funcao === 'bar' ? 'Bar' : x.funcao === 'caixa' ? 'Caixa' : x.nome])))
  }, [ativo])
  useAoVivo(['pdv_fila_impressao'], carregar, 15000)
  useEffect(() => { const t = setInterval(() => tic((n) => n + 1), 10000); return () => clearInterval(t) }, [])

  const agora = Date.now()
  const problema = jobs.filter((j) => j.status === 'erro' || agora - new Date(j.criado_em).getTime() > ATRASO_MS)
  const grupos: Grupo[] = []
  for (const j of problema) {
    const chave = j.comanda_id ?? j.id
    let g = grupos.find((x) => x.chave === chave)
    if (!g) { g = { chave, comanda_id: j.comanda_id, mesa: j.conteudo.mesa ?? null, comanda: j.conteudo.comanda, cliente: j.conteudo.cliente, jobs: [], destinos: [] }; grupos.push(g) }
    g.jobs.push(j)
    const d = imp[j.impressora_id] ?? 'Impressora'
    if (!g.destinos.includes(d)) g.destinos.push(d)
  }
  const semResposta = problema.some((j) => j.status !== 'erro') // pendente há muito tempo: agente/internet fora
  useEffect(() => {
    if (problema.length > antes.current) { try { navigator.vibrate?.([200, 100, 200]) } catch { /* sem vibração */ } }
    antes.current = problema.length
  }, [problema.length])

  async function avisado(g: Grupo) {
    await db.from('pdv_fila_impressao').update({ status: 'avisado', erro: `Levado à mão por ${profile?.nome ?? 'garçom'}` }).in('id', g.jobs.map((j) => j.id))
    carregar()
  }
  async function tentar(g: Grupo) {
    await db.from('pdv_fila_impressao').update({ status: 'pendente', tentativas: 0, erro: null, criado_em: new Date().toISOString() }).in('id', g.jobs.map((j) => j.id))
    carregar()
  }

  if (!ativo || !grupos.length) return null
  const nItens = problema.length
  return (
    <div className="mb-3 overflow-hidden rounded-2xl border-2 border-red-500 bg-red-50 text-red-900" role="alert">
      <button className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <span>
          <b>⚠ {nItens} {nItens === 1 ? 'impressão não saiu' : 'impressões não saíram'}</b>
          <span className="block text-sm">
            {grupos.slice(0, 3).map((g) => `${g.mesa ? 'Mesa ' + g.mesa : 'Balcão'} · #${g.comanda ?? '?'}`).join('  |  ')}{grupos.length > 3 ? `  | +${grupos.length - 3}` : ''}
          </span>
        </span>
        <span className="text-sm underline">{aberto ? 'fechar' : 'ver'}</span>
      </button>
      {aberto && (
        <div className="space-y-2 border-t border-red-300 bg-white/60 p-3">
          {semResposta && <p className="text-sm">O computador das impressoras não está respondendo (internet, agente desligado ou impressora fora). Leve os pedidos abaixo à mão.</p>}
          {grupos.map((g) => (
            <div key={g.chave} className="rounded-xl border border-red-200 bg-white p-3 text-sm text-ink">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{g.mesa ? `Mesa ${g.mesa}` : 'Balcão'} · comanda #{g.comanda ?? '?'}{g.cliente ? ` · ${g.cliente}` : ''}</b>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">levar: {g.destinos.join(' e ')}</span>
              </div>
              <ul className="mt-1 list-disc pl-5">
                {g.jobs.map((j) => (
                  <li key={j.id}>
                    {j.tipo === 'conta' ? 'Pré-conta' : `${j.conteudo.qtd ?? 1}× ${j.conteudo.nome ?? 'item'}`}{j.conteudo.obs ? ` (${j.conteudo.obs})` : ''}
                    <span className="text-xs text-ink-soft"> · {imp[j.impressora_id] ?? ''} · há {Math.max(1, Math.round((agora - new Date(j.criado_em).getTime()) / 60000))} min{j.erro ? ` · ${j.erro}` : ''}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                {g.comanda_id && <Link to={`/pdv/comanda/${g.comanda_id}`} className="inline-flex min-h-[40px] items-center rounded-xl border border-line px-3">Abrir comanda</Link>}
                <button className="min-h-[40px] rounded-xl border border-line px-3" onClick={() => tentar(g)}>Tentar imprimir de novo</button>
                <button className="min-h-[40px] rounded-xl bg-red-600 px-3 font-semibold text-white" onClick={() => avisado(g)}>Já avisei na cozinha/bar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
