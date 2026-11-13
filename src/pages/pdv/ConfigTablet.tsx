import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, Vazio, btnCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { lerNumero } from '../../lib/formato'
import { Mesa } from '../../lib/pdv'
import { LeitorQr } from '../../components/LeitorQr'
import { BateriaTablets } from './BateriaTablets'
import { Avisos, Campo, useSalvarMsg } from './PdvConfig'

interface Cfg { taxa_servico_pct: number; couvert: number; tablet_qr_ativo: boolean; tablet_exige_checkin: boolean; tablet_url_base: string | null; tablet_mensagem_boas_vindas: string | null; tablet_tempo_inatividade_min: number; tablet_pode_chamar_garcom: boolean; tablet_pode_pedir_conta: boolean }
interface Disp { id: string; nome: string; tipo: string; token: string; ativo: boolean; ultimo_ping: string | null }

export function Tablet() {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [disps, setDisps] = useState<Disp[]>([])
  const [cartoes, setCartoes] = useState<{ numero: number; token: string }[]>([])
  const [numCartao, setNumCartao] = useState('')
  const [lendo, setLendo] = useState(false)
  const [nd, setNd] = useState({ nome: '', tipo: 'tablet' })
  const [qrs, setQrs] = useState<Record<number, string>>({})
  const [copiado, setCopiado] = useState<string | null>(null)
  const s = useSalvarMsg()
  const carregar = useCallback(async () => {
    const [a, b, c, k] = await Promise.all([db.from('pdv_config').select('*').single(), db.from('pdv_mesas').select('*').eq('ativo', true).order('numero'), db.from('pdv_dispositivos').select('*').order('criado_em'), db.from('pdv_cartoes').select('numero,token').order('numero')])
    setCartoes((k.data ?? []) as { numero: number; token: string }[])
    setCfg(a.data as Cfg); setMesas(((b.data ?? []) as Mesa[]).sort((x, y) => String(x.numero).localeCompare(String(y.numero), 'pt-BR', { numeric: true }))); setDisps((c.data ?? []) as Disp[])
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    let vivo = true
    import('qrcode').then(async (Q) => {
      const e = await Promise.all(cartoes.map(async (c) => [c.numero, await Q.toDataURL(c.token, { width: 140, margin: 1 })] as const))
      if (vivo) setQrs(Object.fromEntries(e))
    })
    return () => { vivo = false }
  }, [cartoes])
  function copiar(chave: string, texto: string) {
    navigator.clipboard?.writeText(texto)
    setCopiado(chave); setTimeout(() => setCopiado((x) => (x === chave ? null : x)), 1800)
  }
  const base = (cfg?.tablet_url_base || window.location.origin).replace(/\/$/, '')
  const urlMesa = (m: Mesa) => `${base}/mesa/${m.qr_token}`
  async function salvar() {
    if (!cfg) return
    const { error } = await db.from('pdv_config').update({ ...cfg, atualizado_em: new Date().toISOString() }).eq('id', 1)
    if (error) s.falha(error.message); else s.ok()
  }
  async function addDisp() {
    if (!nd.nome.trim()) return
    const { error } = await db.from('pdv_dispositivos').insert({ nome: nd.nome.trim(), tipo: nd.tipo })
    if (error) s.falha(error.message); else { setNd({ nome: '', tipo: 'tablet' }); carregar() }
  }
  async function cadastrarCartao(numero: number, codigo: string) {
    const linha = codigo ? { numero, token: codigo } : { numero, token: crypto.randomUUID() }
    const { error } = await db.from('pdv_cartoes').upsert(linha, { onConflict: 'numero' })
    if (error) s.falha(error.code === '23505' ? 'Esse QR Code já está cadastrado em outro número.' : error.message); else { s.ok(`Cartão ${numero} cadastrado.`); setNumCartao(String(numero + 1)); carregar() }
  }
  async function imprimirCartoes() {
    const w = window.open('', '_blank'); if (!w) return
    const Q = await import('qrcode')
    const cards = await Promise.all(cartoes.map(async (c) => `<div style="width:210px;text-align:center;border:1.5px dashed #888;border-radius:12px;padding:12px;page-break-inside:avoid"><div style="font-size:11px;letter-spacing:2px;color:#666">COMANDA</div><div style="font-size:40px;font-weight:700;line-height:1.1">${c.numero}</div><img src="${await Q.toDataURL(c.token, { width: 260, margin: 1 })}" width="170"/><p style="font-size:12px;margin:6px 0 0;color:#444">Aponte no tablet da mesa<br/>para fazer seu pedido</p></div>`))
    w.document.write(`<html><head><title>Cartões de comanda</title></head><body style="font-family:sans-serif;display:flex;flex-wrap:wrap;gap:14px;margin:12px">${cards.join('')}</body></html>`)
    w.document.close(); w.print()
  }
  if (!cfg) return <Carregando />
  const set = (p: Partial<Cfg>) => setCfg({ ...cfg, ...p })
  const Chave = (k: keyof Cfg, r: string, d: string) => (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-line p-3">
      <span className="text-sm"><b className="block">{r}</b><span className="text-xs text-ink-soft">{d}</span></span>
      <input type="checkbox" role="switch" className="mt-1 h-5 w-9 shrink-0 accent-[var(--color-brand,#16a34a)]" checked={Boolean(cfg[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<Cfg>)} />
    </label>
  )
  const Titulo = ({ n, t, d, acao }: { n: number; t: string; d: string; acao?: React.ReactNode }) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{n}</span>
        <div><h2 className="font-semibold leading-tight">{t}</h2><p className="mt-0.5 max-w-2xl text-xs text-ink-soft">{d}</p></div>
      </div>
      {acao}
    </div>
  )
  const agora = Date.now()
  return (
    <div className="space-y-5">
      <Avisos s={s} />

      <section className={`${cartaoCls} space-y-4 p-5`}>
        <Titulo n={1} t="Como o cliente pede" d="Liga ou desliga o pedido pelo tablet e define o que o cliente pode fazer sozinho." />
        <div className="grid gap-2 md:grid-cols-2">
          {Chave('tablet_qr_ativo', 'Pedidos pelo QR Code', 'Desligado, o tablet só mostra o cardápio.')}
          {Chave('tablet_exige_checkin', 'Exigir check-in', 'Só aceita pedido de comanda aberta pela recepção.')}
          {Chave('tablet_pode_chamar_garcom', 'Chamar o garçom', 'Botão no tablet; imprime o aviso no caixa.')}
          {Chave('tablet_pode_pedir_conta', 'Pedir a conta', 'Muda a comanda para "pedindo conta".')}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Campo r="Endereço público do sistema (usado nos links)"><input className={inputCls} placeholder={window.location.origin} value={cfg.tablet_url_base ?? ''} onChange={(e) => set({ tablet_url_base: e.target.value })} /></Campo>
          <Campo r="Mensagem de boas-vindas"><input className={inputCls} value={cfg.tablet_mensagem_boas_vindas ?? ''} onChange={(e) => set({ tablet_mensagem_boas_vindas: e.target.value })} /></Campo>
          <Campo r="Serviço (%)"><input className={inputCls} defaultValue={cfg.taxa_servico_pct} onChange={(e) => set({ taxa_servico_pct: lerNumero(e.target.value) ?? 0 })} /></Campo>
          <Campo r="Couvert (R$)"><input className={inputCls} defaultValue={cfg.couvert} onChange={(e) => set({ couvert: lerNumero(e.target.value) ?? 0 })} /></Campo>
        </div>
        <div className="flex justify-end"><button className={btnCls} onClick={salvar}>Salvar configurações</button></div>
      </section>

      <section className={`${cartaoCls} space-y-4 p-5`}>
        <Titulo n={2} t="Cartões de comanda (QR Code)" d="O QR é do cartão da comanda: o cliente lê o do cartão dele no tablet para enviar o pedido. Já tem cartões impressos? Leia o QR de cada um e informe o número."
          acao={<button className={btnSecCls} onClick={imprimirCartoes} disabled={!cartoes.length}>🖨️ Imprimir {cartoes.length || ''} cartões</button>} />
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-brand-soft p-3">
          <label className="text-xs font-medium text-ink-soft">Nº da comanda
            <input className={inputCls + ' !w-28'} inputMode="numeric" placeholder="Ex.: 12" value={numCartao} onChange={(e) => setNumCartao(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </label>
          <button className={btnCls} disabled={!numCartao} onClick={() => setLendo(true)}>📷 Ler QR do cartão</button>
          <button className={btnSecCls} disabled={!numCartao} onClick={() => cadastrarCartao(Number(numCartao), '')}>✨ Gerar QR novo</button>
          <span className="pb-2 text-xs text-ink-soft">{cartoes.length} cartão(ões) cadastrado(s)</span>
        </div>
        {lendo && <LeitorQr titulo={`Aponte para o QR do cartão da comanda ${numCartao}`} onLido={(t) => { setLendo(false); cadastrarCartao(Number(numCartao), t.trim()) }} onCancelar={() => setLendo(false)} />}
        {!cartoes.length ? <Vazio texto="Nenhum cartão cadastrado." /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {cartoes.map((c) => (
              <div key={c.numero} className="relative rounded-xl border border-line p-2 text-center">
                <button className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full text-alert hover:bg-red-50" aria-label={`Remover cartão ${c.numero}`} title="Remover cartão" onClick={async () => { if (window.confirm(`Remover o cartão ${c.numero}?`)) { await db.from('pdv_cartoes').delete().eq('numero', c.numero); carregar() } }}>×</button>
                <div className="text-[10px] font-medium tracking-widest text-ink-soft">COMANDA</div>
                <div className="text-2xl font-bold leading-tight">{c.numero}</div>
                {qrs[c.numero] ? <img src={qrs[c.numero]} alt={`QR da comanda ${c.numero}`} className="mx-auto mt-1 h-24 w-24" /> : <div className="mx-auto mt-1 h-24 w-24 animate-pulse rounded bg-line" />}
                <div className="mt-1 truncate text-[10px] text-ink-soft" title={c.token}>…{c.token.slice(-8)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${cartaoCls} space-y-3 p-5`}>
        <Titulo n={3} t="Endereço do tablet" d="Use o endereço único em todos os tablets: na primeira vez o tablet pede o PIN de supervisor e a mesa, e depois abre sempre nela. Trocar de mesa depois: segure o topo da tela e digite o PIN. Dois tablets podem ficar na mesma mesa." />
        <button className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border p-4 text-left transition ${copiado === 'unico' ? 'border-green-500 bg-green-50' : 'border-brand/40 bg-brand-soft hover:border-brand'}`} onClick={() => copiar('unico', `${base}/mesa`)} title="Copiar endereço único">
          <span><span className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">Endereço único (recomendado)</span><span className="block break-all text-base font-bold">{base}/mesa</span></span>
          <span className="text-sm font-medium text-brand">{copiado === 'unico' ? '✓ Link copiado' : 'Copiar'}</span>
        </button>
        <p className="pt-1 text-xs text-ink-soft">O PIN é cadastrado em PDV · Configurações › Senhas (PIN), marcando "pode autorizar". Ou use o link de uma mesa específica abaixo.</p>
        {!mesas.length ? <Vazio texto="Cadastre mesas primeiro." /> : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {mesas.map((m) => (
              <button key={m.id} className={`rounded-xl border p-3 text-left transition ${copiado === 'm' + m.id ? 'border-green-500 bg-green-50' : 'border-line hover:border-brand'}`} onClick={() => copiar('m' + m.id, urlMesa(m))} title="Copiar endereço do tablet">
                <span className="block text-lg font-bold">Mesa {m.numero}</span>
                <span className="text-xs text-ink-soft">{copiado === 'm' + m.id ? '✓ Link copiado' : 'Toque para copiar o link'}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <BateriaTablets />

      <section className={`${cartaoCls} space-y-3 p-5`}>
        <Titulo n={4} t="Dispositivos" d="Tablets, celulares de garçom e agentes de impressão/WhatsApp conectados ao sistema." />
        <div className="flex flex-wrap gap-2">
          <input className={inputCls + ' !w-56'} placeholder="Nome (ex.: Agente cozinha)" value={nd.nome} onChange={(e) => setNd({ ...nd, nome: e.target.value })} />
          <select className={inputCls + ' !w-48'} value={nd.tipo} onChange={(e) => setNd({ ...nd, tipo: e.target.value })}><option value="tablet">tablet</option><option value="garcom">celular garçom</option><option value="caixa">caixa</option><option value="agente_impressao">agente de impressão</option><option value="agente_whatsapp">agente de WhatsApp</option></select>
          <button className={btnSecCls} onClick={addDisp}>Cadastrar</button>
        </div>
        {!disps.length ? <Vazio texto="Nenhum dispositivo cadastrado." /> : (
          <ul className="grid gap-2 md:grid-cols-2">
            {disps.map((d) => {
              const on = !!d.ultimo_ping && agora - new Date(d.ultimo_ping).getTime() < 3 * 60 * 1000
              return (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
                  <span className="min-w-0">
                    <b className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-green-500' : 'bg-gray-300'}`} />{d.nome}</b>
                    <span className="text-xs text-ink-soft">{d.tipo} · {d.ultimo_ping ? `visto ${new Date(d.ultimo_ping).toLocaleString('pt-BR')}` : 'nunca conectou'}</span>
                  </span>
                  <span className="flex shrink-0 gap-3 text-xs">
                    <button className="text-brand" onClick={() => copiar('d' + d.id, d.token)}>{copiado === 'd' + d.id ? '✓ copiado' : 'copiar token'}</button>
                    <button className="text-alert" onClick={async () => { if (window.confirm('Remover dispositivo?')) { await db.from('pdv_dispositivos').delete().eq('id', d.id); carregar() } }}>remover</button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
