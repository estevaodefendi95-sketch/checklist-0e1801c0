import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../integrations/supabase/client'

// Página pública aberta pelo QR Code da mesa (sem login). Toda a leitura e escrita passa pela
// função pdv-tablet, que valida o token da mesa e só aceita pedido com comanda aberta.
interface Prod { id: string; nome: string; descricao: string | null; preco: number; categoria_id: string | null; foto_url: string | null }
interface Cat { id: string; nome: string }
interface It { nome: string; qtd: number; preco_unit: number; status: string }
interface Estado {
  erro?: string; mesa?: string; boas_vindas?: string; qr_ativo?: boolean; exige_checkin?: boolean
  comanda?: { id: string; nome_cliente: string | null; total: number; status: string } | null
  itens?: It[]; categorias?: Cat[]; produtos?: Prod[]; pode_chamar?: boolean; pode_conta?: boolean
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function MesaPublica() {
  const { token } = useParams()
  const [e, setE] = useState<Estado | null>(null)
  const [car, setCar] = useState<Record<string, number>>({})
  const [obs, setObs] = useState<Record<string, string>>({})
  const [cat, setCat] = useState<string>('')
  const [msg, setMsg] = useState('')
  const [env, setEnv] = useState(false)
  const [nome, setNome] = useState('')
  const [pessoas, setPessoas] = useState('2')

  const chamar = useCallback(async (acao: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('pdv-tablet', { body: { token, acao, ...extra } })
    if (error) return { erro: 'Sem conexão. Chame o garçom.' } as Estado
    return data as Estado
  }, [token])
  const carregar = useCallback(async () => { const d = await chamar('menu'); setE(d); setCat((c) => c || d.categorias?.[0]?.id || '') }, [chamar])
  useEffect(() => { carregar(); const t = setInterval(carregar, 15000); return () => clearInterval(t) }, [carregar])

  const lista = useMemo(() => (e?.produtos ?? []).filter((p) => !cat || p.categoria_id === cat), [e, cat])
  const total = (e?.produtos ?? []).reduce((s, p) => s + (car[p.id] ?? 0) * p.preco, 0)
  const qtd = Object.values(car).reduce((s, n) => s + n, 0)

  async function pedir() {
    setEnv(true)
    const itens = Object.entries(car).filter(([, q]) => q > 0).map(([produto_id, q]) => ({ produto_id, qtd: q, obs: obs[produto_id] ?? '' }))
    const r = await chamar('pedir', { itens }) as Estado & { ok?: boolean }
    setEnv(false)
    if (r.erro) return setMsg(r.erro)
    setCar({}); setObs({}); setMsg('Pedido enviado! Já está sendo preparado.'); carregar()
  }
  async function simples(acao: 'garcom' | 'conta', texto: string) {
    const r = await chamar(acao)
    setMsg(r.erro ?? texto)
  }
  async function checkin() {
    const r = await chamar('checkin', { nome, pessoas: Number(pessoas) || 1 })
    if (r.erro) setMsg(r.erro); else carregar()
  }

  if (!e) return <p className="p-6 text-center">Carregando…</p>
  if (e.erro && !e.mesa) return <p className="p-6 text-center">{e.erro}</p>
  const caixa = 'mx-auto min-h-screen max-w-xl bg-[#faf7f2] p-4 text-[#222]'
  const btn = 'rounded-xl bg-[#7a1f2b] px-4 py-3 text-base font-semibold text-white disabled:opacity-50'
  return (
    <div className={caixa}>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Paggio · Mesa {e.mesa}</h1>
        <p className="text-sm opacity-70">{e.boas_vindas}</p>
      </header>
      {msg && <p className="mb-3 rounded-xl bg-white p-3 text-sm shadow" onClick={() => setMsg('')}>{msg}</p>}
      {!e.qr_ativo ? <p>Pedidos pelo QR Code indisponíveis. Chame o garçom.</p> : !e.comanda ? (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow">
          <p>{e.exige_checkin ? 'Sua mesa ainda não foi aberta. Peça à recepção para fazer o check-in e volte aqui.' : 'Abra sua mesa para começar:'}</p>
          {!e.exige_checkin && (
            <>
              <input className="w-full rounded-xl border p-3" placeholder="Seu nome" value={nome} onChange={(x) => setNome(x.target.value)} />
              <input className="w-full rounded-xl border p-3" inputMode="numeric" placeholder="Pessoas" value={pessoas} onChange={(x) => setPessoas(x.target.value)} />
              <button className={btn} onClick={checkin}>Abrir mesa</button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {(e.categorias ?? []).map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm ${cat === c.id ? 'bg-[#7a1f2b] text-white' : 'bg-white'}`}>{c.nome}</button>
            ))}
          </div>
          <ul className="space-y-2 pb-40">
            {lista.map((p) => (
              <li key={p.id} className="rounded-2xl bg-white p-3 shadow">
                <div className="flex items-start gap-3">
                  {p.foto_url && <img src={p.foto_url} alt="" className="h-20 w-20 rounded-xl object-cover" />}
                  <div className="flex-1">
                    <b>{p.nome}</b>
                    {p.descricao && <p className="text-xs opacity-70">{p.descricao}</p>}
                    <div className="mt-1 text-[#7a1f2b]">{brl(p.preco)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(car[p.id] ?? 0) > 0 && <button className="h-9 w-9 rounded-full border text-lg" onClick={() => setCar({ ...car, [p.id]: car[p.id] - 1 })}>−</button>}
                    {(car[p.id] ?? 0) > 0 && <span>{car[p.id]}</span>}
                    <button className="h-9 w-9 rounded-full bg-[#7a1f2b] text-lg text-white" onClick={() => setCar({ ...car, [p.id]: (car[p.id] ?? 0) + 1 })}>+</button>
                  </div>
                </div>
                {(car[p.id] ?? 0) > 0 && <input className="mt-2 w-full rounded-lg border p-2 text-sm" placeholder="Observação (ponto da carne, sem cebola…)" value={obs[p.id] ?? ''} onChange={(x) => setObs({ ...obs, [p.id]: x.target.value })} />}
              </li>
            ))}
          </ul>
          {(e.itens ?? []).length > 0 && (
            <section className="mb-40 rounded-2xl bg-white p-3 text-sm shadow">
              <b>Seu consumo</b>
              {(e.itens ?? []).map((i, k) => <div key={k} className="flex justify-between py-1"><span>{i.qtd}× {i.nome} <em className="opacity-60">({i.status})</em></span><span>{brl(i.qtd * i.preco_unit)}</span></div>)}
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Total parcial</span><span>{brl(e.comanda.total)}</span></div>
            </section>
          )}
          <div className="fixed inset-x-0 bottom-0 mx-auto max-w-xl space-y-2 border-t bg-white p-3">
            {qtd > 0 && <button className={btn + ' w-full'} disabled={env} onClick={pedir}>Enviar pedido ({qtd}) · {brl(total)}</button>}
            <div className="flex gap-2">
              {e.pode_chamar && <button className="flex-1 rounded-xl border p-2 text-sm" onClick={() => simples('garcom', 'Garçom chamado.')}>Chamar garçom</button>}
              {e.pode_conta && <button className="flex-1 rounded-xl border p-2 text-sm" onClick={() => simples('conta', 'Conta solicitada. O garçom já vai até você.')}>Pedir a conta</button>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
