import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { supabase } from '../../integrations/supabase/client'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { Avisos, Campo, useSalvarMsg } from './PdvConfig'
import { reduzir } from '../../lib/imagem'
import { Tablet } from './ConfigTablet'
import { TabletLayout } from './TabletLayout'
import { CardapioTablet, HorariosEditor, resumoHorario } from './CardapioTablet'
import type { Faixa } from '../../lib/pdv'

type Aba = 'cardapio' | 'banners' | 'indicacoes' | 'layout' | 'mesas'
const ABAS: { v: Aba; r: string }[] = [
  { v: 'cardapio', r: 'Cardápio: menus e horários' },
  { v: 'banners', r: 'Banners patrocinados' },
  { v: 'indicacoes', r: 'Indicações de pratos' },
  { v: 'layout', r: 'Layout do tablet' },
  { v: 'mesas', r: 'Mesas, QR Code e dispositivos' },
]

export function GestaoTablet() {
  const [aba, setAba] = useState<Aba>('cardapio')
  return (
    <div>
      <Cabecalho titulo="Gestão do tablet" subtitulo="Menus e horários, banners, indicações, layout, mesas e QR Code do cardápio digital" />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {ABAS.map((a) => <button key={a.v} className={aba === a.v ? btnCls : btnSecCls} onClick={() => setAba(a.v)}>{a.r}</button>)}
      </div>
      {aba === 'cardapio' && <CardapioTablet />}
      {aba === 'banners' && <Banners />}
      {aba === 'indicacoes' && <Indicacoes />}
      {aba === 'layout' && <TabletLayout />}
      {aba === 'mesas' && <Tablet />}
      <p className="mt-6 rounded-xl bg-brand-soft p-3 text-xs text-ink-soft">
        <b>No tablet:</b> segure o dedo ~1 s no topo da tela (onde aparece "Mesa X") para trocar o número da mesa, ou na logo para sair do cardápio. Nos dois casos o tablet pede o e-mail e a senha de um usuário do sistema com acesso ao PDV. Mesa com reserva do dia mostra a tela "Mesa reservada" com o nome; um toque na tela libera.
      </p>
    </div>
  )
}

interface Banner { id: string; titulo: string; patrocinador: string | null; imagem_url: string; produto_id: string | null; ativo: boolean; ordem: number; inicio: string | null; fim: string | null; horarios?: Faixa[] | null }
interface Prod { id: string; nome: string; preco: number; foto_url: string | null; indicacao: boolean; indicacao_rotulo: string | null; ativo: boolean }

function Banners() {
  const [lista, setLista] = useState<Banner[] | null>(null)
  const [prods, setProds] = useState<Prod[]>([])
  const [ed, setEd] = useState<Partial<Banner> | null>(null)
  const [env, setEnv] = useState(false)
  const s = useSalvarMsg()
  const carregar = useCallback(async () => {
    const [b, p] = await Promise.all([db.from('pdv_banners').select('*').order('ordem').order('criado_em'), db.from('pdv_produtos').select('id,nome,preco,foto_url,indicacao,indicacao_rotulo,ativo').eq('ativo', true).order('nome')])
    setLista((b.data ?? []) as Banner[]); setProds((p.data ?? []) as Prod[])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function enviar(arq?: File) {
    if (!arq || !ed) return
    setEnv(true)
    try {
      const f = await reduzir(arq)
      const path = `banners/${crypto.randomUUID()}.${f.name.split('.').pop()?.toLowerCase() || 'jpg'}`
      const up = await supabase.storage.from('tablet').upload(path, f, { contentType: f.type })
      if (up.error) throw up.error
      setEd({ ...ed, imagem_url: supabase.storage.from('tablet').getPublicUrl(path).data.publicUrl })
    } catch (x) { s.falha((x as Error).message) }
    setEnv(false)
  }
  async function salvar() {
    if (!ed?.imagem_url) return s.falha('Envie a imagem do banner.')
    const dados = { titulo: (ed.titulo ?? '').trim(), patrocinador: ed.patrocinador?.trim() || null, imagem_url: ed.imagem_url, produto_id: ed.produto_id || null, ativo: ed.ativo !== false, inicio: ed.inicio || null, fim: ed.fim || null, horarios: ed.horarios?.length ? ed.horarios : null }
    const r = ed.id ? await db.from('pdv_banners').update(dados).eq('id', ed.id) : await db.from('pdv_banners').insert({ ...dados, ordem: (lista?.length ?? 0) + 1 })
    if (r.error) s.falha(r.error.message); else { s.ok(); setEd(null); carregar() }
  }
  async function mover(b: Banner, d: -1 | 1) {
    if (!lista) return
    const i = lista.findIndex((x) => x.id === b.id), o = lista[i + d]
    if (!o) return
    await Promise.all([db.from('pdv_banners').update({ ordem: i + d }).eq('id', b.id), db.from('pdv_banners').update({ ordem: i }).eq('id', o.id)])
    carregar()
  }
  async function apagar(b: Banner) {
    if (!window.confirm('Excluir este banner?')) return
    await db.from('pdv_banners').delete().eq('id', b.id); carregar()
  }
  if (!lista) return <Carregando />
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div><h2 className="font-semibold">Banners patrocinados</h2><p className="text-xs text-ink-soft">Aparecem no topo do cardápio do tablet (formato largo, 3:1), girando a cada 6 s. Pode ligar a um prato.</p></div>
          <button className={btnCls} onClick={() => setEd({ ativo: true })}>Novo banner</button>
        </div>
        {!lista.length ? <Vazio texto="Nenhum banner cadastrado." /> : (
          <ul className="space-y-2">
            {lista.map((b, i) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-2">
                <img src={b.imagem_url} alt="" className="h-16 w-48 rounded-lg object-cover" />
                <div className="min-w-0 flex-1 text-sm">
                  <b>{b.titulo || 'Sem título'}</b>{b.patrocinador && <span className="text-ink-soft"> · {b.patrocinador}</span>}
                  <div className="text-xs text-ink-soft">{b.ativo ? 'Ativo' : 'Pausado'}{b.inicio || b.fim ? ` · ${b.inicio ? new Date(b.inicio + 'T12:00').toLocaleDateString('pt-BR') : '…'} a ${b.fim ? new Date(b.fim + 'T12:00').toLocaleDateString('pt-BR') : '…'}` : ''}{b.horarios?.length ? ` · ${resumoHorario(b.horarios)}` : ''}{b.produto_id ? ` · abre: ${prods.find((p) => p.id === b.produto_id)?.nome ?? 'prato'}` : ''}</div>
                </div>
                <div className="flex gap-1">
                  <button className={btnSecCls + ' !min-h-[38px]'} disabled={i === 0} onClick={() => mover(b, -1)}>↑</button>
                  <button className={btnSecCls + ' !min-h-[38px]'} disabled={i === lista.length - 1} onClick={() => mover(b, 1)}>↓</button>
                  <button className={btnSecCls + ' !min-h-[38px]'} onClick={() => setEd(b)}>Editar</button>
                  <button className={btnPerigoCls + ' !min-h-[38px]'} onClick={() => apagar(b)}>Excluir</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {ed && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setEd(null)}>
          <div className={`${cartaoCls} max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto p-5`} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{ed.id ? 'Editar banner' : 'Novo banner'}</h3>
            {ed.imagem_url && <img src={ed.imagem_url} alt="" className="aspect-[3/1] w-full rounded-xl object-cover" />}
            <label className="block text-sm">Imagem (ideal 1500×500)<input type="file" accept="image/*" className="mt-1 block w-full text-sm" onChange={(e) => enviar(e.target.files?.[0])} /></label>
            {env && <p className="text-xs text-ink-soft">Enviando…</p>}
            <Campo r="Título (uso interno)"><input className={inputCls} value={ed.titulo ?? ''} onChange={(e) => setEd({ ...ed, titulo: e.target.value })} /></Campo>
            <Campo r="Patrocinador (aparece como “Patrocinado · nome”)"><input className={inputCls} value={ed.patrocinador ?? ''} onChange={(e) => setEd({ ...ed, patrocinador: e.target.value })} /></Campo>
            <Campo r="Ao tocar, abrir o prato (opcional)">
              <select className={inputCls} value={ed.produto_id ?? ''} onChange={(e) => setEd({ ...ed, produto_id: e.target.value || null })}>
                <option value="">Nenhum</option>{prods.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo r="Início (opcional)"><input type="date" className={inputCls} value={ed.inicio ?? ''} onChange={(e) => setEd({ ...ed, inicio: e.target.value || null })} /></Campo>
              <Campo r="Fim (opcional)"><input type="date" className={inputCls} value={ed.fim ?? ''} onChange={(e) => setEd({ ...ed, fim: e.target.value || null })} /></Campo>
            </div>
            <details className="rounded-xl border border-line p-2 text-sm"><summary className="cursor-pointer font-medium">Horário no dia (opcional): {resumoHorario(ed.horarios)}</summary><div className="mt-2"><HorariosEditor valor={ed.horarios ?? null} onChange={(v) => setEd({ ...ed, horarios: v })} /></div></details>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.ativo !== false} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} />Ativo no tablet</label>
            <div className="flex justify-end gap-2"><button className={btnSecCls} onClick={() => setEd(null)}>Cancelar</button><button className={btnCls} onClick={salvar} disabled={env}>Salvar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

function Indicacoes() {
  const [prods, setProds] = useState<Prod[] | null>(null)
  const [busca, setBusca] = useState('')
  const s = useSalvarMsg()
  const carregar = useCallback(async () => {
    const { data } = await db.from('pdv_produtos').select('id,nome,preco,foto_url,indicacao,indicacao_rotulo,ativo').eq('ativo', true).order('nome')
    setProds((data ?? []) as Prod[])
  }, [])
  useEffect(() => { carregar() }, [carregar])
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return (prods ?? []).filter((p) => !t || p.nome.toLowerCase().includes(t)).sort((a, b) => Number(b.indicacao) - Number(a.indicacao) || a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [prods, busca])
  async function patch(p: Prod, campos: Partial<Prod>) {
    setProds((ps) => (ps ?? []).map((x) => (x.id === p.id ? { ...x, ...campos } : x)))
    const { error } = await db.from('pdv_produtos').update(campos).eq('id', p.id)
    if (error) { s.falha(error.message); carregar() }
  }
  if (!prods) return <Carregando />
  const n = prods.filter((p) => p.indicacao).length
  return (
    <div className="space-y-3">
      <Avisos s={s} />
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <div><h2 className="font-semibold">Indicações de pratos</h2><p className="text-xs text-ink-soft">Os pratos marcados aparecem na faixa “Indicações da casa” no topo do cardápio do tablet. {n} indicado(s) hoje.</p></div>
        <input className={inputCls} placeholder="Buscar prato" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <ul className="divide-y divide-line">
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              {p.foto_url ? <img src={p.foto_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-lg bg-brand-soft font-semibold text-brand">{p.nome.slice(0, 1)}</span>}
              <span className="min-w-0 flex-1"><b>{p.nome}</b><span className="block text-xs text-ink-soft">{reais(Number(p.preco))}</span></span>
              {p.indicacao && <input className={inputCls + ' !w-52'} placeholder="Selo (ex.: Indicação do chef)" defaultValue={p.indicacao_rotulo ?? ''} onBlur={(e) => patch(p, { indicacao_rotulo: e.target.value.trim() || null })} />}
              <button className={p.indicacao ? btnCls : btnSecCls} onClick={() => patch(p, { indicacao: !p.indicacao })}>{p.indicacao ? '★ Indicado' : 'Indicar'}</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
