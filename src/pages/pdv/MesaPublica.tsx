import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../integrations/supabase/client'
import { CardapioCliente } from '../../components/CardapioCliente'
import { ProdutoDetalhe } from '../../components/ProdutoDetalhe'
import { LeitorQr } from '../../components/LeitorQr'
import { AutorizarTablet, useSegurar } from '../../components/TabletAcesso'
import type { CardBanner } from '../../components/CardapioCliente'

// Tablet da mesa (sem login). O QR Code é do CARTÃO DA COMANDA: o cliente monta o pedido e lê o QR do
// seu cartão para enviá-lo. Toda a leitura e escrita passa pela função pdv-tablet.
interface Opc { id: string; nome: string; preco_adicional: number }
interface Grp { id: string; nome: string; tipo: string; min_escolhas: number; max_escolhas: number; opcoes: Opc[] }
interface Prod { id: string; nome: string; descricao: string | null; preco: number; categoria_id: string | null; foto_url: string | null; grupos?: Grp[]; indicacao?: boolean; indicacao_rotulo?: string | null }
interface Linha { key: string; p: Prod; qtd: number; opcoes: string[]; obs: string }
interface Cat { id: string; nome: string }
interface It { nome: string; qtd: number; preco_unit: number; status: string; opcoes?: { nome: string }[] }
interface Estado {
  erro?: string; mesa?: string; boas_vindas?: string; qr_ativo?: boolean
  banners?: CardBanner[]; reserva?: { id: string; nome: string; telefone: string; pessoas: number; hora: string; liberada: boolean } | null
  itens?: It[]; tema?: { primaria?: string; fundo?: string; texto?: string; destaque?: string; titulo?: string; subtitulo?: string; colunas?: number; mostrar_fotos?: boolean }; categorias?: Cat[]; produtos?: Prod[]; pode_chamar?: boolean; pode_conta?: boolean
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function MesaPublica() {
  const { token } = useParams()
  const nav = useNavigate()
  const [acesso, setAcesso] = useState<null | 'trocar' | 'sair'>(null)
  const segTopoRes = useSegurar(() => setAcesso('trocar'))
  const segLogoRes = useSegurar(() => setAcesso('sair'))
  const [e, setE] = useState<Estado | null>(null)
  const [car, setCar] = useState<Linha[]>([])
  const [det, setDet] = useState<Prod | null>(null)
  const [leitor, setLeitor] = useState<null | 'pedido' | 'conta' | 'minha'>(null)
  const [minha, setMinha] = useState<null | { numero: number; nome: string | null; total: number; itens: It[] }>(null)
  const [carrinho, setCarrinho] = useState(false)
  const [lateral, setLateral] = useState(() => window.innerWidth >= 768)
  useEffect(() => { const f = () => setLateral(window.innerWidth >= 768); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  const [msg, setMsg] = useState('')
  const [env, setEnv] = useState(false)

  // Ao "instalar" o app a partir desta página, o ícone abre ESTA mesa em tela cheia (e não o painel de gestão)
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link || !token) return
    const original = link.href
    let url = ''
    fetch('/manifest.webmanifest').then((r) => r.json()).then((m) => {
      const abs = (u: string) => new URL(u, window.location.origin).href
      const novo = {
        ...m, name: 'Paggio · Cardápio da mesa', short_name: 'Cardápio', id: `/mesa/${token}`, start_url: `/mesa/${token}`, scope: '/mesa/', display: 'fullscreen',
        icons: (m.icons ?? []).map((i: { src: string }) => ({ ...i, src: abs(i.src) })), shortcuts: undefined,
      }
      url = URL.createObjectURL(new Blob([JSON.stringify(novo)], { type: 'application/manifest+json' }))
      link.href = url
    }).catch(() => { /* sem manifesto próprio: segue o padrão */ })
    return () => { link.href = original; if (url) URL.revokeObjectURL(url) }
  }, [token])

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
    if (p.grupos?.length) return setDet(p)
    setCar((c) => { const i = c.findIndex((l) => l.p.id === p.id && !l.opcoes.length && !l.obs); return i >= 0 ? c.map((l, k) => (k === i ? { ...l, qtd: l.qtd + 1 } : l)) : [...c, { key: crypto.randomUUID(), p, qtd: 1, opcoes: [], obs: '' }] })
  }
  function menos(id: string) { setCar((c) => { const i = [...c].reverse().findIndex((l) => l.p.id === id); if (i < 0) return c; const k = c.length - 1 - i; return c.map((l, j) => (j === k ? { ...l, qtd: l.qtd - 1 } : l)).filter((l) => l.qtd > 0) }) }
  function adicionarDet(qtd: number, opcoes: string[], obs: string) {
    if (!det) return
    const p = det
    setCar((c) => {
      const i = opcoes.length || obs ? -1 : c.findIndex((l) => l.p.id === p.id && !l.opcoes.length && !l.obs)
      return i >= 0 ? c.map((l, k) => (k === i ? { ...l, qtd: l.qtd + qtd } : l)) : [...c, { key: crypto.randomUUID(), p, qtd, opcoes, obs }]
    })
    setDet(null); setMsg('')
  }

  // o QR Code lido é o do cartão da comanda do cliente
  const tokenCartao = (texto: string) => texto.trim().slice(0, 300)
  async function aoLer(texto: string) {
    const modo = leitor
    setLeitor(null)
    const ct = tokenCartao(texto)
    setEnv(true)
    if (modo === 'pedido') {
      const itens = car.map((l) => ({ produto_id: l.p.id, qtd: l.qtd, opcoes: l.opcoes, obs: l.obs }))
      const r = await chamar('pedir', { itens, comanda_token: ct }) as Estado & { comanda?: number }
      setEnv(false)
      if (r.erro) return setMsg(r.erro)
      setCar([]); setMsg(`Pedido enviado para a comanda ${r.comanda}! Já está sendo preparado e será levado até você.`)
    } else if (modo === 'conta') {
      const r = await chamar('conta', { comanda_token: ct })
      setEnv(false)
      setMsg(r.erro ?? 'Conta solicitada. O garçom já vai até você.')
    } else {
      const r = await chamar('comanda_info', { comanda_token: ct }) as Estado & { numero?: number; nome?: string | null; total?: number; itens?: It[] }
      setEnv(false)
      if (r.erro) return setMsg(r.erro)
      setMinha({ numero: r.numero ?? 0, nome: r.nome ?? null, total: r.total ?? 0, itens: r.itens ?? [] })
    }
  }
  async function simples(acao: 'garcom', texto: string) {
    const r = await chamar(acao)
    setMsg(r.erro ?? texto)
  }

  if (!e) return <p className="p-6 text-center">Carregando…</p>
  if (e.erro && !e.mesa) return <p className="p-6 text-center">{e.erro}</p>
  const btn = 'rounded-xl bg-[var(--p)] px-4 py-3 text-base font-semibold text-white disabled:opacity-50'
  const vars = { ['--p' as string]: e.tema?.primaria ?? '#7a1f2b', ['--f' as string]: e.tema?.fundo ?? '#faf7f2', ['--t' as string]: e.tema?.texto ?? '#222' }
  const tema = { colunas: 2, ...(e.tema ?? {}) }
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
        <button className={btn + ' w-full'} disabled={env || !car.length} onClick={() => { setCarrinho(false); setMsg(''); setLeitor('pedido') }}>Ler QR da comanda e enviar · {brl(total)}</button>
      </div>
    </div>
  )
  const dialogoAcesso = acesso && (
    <AutorizarTablet token={token} modo={acesso} mesaAtual={e.mesa}
      onCancelar={() => setAcesso(null)} onSair={() => { setAcesso(null); nav('/') }}
      onTrocar={(tk) => { setAcesso(null); setCar([]); setMsg(''); setE(null); nav(`/mesa/${tk}`) }} />
  )
  async function liberarReserva() {
    if (!e?.reserva) return
    const r = await chamar('liberar_reserva', { reserva_id: e.reserva.id })
    if (r.erro) setMsg(r.erro); else carregar()
  }
  if (e.qr_ativo && e.reserva && !e.reserva.liberada) {
    return (
      <div className="relative flex h-[100dvh] cursor-pointer select-none flex-col items-center justify-center gap-4 p-6 text-center text-white" style={{ ...vars, background: 'var(--p)' }} onClick={liberarReserva}>
        <div {...segTopoRes} onClick={(x) => x.stopPropagation()} className="absolute inset-x-0 top-0 h-24" />
        <img {...segLogoRes} onClick={(x) => x.stopPropagation()} draggable={false} src="/logo-paggio.png" alt="Paggio Gastrobar" className="h-20 w-auto object-contain" />
        <div className="text-sm uppercase tracking-[0.3em] opacity-80">Mesa {e.mesa}</div>
        <h1 className="text-4xl font-semibold">Mesa reservada</h1>
        <p className="text-2xl">{e.reserva.nome}</p>
        <p className="opacity-80">{e.reserva.hora} · {e.reserva.pessoas} {e.reserva.pessoas === 1 ? 'pessoa' : 'pessoas'}</p>
        <p className="mt-6 rounded-full border border-white/60 px-5 py-2 text-sm">Toque na tela para liberar</p>
        {dialogoAcesso}
      </div>
    )
  }
  if (!e.qr_ativo) return <p className="p-6 text-center">Pedidos pelo QR Code indisponíveis. Chame o garçom.</p>
  return (
    <div className="mx-auto h-[100dvh] max-w-5xl">
      {msg && !det && !carrinho && <p className="fixed inset-x-3 top-3 z-40 mx-auto max-w-xl rounded-xl bg-white p-3 text-sm shadow-lg" onClick={() => setMsg('')}>{msg}</p>}
      <CardapioCliente
        tema={tema} banners={e.banners} onTopoSegurar={() => setAcesso('trocar')} onLogoSegurar={() => setAcesso('sair')} mesa={e.mesa ?? ''} boasVindas={e.boas_vindas} categorias={e.categorias ?? []} produtos={prodsCard} lateral={lateral}
        qtdDe={qtdProd} onAdd={(p) => mais(p as Prod)} onMenos={menos} onAbrir={(p) => setDet(e.produtos?.find((x) => x.id === p.id) ?? null)}
        acoes={<>
          {e.pode_chamar && <button className="rounded-full border border-white/60 px-3 py-1.5 text-xs" onClick={() => simples('garcom', 'Garçom chamado.')}>Chamar garçom</button>}
          <button className="rounded-full border border-white/60 px-3 py-1.5 text-xs" onClick={() => { setMsg(''); setLeitor('minha') }}>Minha conta</button>
          {e.pode_conta && <button className="rounded-full border border-white/60 px-3 py-1.5 text-xs" onClick={() => { setMsg(''); setLeitor('conta') }}>Pedir a conta</button>}
        </>}
        rodape={<>
          {qtd > 0 && <button className={btn + ' flex w-full items-center justify-between shadow-lg'} onClick={() => setCarrinho(true)}><span>Ver pedido · {qtd} {qtd === 1 ? 'item' : 'itens'}</span><span>{brl(total)}</span></button>}
        </>}
        sobrepor={<>{dialogoAcesso}{det && <ProdutoDetalhe produto={det} vars={vars} fotos={tema.mostrar_fotos !== false} onFechar={() => setDet(null)} onAdicionar={adicionarDet} className="absolute inset-0" />}{sacola}{leitor && <LeitorQr titulo="Aponte para o QR Code do cartão da sua comanda" onLido={aoLer} onCancelar={() => setLeitor(null)} />}{minha && (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50" onClick={() => setMinha(null)}>
            <div className="max-h-[85vh] w-full max-w-xl space-y-2 overflow-y-auto rounded-t-3xl bg-white p-4 text-[#222]" onClick={(x) => x.stopPropagation()}>
              <h2 className="text-lg font-semibold">Comanda {minha.numero}{minha.nome ? ` · ${minha.nome}` : ''}</h2>
              {minha.itens.map((i, k) => <div key={k} className="flex justify-between py-1 text-sm"><span>{i.qtd}× {i.nome}{i.opcoes?.length ? <em className="block text-xs opacity-70">{i.opcoes.map((o) => o.nome).join(', ')}</em> : null} <em className="opacity-60">({i.status})</em></span><span>{brl(i.qtd * i.preco_unit)}</span></div>)}
              {!minha.itens.length && <p className="text-sm opacity-70">Nenhum item ainda.</p>}
              <p className="flex justify-between border-t pt-2 font-semibold"><span>Total (com serviço)</span><span>{brl(minha.total)}</span></p>
              <button className={btn + ' w-full'} onClick={() => setMinha(null)}>Fechar</button>
            </div>
          </div>
        )}</>}
      />
    </div>
  )
}
