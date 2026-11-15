import { useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, btnCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { Avisos, Campo, useSalvarMsg } from './PdvConfig'
import { lerPosicao } from '../../lib/localizacao'

interface Cfg { geo_ativo: boolean; local_lat: number | null; local_lng: number | null; raio_equipe_m: number; raio_tablet_m: number; geo_tablet_ativo: boolean }

const metros = (a: number, b: number, c: number, d: number) => {
  const r = Math.PI / 180
  const h = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)))
}

export function ConfigLocal() {
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [teste, setTeste] = useState('')
  const [buscando, setBuscando] = useState(false)
  const s = useSalvarMsg()
  useEffect(() => {
    db.from('pdv_config').select('geo_ativo,local_lat,local_lng,raio_equipe_m,raio_tablet_m,geo_tablet_ativo').eq('id', 1).single().then(({ data }: { data: Cfg | null }) => {
      if (!data) return
      setCfg(data); setLat(data.local_lat != null ? String(data.local_lat) : ''); setLng(data.local_lng != null ? String(data.local_lng) : '')
    })
  }, [])
  if (!cfg) return <Carregando />

  async function aqui() {
    setBuscando(true); s.ok('')
    try { const p = await lerPosicao(); setLat(p.lat.toFixed(6)); setLng(p.lng.toFixed(6)); s.ok(`Posição capturada (precisão de ${Math.round(p.precisao)} m). Confira e clique em Salvar.`) }
    catch (e) { s.falha((e as Error).message) }
    setBuscando(false)
  }
  async function medir() {
    const la = Number(lat.replace(',', '.')), lo = Number(lng.replace(',', '.'))
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return setTeste('Salve primeiro a localização do restaurante.')
    try { const p = await lerPosicao(); setTeste(`Você está a ${metros(la, lo, p.lat, p.lng)} m do ponto cadastrado (precisão do GPS: ${Math.round(p.precisao)} m).`) }
    catch (e) { setTeste((e as Error).message) }
  }
  async function salvar() {
    const la = Number(lat.replace(',', '.')), lo = Number(lng.replace(',', '.'))
    if (cfg!.geo_ativo && (!Number.isFinite(la) || !Number.isFinite(lo) || !lat || !lng)) return s.falha('Para ativar, informe a localização do restaurante (use "Usar minha localização agora" estando lá).')
    if (lat && (Math.abs(la) > 90 || Math.abs(lo) > 180)) return s.falha('Coordenadas inválidas.')
    const { error } = await db.from('pdv_config').update({
      geo_ativo: cfg!.geo_ativo, local_lat: lat ? la : null, local_lng: lng ? lo : null,
      raio_equipe_m: Math.min(5000, Math.max(20, Math.round(cfg!.raio_equipe_m || 200))),
      raio_tablet_m: Math.min(5000, Math.max(20, Math.round(cfg!.raio_tablet_m || 500))), geo_tablet_ativo: cfg!.geo_tablet_ativo,
    }).eq('id', 1)
    if (error) return s.falha(error.message)
    s.ok('Salvo.')
  }
  const set = (p: Partial<Cfg>) => setCfg({ ...cfg, ...p })
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <p className="rounded-xl bg-brand-soft p-3 text-sm">
        Os usuários marcados com <b>"Só opera dentro do restaurante"</b> (em Usuários) só conseguem abrir comanda, lançar pedido e receber enquanto o GPS do aparelho
        estiver dentro do raio abaixo. Administradores nunca são bloqueados. O GPS do celular pode ser falsificado por quem entende do assunto: isto impede o uso casual de longe, não é à prova de fraude.
      </p>
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <h2 className="font-semibold">Onde fica o restaurante</h2>
        <button className={btnSecCls} disabled={buscando} onClick={aqui}>{buscando ? 'Buscando…' : 'Usar minha localização agora (estando no restaurante)'}</button>
        <div className="grid grid-cols-2 gap-2">
          <Campo r="Latitude"><input className={inputCls} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} /></Campo>
          <Campo r="Longitude"><input className={inputCls} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} /></Campo>
        </div>
        <div className="flex flex-wrap items-center gap-2"><button className={btnSecCls} onClick={medir}>Testar: quanto estou longe?</button>{teste && <span className="text-sm">{teste}</span>}</div>
      </section>
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <h2 className="font-semibold">Equipe (usuários marcados)</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.geo_ativo} onChange={(e) => set({ geo_ativo: e.target.checked })} />Ativar a restrição por localização</label>
        <Campo r="Raio permitido (metros)"><input className={inputCls} inputMode="numeric" value={cfg.raio_equipe_m} onChange={(e) => set({ raio_equipe_m: Number(e.target.value.replace(/\D/g, '')) })} /></Campo>
      </section>
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <h2 className="font-semibold">Tablets das mesas</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.geo_tablet_ativo} onChange={(e) => set({ geo_tablet_ativo: e.target.checked })} />Só aceitar pedido do tablet/QR dentro do raio (cada tablet precisa permitir a localização uma vez)</label>
        <Campo r="Raio permitido para os tablets (metros)"><input className={inputCls} inputMode="numeric" value={cfg.raio_tablet_m} onChange={(e) => set({ raio_tablet_m: Number(e.target.value.replace(/\D/g, '')) })} /></Campo>
      </section>
      <button className={btnCls} onClick={salvar}>Salvar</button>
    </div>
  )
}
