import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../integrations/supabase/client'
import { CardapioCliente } from '../../components/CardapioCliente'

// Página pública aberta pelo QR Code da mesa (sem login). Toda a leitura e escrita passa pela
// função pdv-tablet, que valida o token da mesa e só aceita pedido com comanda aberta.
interface Opc { id: string; nome: string; preco_adicional: number }
interface Grp { id: string; nome: string; tipo: string; min_escolhas: number; max_escolhas: number; opcoes: Opc[] }
interface Prod { id: string; nome: string; descricao: string | null; preco: number; categoria_id: string | null; foto_url: string | null; grupos?: Grp[] }
interface Linha { key: string; p: Prod; qtd: number; opcoes: string[]; obs: string }
interface Cat { id: string; nome: string }
interface It { nome: string; qtd: number; preco_unit: number; status: string; opcoes?: { nome: string }[] }
interface Estado {
  erro?: string; mesa?: string; boas_vindas?: string; qr_ativo?: boolean; exige_checkin?: boolean
  comanda?: { id: string; nome_cliente: string | null; total: number; status: string } | null
  itens?: It[]; tema?: { primaria?: string; fundo?: string; texto?: string; destaque?: string; titulo?: string; subtitulo?: string; colunas?: number; mostrar_fotos?: boolean }; categorias?: Cat[]; produtos?: Prod[]; pode_chamar?: boolean; pode_conta?: boolean
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function MesaPublica() {
  const { token } = useParams()
  const [e, setE] = useState<Estado | null>(null)
  const [car, setCar] = useState<Linha[]>([])
  const [esc, setEsc] = useState<{ p: Prod; sel: Record<string, string[]>; obs: string } | null>(null)
  const [carrinho, setCarrinho] = useState(false)
  const [lateral, setLateral] = useState(() => window.innerWidth >= 768)
  useEffect(() => { const f = () => setLateral(window.innerWidth >= 768); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  const [msg, setMsg] = useState('')
  const [env, setEnv] = useState(false)
  const [nome, setNome] = useState('')
  const [pessoas, setPessoas] = useState('2')

  const chamar = useCallback(async (acao: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('pdv-tablet', { body: { token, acao, ...extra } })
    if (error) return { erro: 'Sem conexão. Chame o garçom.' } as Estado
    return data as Estado
  }, [token])
  const carregar = useCallback(async () => { const d = await chamar('menu'); setE(d) }, [chamar])
  useEffect(() => { carregar(); const t = setInterval(carregar, 10000); return () => clearInterval(t) }, [carregar])

  const prodsCard = useMemo(() => (e?.produtos ?? []).map((p) => ({ ...p, personalizavel: !!p.grupos?.length })), [e])
  const adic = (l: { p: Prod; opcoes: string[] }) => (l.p.grupos ?? []).flatMap((g) => g.opcoes).filter((o) => l.opcoes.includes(o.id)).reduce((s, o) => s + Number(o.preco_adicional), 0)
  const total = car.reduce((s, l) => s + l.qtd * (Number(l.p.preco) + adic(l)), 0)
  const qtd = car.reduce((s, l) => s + l.qtd, 0)
  const qtdProd = (id: string) => car.filter((l) => l.p.id === id).reduce((s, l) => s + l.qtd, 0)
  function mais(p: Prod) {
    if (p.grupos?.length) return setEsc({ p, sel: {}, obs: '' })
    setCar((c) => { const i = c.findIndex((l) => l.p.id === p.id && !l.opcoes.length && !l.obs); return i >= 0 ? c.map((l, k) => (k === i ? { ...l, qtd: l.qtd + 1 } : l)) : [...c, { key: crypto.randomUUID(), p, qtd: 1, opcoes: [], obs: '' }] })
  }
  function menos(id: string) { setCar((c) => { const i = [...c].reverse().findIndex((l) => l.p.id === id); if (i < 0) return c; const k = c.length - 1 - i; return c.map((l, j) => (j === k ? { ...l, qtd: l.qtd - 1 } : l)).filter((l) => l.qtd > 0) }) }
  function toggleOpc(g: Grp, o: Opc) {
    setEsc((x) => {
      if (!x) return x
      const atual = x.sel[g.id] ?? []
      let novo: string[]
      if (atual.includes(o.id)) novo = atual.filter((i) => i !== o.id)
      else if (g.max_escolhas === 1) novo = [o.id]
      else novo = atual.length < g.max_escolhas ? [...atual, o.id] : atual
      return { ...x, sel: { ...x.sel, [g.id]: novo } }
    })
  }
  function confirmarEsc() {
    if (!esc) return
    for (const g of esc.p.grupos ?? []) if ((esc.sel[g.id]?.length ?? 0) < g.min_escolhas) return setMsg(`Escolha ${g.min_escolhas > 1 ? `ao menos ${g.min_escolhas} em` : ''} "${g.nome}".`)
    setCar((c) => [...c, { key: crypto.randomUUID(), p: esc.p, qtd: 1, opcoes: Object.values(esc.sel).flat(), obs: esc.obs }])
    setEsc(null); setMsg('')
  }

  async function pedir() {
    setEnv(true)
    const itens = car.map((l) => ({ produto_id: l.p.id, qtd: l.qtd, opcoes: l.opcoes, obs: l.obs }))
    const r = await chamar('pedir', { itens }) as Estado & { ok?: boolean }
    setEnv(false)
    if (r.erro) return setMsg(r.erro)
    setCar([]); setMsg('Pedido enviado! Já está sendo preparado.'); carregar()
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
  const btn = 'rounded-xl bg-[var(--p)] px-4 py-3 text-base font-semibold text-white disabled:opacity-50'
  const vars = { ['--p' as string]: e.tema?.primaria ?? '#7a1f2b', ['--f' as string]: e.tema?.fundo ?? '#faf7f2', ['--t' as string]: e.tema?.texto ?? '#222' }
  const tema = { colunas: 2, ...(e.tema ?? {}) }
  const folha = esc && (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50" onClick={() => setEsc(null)}>
      <div className="max-h-[85vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-3xl bg-white p-4 text-[#222]" style={vars} onClick={(x) => x.stopPropagation()}>
        <h2 className="text-lg font-semibold">{esc.p.nome}</h2>
        {esc.p.descricao && <p className="text-sm opacity-70">{esc.p.descricao}</p>}
        {(esc.p.grupos ?? []).map((g) => (
          <fieldset key={g.id} className="space-y-1">
            <legend className="font-medium">{g.nome} <span className="text-xs opacity-60">{g.min_escolhas > 0 ? 'obrigatório' : 'opcional'}{g.max_escolhas > 1 ? ` · até ${g.max_escolhas}` : ''}</span></legend>
            {g.opcoes.map((o) => {
              const on = (esc.sel[g.id] ?? []).includes(o.id)
              return (
                <button key={o.id} onClick={() => toggleOpc(g, o)} className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${on ? 'border-[var(--p)] bg-black/5' : ''}`}>
                  <span>{on ? '● ' : '○ '}{o.nome}</span>{Number(o.preco_adicional) > 0 && <span className="text-sm opacity-70">+ {brl(Number(o.preco_adicional))}</span>}
                </button>
              )
            })}
          </fieldset>
        ))}
        <input className="w-full rounded-lg border p-2 text-sm" placeholder="Observação" value={esc.obs} onChange={(x) => setEsc({ ...esc, obs: x.target.value })} />
        {msg && <p className="text-sm text-[var(--p)]">{msg}</p>}
        <button className={btn + ' w-full'} onClick={confirmarEsc}>Adicionar ao pedido</button>
      </div>
    </div>
  )
  const sacola = carrinho && (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50" onClick={() => setCarrinho(false)}>
      <div className="max-h-[85vh] w-full max-w-xl space-y-3 overflow-y-auto rounded-t-3xl bg-white p-4 text-[#222]" style={vars} onClick={(x) => x.stopPropagation()}>
        <h2 className="text-lg font-semibold">Seu pedido</h2>
        {car.map((l) => (
          <div key={l.key} className="space-y-1 border-b pb-2">
            <div className="flex items-start justify-between gap-2">
              <span><b>{l.qtd}× {l.p.nome}</b>{l.opcoes.length > 0 && <em className="block text-xs opacity-70">{(l.p.grupos ?? []).flatMap((g) => g.opcoes).filter((o) => l.opcoes.includes(o.id)).map((o) => o.nome).join(', ')}</em>}</span>
              <span className="flex items-center gap-2"><b>{brl(l.qtd * (Number(l.p.preco) + adic(l)))}</b>
                <button className="grid h-8 w-8 place-items-center rounded-full border" onClick={() => setCar((c) => c.map((k) => (k.key === l.key ? { ...k, qtd: k.qtd - 1 } : k)).filter((k) => k.qtd > 0))}>−</button>
                <button className="grid h-8 w-8 place-items-center rounded-full border" onClick={() => setCar((c) => c.map((k) => (k.key === l.key ? { ...k, qtd: k.qtd + 1 } : k)))}>+</button></span>
            </div>
            <input className="w-full rounded-lg border p-2 text-sm" placeholder="Observação (sem cebola…)" value={l.obs} onChange={(x) => setCar((c) => c.map((k) => (k.key === l.key ? { ...k, obs: x.target.value } : k)))} />
          </div>
        ))}
        {!car.length && <p className="text-sm opacity-70">Sacola vazia.</p>}
        {msg && <p className="text-sm text-[var(--p)]">{msg}</p>}
        <button className={btn + ' w-full'} disabled={env || !car.length} onClick={async () => { await pedir(); setCarrinho(false) }}>Enviar pedido · {brl(total)}</button>
      </div>
    </div>
  )
  const abrirMesa = (
    <div className="mx-auto max-w-xl p-4" style={{ ...vars, color: 'var(--t)' }}>
      <h1 className="mb-2 text-2xl font-semibold">{e.tema?.titulo || 'Paggio'} · Mesa {e.mesa}</h1>
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
    </div>
  )
  if (!e.qr_ativo) return <p className="p-6 text-center">Pedidos pelo QR Code indisponíveis. Chame o garçom.</p>
  if (!e.comanda) return abrirMesa
  return (
    <div className="mx-auto h-[100dvh] max-w-5xl">
      {msg && !esc && !carrinho && <p className="fixed inset-x-3 top-3 z-40 mx-auto max-w-xl rounded-xl bg-white p-3 text-sm shadow-lg" onClick={() => setMsg('')}>{msg}</p>}
      <CardapioCliente
        tema={tema} mesa={e.mesa ?? ''} boasVindas={e.boas_vindas} categorias={e.categorias ?? []} produtos={prodsCard} lateral={lateral}
        qtdDe={qtdProd} onAdd={(p) => mais(p as Prod)} onMenos={menos}
        acoes={<>
          {e.pode_chamar && <button className="rounded-full border border-white/60 px-3 py-1.5 text-xs" onClick={() => simples('garcom', 'Garçom chamado.')}>Chamar garçom</button>}
          {e.pode_conta && <button className="rounded-full border border-white/60 px-3 py-1.5 text-xs" onClick={() => simples('conta', 'Conta solicitada. O garçom já vai até você.')}>Pedir a conta</button>}
        </>}
        rodape={<>
          {(e.itens ?? []).length > 0 && (
            <details className="rounded-2xl bg-white p-3 text-sm shadow">
              <summary className="flex cursor-pointer justify-between font-semibold"><span>Seu consumo</span><span>{brl(e.comanda.total)}</span></summary>
              {(e.itens ?? []).map((i, k) => <div key={k} className="flex justify-between py-1"><span>{i.qtd}× {i.nome}{i.opcoes?.length ? <em className="block text-xs opacity-70">{i.opcoes.map((o) => o.nome).join(', ')}</em> : null} <em className="opacity-60">({i.status})</em></span><span>{brl(i.qtd * i.preco_unit)}</span></div>)}
            </details>
          )}
          {qtd > 0 && <button className={btn + ' flex w-full items-center justify-between shadow-lg'} onClick={() => setCarrinho(true)}><span>Ver pedido · {qtd} {qtd === 1 ? 'item' : 'itens'}</span><span>{brl(total)}</span></button>}
        </>}
        sobrepor={<>{folha}{sacola}</>}
      />
    </div>
  )
}
