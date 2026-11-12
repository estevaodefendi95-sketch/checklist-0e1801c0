import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, Vazio, btnCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { lerNumero } from '../../lib/formato'
import { Mesa } from '../../lib/pdv'
import { Avisos, Campo, useSalvarMsg } from './PdvConfig'

interface Cfg { taxa_servico_pct: number; couvert: number; tablet_qr_ativo: boolean; tablet_exige_checkin: boolean; tablet_url_base: string | null; tablet_mensagem_boas_vindas: string | null; tablet_tempo_inatividade_min: number; tablet_pode_chamar_garcom: boolean; tablet_pode_pedir_conta: boolean }
interface Disp { id: string; nome: string; tipo: string; token: string; ativo: boolean; ultimo_ping: string | null }

export function Tablet() {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [disps, setDisps] = useState<Disp[]>([])
  const [qrs, setQrs] = useState<Record<string, string>>({})
  const [nd, setNd] = useState({ nome: '', tipo: 'tablet' })
  const s = useSalvarMsg()
  const carregar = useCallback(async () => {
    const [a, b, c] = await Promise.all([db.from('pdv_config').select('*').single(), db.from('pdv_mesas').select('*').eq('ativo', true).order('numero'), db.from('pdv_dispositivos').select('*').order('criado_em')])
    setCfg(a.data as Cfg); setMesas((b.data ?? []) as Mesa[]); setDisps((c.data ?? []) as Disp[])
  }, [])
  useEffect(() => { carregar() }, [carregar])
  const base = (cfg?.tablet_url_base || window.location.origin).replace(/\/$/, '')
  const urlMesa = (m: Mesa) => `${base}/mesa/${m.qr_token}`
  useEffect(() => {
    if (!mesas.length) return
    import('qrcode').then(async (Q) => {
      const o: Record<string, string> = {}
      for (const m of mesas) o[m.id] = await Q.toDataURL(urlMesa(m), { width: 240, margin: 1 })
      setQrs(o)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesas, cfg?.tablet_url_base])
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
  function imprimirQrs() {
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<html><body style="font-family:sans-serif;display:flex;flex-wrap:wrap;gap:16px">${mesas.map((m) => `<div style="width:220px;text-align:center;border:1px solid #999;padding:10px;page-break-inside:avoid"><h2>Mesa ${m.numero}</h2><img src="${qrs[m.id]}" width="200"/><p>Aponte a câmera para pedir</p></div>`).join('')}</body></html>`)
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
      <section className={`${cartaoCls} p-4`}>
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">QR Code das mesas</h2><button className={btnSecCls} onClick={imprimirQrs} disabled={!mesas.length}>Imprimir todos</button></div>
        {!mesas.length ? <Vazio texto="Cadastre mesas primeiro." /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {mesas.map((m) => (
              <div key={m.id} className="rounded-xl border border-line p-2 text-center text-xs">
                <b className="text-sm">Mesa {m.numero}</b>
                {qrs[m.id] && <img src={qrs[m.id]} alt={`QR mesa ${m.numero}`} className="mx-auto mt-1 w-full" />}
                <button className="mt-1 text-brand" onClick={() => navigator.clipboard?.writeText(urlMesa(m))}>copiar link</button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-soft">O QR é fixo por mesa. O pedido só entra se houver comanda aberta na mesa (check-in), então foto do QR não permite pedir de fora.</p>
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
