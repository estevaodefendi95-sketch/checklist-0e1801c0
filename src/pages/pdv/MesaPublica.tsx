import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../integrations/supabase/client'
import { CardapioCliente } from '../../components/CardapioCliente'
import { ProdutoDetalhe } from '../../components/ProdutoDetalhe'
import { LeitorQr } from '../../components/LeitorQr'
import { AutorizarTablet, salvarMesa, useSegurar } from '../../components/TabletAcesso'
import type { CardBanner } from '../../components/CardapioCliente'

// Tablet da mesa (sem login). O QR Code é do CARTÃO DA COMANDA: o cliente monta o pedido e lê o QR do
// seu cartão para enviá-lo. Toda a leitura e escrita passa pela função pdv-tablet.
interface Opc { id: string; nome: string; preco_adicional: number }
interface Grp { id: string; nome: string; tipo: string; min_escolhas: number; max_escolhas: number; opcoes: Opc[] }
interface Prod { id: string; nome: string; descricao: string | null; preco: number; categoria_id: string | null; foto_url: string | null; video_url?: string | null; grupos?: Grp[]; indicacao?: boolean; indicacao_rotulo?: string | null }
interface Linha { key: string; p: Prod; qtd: number; opcoes: string[]; obs: string }
interface Cat { id: string; nome: string }
interface It { nome: string; qtd: number; preco_unit: number; status: string; opcoes?: { nome: string }[] }
interface Estado {
  erro?: string; mesa?: string; boas_vindas?: string; qr_ativo?: boolean
  banners?: CardBanner[]; reserva?: { id: string; nome: string; telefone: string; pessoas: number; hora: string; liberada: boolean; manual?: boolean } | null
  itens?: It[]; tema?: { primaria?: string; fundo?: string; texto?: string; destaque?: string; titulo?: string; subtitulo?: string; colunas?: number; mostrar_fotos?: boolean }; categorias?: Cat[]; produtos?: Prod[]; pode_chamar?: boolean; pode_conta?: boolean; inatividade_min?: number
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function MesaPublica() {
  const { token } = useParams()
  const nav = useNavigate()
  const [acesso, setAcesso] = useState<null | 'trocar' | 'sair' | 'reservar' | 'liberar'>(null)
  const saindo = useRef(false)
  const [menuEquipe, setMenuEquipe] = useState(false)
  const segTopoRes = useSegurar(() => setMenuEquipe(true))
  const segLogoRes = useSegurar(() => setMenuEquipe(true))
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
  // Totem: no navegador, o primeiro toque na tela liga a tela cheia (esconde abas e barra de endereço). Instalado como app, já abre em tela cheia.
  useEffect(() => {
    const instalado = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
    if (!document.documentElement.requestFullscreen) return
    const ligar = () => { if (!document.fullscreenElement && !saindo.current && !instalado) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => { /* o navegador recusou */ }) }
    document.addEventListener('pointerup', ligar)
    return () => document.removeEventListener('pointerup', ligar)
  }, [])
  // Trava de totem: o cliente não consegue voltar/sair da tela. Só o PIN da equipe (segurar o logo) libera a saída.
  useEffect(() => {
    const trava = () => { if (!saindo.current) window.history.pushState(null, '', window.location.href) }
    trava(); trava()
    const aoVoltar = () => trava()
    const aoFechar = (ev: BeforeUnloadEvent) => { if (!saindo.current) { ev.preventDefault(); ev.returnValue = '' } }
    const menu = (ev: Event) => ev.preventDefault()
    const teclas = (ev: KeyboardEvent) => {
      if (saindo.current) return
      if (ev.key === 'F5' || ev.key === 'F11' || ev.key === 'F12' || (ev.altKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) || ((ev.ctrlKey || ev.metaKey) && ['l', 'w', 't', 'n', 'r', 'u', 'p', 's'].includes(ev.key.toLowerCase()))) ev.preventDefault()
    }
    const html = document.documentElement, antes = html.style.overscrollBehavior
    html.style.overscrollBehavior = 'none'; document.body.style.overscrollBehavior = 'none'
    window.addEventListener('popstate', aoVoltar); window.addEventListener('beforeunload', aoFechar)
    document.addEventListener('contextmenu', menu); window.addEventListener('keydown', teclas)
    // se o navegador sair da tela cheia (gesto do cliente), volta no próximo toque
    return () => { html.style.overscrollBehavior = antes; document.body.style.overscrollBehavior = ''; window.removeEventListener('popstate', aoVoltar); window.removeEventListener('beforeunload', aoFechar); document.removeEventListener('contextmenu', menu); window.removeEventListener('keydown', teclas) }
  }, [])
  // depois de adicionar um item: "continuar pedindo" ou "enviar pedido" (abre a câmera na hora)
  const [add, setAdd] = useState<{ nome: string; n: number } | null>(null)
  useEffect(() => {
    if (!add) return
    const t = setTimeout(() => setAdd(null), 12000)
    return () => clearTimeout(t)
  }, [add])
  const avisarAdd = (nome: string) => setAdd((a) => ({ nome, n: (a?.n ?? 0) + 1 }))

  // Ao "instalar" o app a partir desta página, o ícone abre ESTA mesa em tela cheia (e não o painel de gestão)
  // este aparelho passa a abrir sempre esta mesa pelo endereço único /mesa
  useEffect(() => { if (token) salvarMesa(token) }, [token])
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link || !token) return
    const original = link.href
    let url = ''
    fetch('/manifest.webmanifest').then((r) => r.json()).then((m) => {
      const abs = (u: string) => new URL(u, window.location.origin).href
      const novo = {
        ...m, name: 'Paggio · Cardápio da mesa', short_name: 'Cardápio', id: '/mesa', start_url: '/mesa', scope: '/mesa', display: 'fullscreen',
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
  // Bateria: o tablet avisa o nível a cada minuto (Chrome/Android). A gestão vê todos em Configurações › Tablet.
  useEffect(() => {
    if (!token) return
    type Bat = { level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void }
    const navb = navigator as Navigator & { getBattery?: () => Promise<Bat> }
    if (!navb.getBattery) return
    let id = ''
    try { id = localStorage.getItem('paggio-aparelho') || ''; if (!id) { id = crypto.randomUUID(); localStorage.setItem('paggio-aparelho', id) } } catch { id = 'tmp-' + Math.random().toString(36).slice(2) }
    let bat: Bat | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    const enviar = () => { if (bat) chamar('bateria', { aparelho: id, nivel: Math.round(bat.level * 100), carregando: bat.charging }) }
    navb.getBattery().then((b) => { bat = b; enviar(); b.addEventListener('levelchange', enviar); b.addEventListener('chargingchange', enviar); timer = setInterval(enviar, 60000) }).catch(() => { /* sem acesso à bateria */ })
    return () => { clearInterval(timer); bat?.removeEventListener('levelchange', enviar); bat?.removeEventListener('chargingchange', enviar) }
  }, [token, chamar])
  // Tela de abertura: banner em tela cheia; o cardápio só abre ao tocar e a tela volta sozinha depois de um tempo parada.
  const [aberto, setAberto] = useState(false)
  const [bi, setBi] = useState(0)
  const ultimoToque = useRef(Date.now())
  useEffect(() => {
    const marca = () => { ultimoToque.current = Date.now() }
    window.addEventListener('pointerdown', marca); window.addEventListener('keydown', marca); window.addEventListener('scroll', marca, true)
    return () => { window.removeEventListener('pointerdown', marca); window.removeEventListener('keydown', marca); window.removeEventListener('scroll', marca, true) }
  }, [])
  useEffect(() => {
    const min = e?.inatividade_min ?? 5
    if (!aberto || !min) return
    const t = setInterval(() => {
      if (Date.now() - ultimoToque.current > min * 60000 && !car.length && !det && !carrinho && !leitor && !minha && !acesso) { setAberto(false); setMsg('') }
    }, 5000)
    return () => clearInterval(t)
  }, [aberto, e?.inatividade_min, car.length, det, carrinho, leitor, minha, acesso])
  const nBanners = e?.banners?.length ?? 0
  useEffect(() => {
    if (aberto || nBanners < 2) return
    const t = setInterval(() => setBi((i) => i + 1), 4000)
    return () => clearInterval(t)
  }, [aberto, nBanners])
  useEffect(() => { carregar(); const t = setInterval(carregar, 10000); return () => clearInterval(t) }, [carregar])

  const prodsCard = useMemo(() => (e?.produtos ?? []).map((p) => ({ ...p, personalizavel: !!p.grupos?.length })), [e])
  const adic = (l: { p: Prod; opcoes: string[] }) => (l.p.grupos ?? []).flatMap((g) => g.opcoes).filter((o) => l.opcoes.includes(o.id)).reduce((s, o) => s + Number(o.preco_adicional), 0)
  const total = car.reduce((s, l) => s + l.qtd * (Number(l.p.preco) + adic(l)), 0)
  const qtd = car.reduce((s, l) => s + l.qtd, 0)
  const qtdProd = (id: string) => car.filter((l) => l.p.id === id).reduce((s, l) => s + l.qtd, 0)
  function mais(p: Prod) {
    if (p.grupos?.length) return setDet(p)
    setCar((c) => { const i = c.findIndex((l) => l.p.id === p.id && !l.opcoes.length && !l.obs); return i >= 0 ? c.map((l, k) => (k === i ? { ...l, qtd: l.qtd + 1 } : l)) : [...c, { key: crypto.randomUUID(), p, qtd: 1, opcoes: [], obs: '' }] })
    avisarAdd(p.nome)
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
    avisarAdd(p.nome)
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
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-4" onClick={() => setCarrinho(false)}>
      <div className="max-h-[88dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-3xl bg-white p-6 text-[#222] shadow-2xl" style={vars} onClick={(x) => x.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-2xl font-semibold">Seu pedido</h2><button className="grid h-10 w-10 place-items-center rounded-full border text-xl" onClick={() => setCarrinho(false)} aria-label="Fechar">×</button></div>
        {car.map((l) => (
          <div key={l.key} className="space-y-1 border-b pb-2">
            <div className="flex items-start justify-between gap-2">
              <span className="text-lg"><b>{l.qtd}× {l.p.nome}</b>{l.opcoes.length > 0 && <em className="block text-xs opacity-70">{(l.p.grupos ?? []).flatMap((g) => g.opcoes).filter((o) => l.opcoes.includes(o.id)).map((o) => o.nome).join(', ')}</em>}</span>
              <span className="flex items-center gap-3 text-lg"><b>{brl(l.qtd * (Number(l.p.preco) + adic(l)))}</b>
                <button className="grid h-11 w-11 place-items-center rounded-full border text-xl" onClick={() => setCar((c) => c.map((k) => (k.key === l.key ? { ...k, qtd: k.qtd - 1 } : k)).filter((k) => k.qtd > 0))}>−</button>
                <button className="grid h-11 w-11 place-items-center rounded-full border text-xl" onClick={() => setCar((c) => c.map((k) => (k.key === l.key ? { ...k, qtd: k.qtd + 1 } : k)))}>+</button></span>
            </div>
            <input className="w-full rounded-xl border p-3 text-base" placeholder="Observação (sem cebola…)" value={l.obs} onChange={(x) => setCar((c) => c.map((k) => (k.key === l.key ? { ...k, obs: x.target.value } : k)))} />
          </div>
        ))}
        {!car.length && <p className="text-sm opacity-70">Sacola vazia.</p>}
        {msg && <p className="text-sm text-[var(--p)]">{msg}</p>}
        <div className="flex items-center justify-between border-t pt-3 text-xl"><span>Total</span><b>{brl(total)}</b></div>
        <button className={btn + ' min-h-[60px] w-full text-lg'} disabled={env || !car.length} onClick={() => { setCarrinho(false); setMsg(''); setLeitor('pedido') }}>Enviar pedido · ler o QR do cartão</button>
      </div>
    </div>
  )
  const dialogoEquipe = menuEquipe && !acesso && (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4" onClick={() => setMenuEquipe(false)}>
      <div className="w-full max-w-sm space-y-2 rounded-3xl bg-white p-5 text-[#222] shadow-2xl" onClick={(x) => x.stopPropagation()}>
        <h2 className="text-lg font-semibold">Área da equipe</h2>
        <p className="pb-1 text-sm opacity-60">Toda opção pede o PIN de supervisor.</p>
        {[['reservar', 'Marcar mesa como reservada'], ['trocar', 'Trocar a mesa deste tablet'], ['sair', 'Sair do cardápio']].map(([k, t]) => (
          <button key={k} className="block w-full rounded-2xl border border-black/10 px-4 py-4 text-left text-base font-medium active:bg-black/5" onClick={() => { setMenuEquipe(false); setAcesso(k as 'trocar' | 'sair' | 'reservar') }}>{t}</button>
        ))}
        <button className="block w-full rounded-2xl px-4 py-3 text-center text-sm opacity-60" onClick={() => setMenuEquipe(false)}>Cancelar</button>
      </div>
    </div>
  )
  const dialogoAcesso = acesso && (
    <AutorizarTablet token={token} modo={acesso} mesaAtual={e.mesa}
      onCancelar={() => setAcesso(null)} onSair={() => {
        if (acesso === 'sair') { saindo.current = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => { /* já saiu */ }); setAcesso(null); nav('/') }
        else { setAcesso(null); carregar() }
      }}
      onTrocar={(tk) => { setAcesso(null); setCar([]); setMsg(''); setE(null); nav(`/mesa/${tk}`) }} />
  )
  async function liberarReserva() {
    if (!e?.reserva) return
    if (e.reserva.manual) return setAcesso('liberar')
    const r = await chamar('liberar_reserva', { reserva_id: e.reserva.id })
    if (r.erro) setMsg(r.erro); else carregar()
  }
  if (e.qr_ativo && e.reserva && !e.reserva.liberada) {
    return (
      <div className="relative flex h-[100dvh] cursor-pointer select-none flex-col items-center justify-center gap-4 p-6 text-center text-white" style={{ ...vars, background: 'var(--p)' }} onClick={liberarReserva}>
        <div {...segTopoRes} onClick={(x) => x.stopPropagation()} className="absolute inset-x-0 top-0 h-24" />
        <img {...segLogoRes} onClick={(x) => x.stopPropagation()} draggable={false} src="/logo-paggio.png" alt="Paggio Gastrobar" className="h-20 w-auto object-contain" />
        <div className="absolute left-5 top-5 rounded-2xl bg-white/15 px-5 py-2 text-left leading-none ring-1 ring-white/40"><span className="block text-[11px] uppercase tracking-[0.25em] opacity-80">Mesa</span><b className="text-4xl">{e.mesa}</b></div>
        <h1 className="text-4xl font-semibold">Mesa reservada</h1>
        <p className="text-3xl">{e.reserva.nome}</p>
        {!e.reserva.manual && <p className="opacity-80">{e.reserva.hora} · {e.reserva.pessoas} {e.reserva.pessoas === 1 ? 'pessoa' : 'pessoas'}</p>}
        <p className="mt-6 rounded-full border border-white/60 px-5 py-2 text-sm">{e.reserva.manual ? 'Toque para a equipe liberar a mesa' : 'Toque na tela para liberar'}</p>
        {dialogoAcesso}{dialogoEquipe}
      </div>
    )
  }
  if (!e.qr_ativo) return <p className="p-6 text-center">Pedidos pelo QR Code indisponíveis. Chame o garçom.</p>
  if (!aberto) {
    const bn = e.banners?.length ? e.banners[bi % e.banners.length] : null
    return (
      <div className="relative flex h-[100dvh] cursor-pointer select-none flex-col items-center justify-between overflow-hidden p-8 text-center text-white" style={{ ...vars, background: 'var(--p)' }}
        onClick={() => { ultimoToque.current = Date.now(); setAberto(true) }}>
        {bn && <img key={bn.id} src={bn.imagem_url} alt={bn.titulo} className="absolute inset-0 h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/70" />
        <div className="absolute left-5 top-5 z-10 flex items-center gap-4 rounded-3xl bg-black/35 py-3 pl-4 pr-5 backdrop-blur" {...segLogoRes} onClick={(x) => x.stopPropagation()}>
          <img draggable={false} src="/logo-paggio.png" alt="Paggio Gastrobar" className="h-14 w-auto object-contain" />
          <span className="h-10 w-px bg-white/40" />
          <span className="text-left leading-none"><span className="block text-[11px] uppercase tracking-[0.25em] opacity-90">Mesa</span><b className="text-4xl">{e.mesa}</b></span>
        </div>
        {bn?.patrocinador && <p className="absolute bottom-5 left-5 z-10 text-xs uppercase tracking-wider opacity-80">Patrocinado · {bn.patrocinador}</p>}
        <span />
        <span />
        <p className="relative z-10 animate-pulse rounded-full border border-white/80 bg-black/30 px-8 py-4 text-xl font-medium backdrop-blur">Toque na tela para ver o cardápio</p>
        {dialogoAcesso}{dialogoEquipe}
      </div>
    )
  }
  return (
    <div className="mx-auto h-[100dvh] w-full">
      {add && !det && !carrinho && !leitor && qtd > 0 && (
        <div className="fixed inset-x-0 bottom-[84px] z-30 flex justify-center px-4" style={vars}>
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 text-[#222] shadow-2xl ring-1 ring-black/10">
            <p className="mb-3 text-base"><b>✓ {add.nome}</b> adicionado ao carrinho. <span className="opacity-70">({qtd} {qtd === 1 ? 'item' : 'itens'} · {brl(total)})</span></p>
            <div className="grid grid-cols-2 gap-3">
              <button className="min-h-[56px] rounded-xl border-2 border-[var(--p)] px-4 text-base font-semibold text-[var(--p)]" onClick={() => setAdd(null)}>Continuar pedindo</button>
              <button className={btn + ' min-h-[56px]'} disabled={env} onClick={() => { setAdd(null); setMsg(''); setLeitor('pedido') }}>Enviar pedido · {brl(total)}</button>
            </div>
          </div>
        </div>
      )}
      {msg && !det && !carrinho && <p className="fixed inset-x-3 top-3 z-40 mx-auto max-w-xl rounded-xl bg-white p-3 text-sm shadow-lg" onClick={() => setMsg('')}>{msg}</p>}
      <CardapioCliente
        tema={tema} banners={e.banners} onBanner={() => { setAdd(null); setAberto(false) }} onTopoSegurar={() => setMenuEquipe(true)} onLogoSegurar={() => setMenuEquipe(true)} mesa={e.mesa ?? ''} boasVindas={e.boas_vindas} categorias={e.categorias ?? []} produtos={prodsCard} lateral={lateral}
        qtdDe={qtdProd} onAdd={(p) => mais(p as Prod)} onMenos={menos} onAbrir={(p) => setDet(e.produtos?.find((x) => x.id === p.id) ?? null)}
        acoes={<>
          {e.pode_chamar && <button className="rounded-2xl bg-black/[0.05] px-4 py-3 text-sm font-semibold text-[var(--t)]" onClick={() => simples('garcom', 'Garçom chamado.')}>Chamar garçom</button>}
          <button className="rounded-2xl bg-black/[0.05] px-4 py-3 text-sm font-semibold text-[var(--t)]" onClick={() => { setMsg(''); setLeitor('minha') }}>Minha conta</button>
          {e.pode_conta && <button className="rounded-2xl bg-black/[0.05] px-4 py-3 text-sm font-semibold text-[var(--t)]" onClick={() => { setMsg(''); setLeitor('conta') }}>Pedir a conta</button>}
        </>}
        rodape={<>
          {qtd > 0 ? (
            <button className="block w-full rounded-2xl bg-[var(--p)] p-3 text-left text-white shadow-lg" onClick={() => { setAdd(null); setCarrinho(true) }}>
              <span className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-90">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6" /></svg>
                Carrinho · {qtd} {qtd === 1 ? 'item' : 'itens'}
              </span>
              <b className="mt-1 block text-xl">{brl(total)}</b>
              <span className="mt-2 block rounded-xl bg-white px-3 py-2 text-center text-sm font-semibold text-[var(--p)]">Ver pedido e enviar</span>
            </button>
          ) : lateral ? (
            <div className="flex items-center gap-2.5 rounded-2xl px-2 py-2 opacity-60">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 12.2a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6" /></svg>
              </span>
              <span className="text-xs leading-tight">Seu carrinho<br /><span className="opacity-70">está vazio</span></span>
            </div>
          ) : null}
        </>}
        sobrepor={<>{dialogoAcesso}{dialogoEquipe}{det && <ProdutoDetalhe produto={det} vars={vars} fotos={tema.mostrar_fotos !== false} onFechar={() => setDet(null)} onAdicionar={adicionarDet} className="absolute inset-0" />}{sacola}{leitor && <LeitorQr camera="user" titulo="Mostre o QR Code do cartão da sua comanda para a câmera da frente" onLido={aoLer} onCancelar={() => setLeitor(null)} />}{minha && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4" onClick={() => setMinha(null)}>
            <div className="max-h-[88dvh] w-full max-w-2xl space-y-2 overflow-y-auto rounded-3xl bg-white p-6 text-[#222] shadow-2xl" onClick={(x) => x.stopPropagation()}>
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
