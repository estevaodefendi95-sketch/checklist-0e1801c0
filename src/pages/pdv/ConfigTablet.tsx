import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, Vazio, btnCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { lerNumero } from '../../lib/formato'
import { Mesa } from '../../lib/pdv'
import { LeitorQr } from '../../components/LeitorQr'
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
  const s = useSalvarMsg()
  const carregar = useCallback(async () => {
    const [a, b, c, k] = await Promise.all([db.from('pdv_config').select('*').single(), db.from('pdv_mesas').select('*').eq('ativo', true).order('numero'), db.from('pdv_dispositivos').select('*').order('criado_em'), db.from('pdv_cartoes').select('numero,token').order('numero')])
    setCartoes((k.data ?? []) as { numero: number; token: string }[])
    setCfg(a.data as Cfg); setMesas((b.data ?? []) as Mesa[]); setDisps((c.data ?? []) as Disp[])
  }, [])
  useEffect(() => { carregar() }, [carregar])
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
    const cards = await Promise.all(cartoes.map(async (c) => `<div style="width:200px;text-align:center;border:1px solid #999;padding:10px;page-break-inside:avoid"><h2 style="margin:0 0 6px">Comanda ${c.numero}</h2><img src="${await Q.toDataURL(c.token, { width: 220, margin: 1 })}" width="180"/><p style="font-size:12px;margin:4px 0 0">Aponte no tablet para pedir</p></div>`))
    w.document.write(`<html><body style="font-family:sans-serif;display:flex;flex-wrap:wrap;gap:12px">${cards.join('')}</body></html>`)
    w.document.close(); w.print()
  }
  if (!cfg) return <Carregando />
  const set = (p: Partial<Cfg>) => setCfg({ ...cfg, ...p })
  const Chk = (k: keyof Cfg, r: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(cfg[k])} onChange={(e) => set({ [k]: e.target.checked } as Partial<Cfg>)} />{r}</label>
  )
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <h2 className="font-semibold">Pedido pelo tablet / QR Code</h2>
        {Chk('tablet_qr_ativo', 'Pedidos pelo QR Code ativos')}
        {Chk('tablet_exige_checkin', 'Só aceitar pedido depois do check-in (comanda aberta pela recepção)')}
        {Chk('tablet_pode_chamar_garcom', 'Cliente pode chamar o garçom')}
        {Chk('tablet_pode_pedir_conta', 'Cliente pode pedir a conta')}
        <Campo r="Endereço público do sistema (usado no QR Code)"><input className={inputCls} placeholder={window.location.origin} value={cfg.tablet_url_base ?? ''} onChange={(e) => set({ tablet_url_base: e.target.value })} /></Campo>
        <Campo r="Mensagem de boas-vindas"><input className={inputCls} value={cfg.tablet_mensagem_boas_vindas ?? ''} onChange={(e) => set({ tablet_mensagem_boas_vindas: e.target.value })} /></Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo r="Serviço (%)"><input className={inputCls} defaultValue={cfg.taxa_servico_pct} onChange={(e) => set({ taxa_servico_pct: lerNumero(e.target.value) ?? 0 })} /></Campo>
          <Campo r="Couvert (R$)"><input className={inputCls} defaultValue={cfg.couvert} onChange={(e) => set({ couvert: lerNumero(e.target.value) ?? 0 })} /></Campo>
        </div>
        <button className={btnCls} onClick={salvar}>Salvar</button>
      </section>
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div><h2 className="font-semibold">Cartões de comanda (QR Code)</h2><p className="text-xs text-ink-soft">O QR Code é do cartão da comanda: o cliente lê o do cartão dele no tablet para enviar o pedido. Se já tem cartões impressos, leia o QR de cada um e diga o número.</p></div>
          <button className={btnSecCls} onClick={imprimirCartoes} disabled={!cartoes.length}>Imprimir cartões</button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-soft">Nº da comanda<input className={inputCls + ' !w-28'} inputMode="numeric" value={numCartao} onChange={(e) => setNumCartao(e.target.value.replace(/\D/g, '').slice(0, 4))} /></label>
          <button className={btnCls} disabled={!numCartao} onClick={() => setLendo(true)}>Ler QR do cartão</button>
          <button className={btnSecCls} disabled={!numCartao} onClick={() => cadastrarCartao(Number(numCartao), '')}>Gerar QR novo para este nº</button>
        </div>
        {lendo && <LeitorQr titulo={`Aponte para o QR do cartão da comanda ${numCartao}`} onLido={(t) => { setLendo(false); cadastrarCartao(Number(numCartao), t.trim()) }} onCancelar={() => setLendo(false)} />}
        {!cartoes.length ? <Vazio texto="Nenhum cartão cadastrado." /> : (
          <div className="flex flex-wrap gap-1.5">
            {cartoes.map((c) => (
              <span key={c.numero} className="group inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-sm" title={c.token}>
                <b>{c.numero}</b><span className="max-w-24 truncate text-[10px] text-ink-soft">{c.token.slice(-8)}</span>
                <button className="text-alert" aria-label={`Remover cartão ${c.numero}`} onClick={async () => { if (window.confirm(`Remover o cartão ${c.numero}?`)) { await db.from('pdv_cartoes').delete().eq('numero', c.numero); carregar() } }}>×</button>
              </span>
            ))}
          </div>
        )}
      </section>
      <section className={`${cartaoCls} p-4`}>
        <h2 className="mb-1 font-semibold">Endereço do tablet de cada mesa</h2>
        <p className="mb-2 text-xs text-ink-soft">Cada tablet fica aberto no endereço da mesa onde está (só para configurar o aparelho; o cliente não usa isso). Para trocar depois, segure o topo da tela do tablet.</p>
        {!mesas.length ? <Vazio texto="Cadastre mesas primeiro." /> : (
          <div className="flex flex-wrap gap-1.5">
            {mesas.map((m) => <button key={m.id} className="rounded-lg border border-line px-3 py-1.5 text-sm" onClick={() => navigator.clipboard?.writeText(urlMesa(m))} title="copiar endereço do tablet">Mesa {m.numero} · copiar link</button>)}
          </div>
        )}
      </section>
      <section className={`${cartaoCls} space-y-2 p-4`}>
        <h2 className="font-semibold">Dispositivos (tablets, celulares de garçom, agente de impressão)</h2>
        <div className="flex flex-wrap gap-2">
          <input className={inputCls + ' !w-52'} placeholder="Nome (ex.: Agente cozinha)" value={nd.nome} onChange={(e) => setNd({ ...nd, nome: e.target.value })} />
          <select className={inputCls + ' !w-44'} value={nd.tipo} onChange={(e) => setNd({ ...nd, tipo: e.target.value })}><option value="tablet">tablet</option><option value="garcom">celular garçom</option><option value="caixa">caixa</option><option value="agente_impressao">agente de impressão</option><option value="agente_whatsapp">agente de WhatsApp</option></select>
          <button className={btnSecCls} onClick={addDisp}>Cadastrar</button>
        </div>
        <ul className="divide-y divide-line text-sm">
          {disps.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b>{d.nome}</b> · {d.tipo} {d.ultimo_ping && `· visto ${new Date(d.ultimo_ping).toLocaleString('pt-BR')}`}</span>
              <span className="flex gap-2">
                <button className="text-brand" onClick={() => navigator.clipboard?.writeText(d.token)}>copiar token</button>
                <button className="text-alert" onClick={async () => { if (window.confirm('Remover dispositivo?')) { await db.from('pdv_dispositivos').delete().eq('id', d.id); carregar() } }}>remover</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
