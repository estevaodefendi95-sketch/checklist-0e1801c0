import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { db, supabase } from '../../lib/supabase'
import { reduzir } from '../../lib/imagem'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais, lerNumero } from '../../lib/formato'
import { Categoria, DESTINOS, Destino, Impressora, Mesa, Produto, Sala, TAM_FORMA, dimMesa } from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'
import { Modal } from './PdvCaixa'
import { Checkin } from './ConfigCheckin'
import { Fiscal, Tef } from './ConfigFiscal'
import { ReimprimirCupons } from './FiscalRapido'
import { ConfigDescontos } from './ConfigDescontos'
import { GruposDoProduto, HorarioCampos, Opcoes, Pilula, RelogioHorario, rotuloHorario } from './ConfigCardapio'

type Aba = 'salao' | 'checkin' | 'produtos' | 'opcoes' | 'impressoras' | 'fiscal' | 'pagamentos' | 'descontos'
const ABAS: { v: Aba; r: string; perm: 'pdv_gerir' | 'pdv_fiscal' }[] = [
  { v: 'salao', r: 'Salão e mesas', perm: 'pdv_gerir' },
  { v: 'checkin', r: 'Check-in: couvert e rodízio', perm: 'pdv_gerir' },
  { v: 'produtos', r: 'Cardápio e preços', perm: 'pdv_gerir' },
  { v: 'opcoes', r: 'Opções e combos', perm: 'pdv_gerir' },
  { v: 'impressoras', r: 'Impressoras', perm: 'pdv_gerir' },
  { v: 'fiscal', r: 'Fiscal (NFC-e)', perm: 'pdv_fiscal' },
  { v: 'descontos', r: 'Descontos', perm: 'pdv_gerir' },
  { v: 'pagamentos', r: 'Pagamentos / TEF', perm: 'pdv_gerir' },
]

export function PdvConfig() {
  const { pode } = usePermissoes()
  const abas = ABAS.filter((a) => pode(a.perm))
  const [aba, setAba] = useState<Aba>(abas[0]?.v ?? 'salao')
  return (
    <div>
      <Cabecalho titulo="Configurações do PDV" subtitulo="Salão, produtos, impressoras, fiscal e pagamentos" />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {abas.map((a) => <button key={a.v} className={aba === a.v ? btnCls : btnSecCls} onClick={() => setAba(a.v)}>{a.r}</button>)}
      </div>
      {aba === 'salao' && <Salao />}
      {aba === 'checkin' && <Checkin />}
      {aba === 'produtos' && <Produtos />}
      {aba === 'opcoes' && <Opcoes />}
      {aba === 'impressoras' && <Impressoras />}
      {aba === 'fiscal' && <Fiscal />}
      {aba === 'descontos' && <ConfigDescontos />}
      {aba === 'pagamentos' && <Tef />}
    </div>
  )
}

export const Campo = ({ r, children }: { r: string; children: React.ReactNode }) => <label className="block text-sm">{r}{children}</label>
export function useSalvarMsg() {
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  return { msg, erro, ok: (m = 'Salvo.') => { setErro(''); setMsg(m) }, falha: (e: string) => { setMsg(''); setErro(e) } }
}
export const Avisos = ({ s }: { s: ReturnType<typeof useSalvarMsg> }) => <>{s.erro && <Erro texto={s.erro} />}{s.msg && <p className="mb-3 rounded-xl bg-brand-soft px-4 py-2 text-sm text-brand">{s.msg}</p>}</>

/* ---------------- Salão ---------------- */
function Salao() {
  const [salas, setSalas] = useState<Sala[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [sala, setSala] = useState<string | null>(null)
  const [nova, setNova] = useState('')
  const [lote, setLote] = useState({ qtd: '10', inicio: '1', cap: '4' })
  const s = useSalvarMsg()
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const area = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([db.from('pdv_salas').select('*').order('ordem'), db.from('pdv_mesas').select('*').order('numero')])
    setSalas((a.data ?? []) as Sala[]); setMesas((b.data ?? []) as Mesa[])
    setSala((x) => x ?? a.data?.[0]?.id ?? null)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function addSala() {
    if (!nova.trim()) return
    const { error } = await db.from('pdv_salas').insert({ nome: nova.trim(), ordem: salas.length })
    if (error) s.falha(error.message); else { setNova(''); carregar() }
  }
  async function gerarMesas() {
    if (!sala) return s.falha('Crie uma sala primeiro.')
    const q = Number(lote.qtd), i0 = Number(lote.inicio)
    const novas = Array.from({ length: q }, (_, k) => {
      const col = k % 6, lin = Math.floor(k / 6)
      return { sala_id: sala, numero: String(i0 + k), capacidade: Number(lote.cap) || 4, pos_x: 20 + col * 120, pos_y: 20 + lin * 120 }
    })
    const { error } = await db.from('pdv_mesas').insert(novas)
    if (error) s.falha(error.code === '23505' ? 'Algum número de mesa já existe.' : error.message)
    else { s.ok(`${q} mesas criadas.`); carregar() }
  }
  async function upd(m: Mesa, p: Partial<Mesa>) {
    setMesas((x) => x.map((k) => (k.id === m.id ? { ...k, ...p } : k)))
    const { error } = await db.from('pdv_mesas').update(p).eq('id', m.id)
    if (error) s.falha(error.message)
  }
  async function novaMesaUnica() {
    if (!sala) return s.falha('Crie uma sala primeiro.')
    const n = Math.max(0, ...mesas.map((m) => parseInt(m.numero, 10) || 0)) + 1
    const k = mesas.filter((m) => m.sala_id === sala).length
    const { error } = await db.from('pdv_mesas').insert({ sala_id: sala, numero: String(n), capacidade: Number(lote.cap) || 4, pos_x: 20 + (k % 6) * 120, pos_y: 20 + Math.floor(k / 6) * 120 })
    if (error) s.falha(error.message); else carregar()
  }
  async function espacar(f: number) {
    const lista = mesas.filter((m) => m.sala_id === sala)
    await Promise.all(lista.map((m) => db.from('pdv_mesas').update({ pos_x: Math.max(0, Math.round((m.pos_x * f) / 10) * 10), pos_y: Math.max(0, Math.round((m.pos_y * f) / 10) * 10) }).eq('id', m.id)))
    carregar()
  }
  async function renumerar(m: Mesa, v: string) {
    const n = v.trim()
    if (!n || n === m.numero) return
    const { error } = await db.from('pdv_mesas').update({ numero: n }).eq('id', m.id)
    if (error) { s.falha(error.code === '23505' ? `Já existe a mesa ${n}.` : error.message); carregar() } else carregar()
  }
  async function remover(m: Mesa) {
    if (!window.confirm(`Remover mesa ${m.numero}?`)) return
    const { error } = await db.from('pdv_mesas').delete().eq('id', m.id)
    if (error) {
      // mesa com histórico não pode ser apagada: sai do salão (desativada) e o histórico continua intacto
      const r = await db.from('pdv_mesas').update({ ativo: false }).eq('id', m.id)
      if (r.error) s.falha(r.error.message); else { s.ok(`Mesa ${m.numero} tem histórico e foi desativada (some do salão).`); carregar() }
    } else carregar()
  }
  function mover(e: React.PointerEvent) {
    const d = drag.current; if (!d || !area.current) return
    const r = area.current.getBoundingClientRect()
    const x = Math.max(0, Math.round((e.clientX - r.left - d.dx) / 10) * 10)
    const y = Math.max(0, Math.round((e.clientY - r.top - d.dy) / 10) * 10)
    setMesas((ms) => ms.map((m) => (m.id === d.id ? { ...m, pos_x: x, pos_y: y } : m)))
  }
  async function soltar() {
    const d = drag.current; drag.current = null
    const m = mesas.find((k) => k.id === d?.id)
    if (m) await db.from('pdv_mesas').update({ pos_x: m.pos_x, pos_y: m.pos_y }).eq('id', m.id)
  }
  const doSala = mesas.filter((m) => m.sala_id === sala)
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <section className={`${cartaoCls} p-4`}>
        <div className="flex flex-wrap items-end gap-2">
          {salas.map((x) => <button key={x.id} className={x.id === sala ? btnCls : btnSecCls} onClick={() => setSala(x.id)}>{x.nome}</button>)}
          <input className={inputCls + ' !w-44'} placeholder="Nova sala (ex.: Salão)" value={nova} onChange={(e) => setNova(e.target.value)} />
          <button className={btnSecCls} onClick={addSala}>Adicionar sala</button>
        </div>
      </section>
      {sala && (
        <>
          <section className={`${cartaoCls} flex flex-wrap items-end gap-2 p-4`}>
            <Campo r="Quantidade"><input className={inputCls + ' !w-24'} value={lote.qtd} onChange={(e) => setLote({ ...lote, qtd: e.target.value })} /></Campo>
            <Campo r="1º número"><input className={inputCls + ' !w-24'} value={lote.inicio} onChange={(e) => setLote({ ...lote, inicio: e.target.value })} /></Campo>
            <Campo r="Lugares"><input className={inputCls + ' !w-24'} value={lote.cap} onChange={(e) => setLote({ ...lote, cap: e.target.value })} /></Campo>
            <button className={btnCls} onClick={gerarMesas}>Gerar mesas em lote</button>
            <button className={btnSecCls} onClick={novaMesaUnica}>+ Uma mesa</button>
            <button className={btnSecCls} onClick={() => espacar(1.2)}>Espaçar</button>
            <button className={btnSecCls} onClick={() => espacar(1 / 1.2)}>Aproximar</button>
          </section>
          <p className="text-sm text-ink-soft">Arraste as mesas para montar o mapa do salão.</p>
          <div ref={area} className={`${cartaoCls} relative overflow-auto`} style={{ height: 480, touchAction: 'none' }} onPointerMove={mover} onPointerUp={soltar} onPointerLeave={soltar}>
            {doSala.map((m) => (
              <div key={m.id}
                onPointerDown={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); drag.current = { id: m.id, dx: e.clientX - r.left, dy: e.clientY - r.top } }}
                style={{ left: m.pos_x, top: m.pos_y, width: dimMesa(m).w, height: dimMesa(m).h, opacity: m.ativo ? 1 : 0.4 }}
                className={`absolute flex cursor-grab select-none items-center justify-center border-2 border-brand bg-brand-soft font-semibold ${m.forma === 'redonda' ? 'rounded-full' : 'rounded-xl'}`}>
                <span className="pointer-events-none text-center leading-tight">{m.numero}<small className="block text-[10px] font-normal opacity-70">{m.capacidade} lug.</small></span>
              </div>
            ))}
          </div>
          <section className={`${cartaoCls} p-4`}>
            <h3 className="mb-2 font-semibold">Mesas da sala</h3>
            {!doSala.length ? <Vazio texto="Nenhuma mesa." /> : (
              <ul className="divide-y divide-line text-sm">
                {doSala.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                    <input className={inputCls + ' !w-20 font-semibold'} defaultValue={m.numero} key={m.id + m.numero} onBlur={(e) => renumerar(m, e.target.value)} title="número da mesa" />
                    <span className="flex items-center gap-1" title="lugares">
                      <button className="h-10 w-10 rounded-lg border border-line text-lg" onClick={() => upd(m, { capacidade: Math.max(1, m.capacidade - 1) })}>−</button>
                      <b className="w-14 text-center">{m.capacidade} lug.</b>
                      <button className="h-10 w-10 rounded-lg bg-brand text-lg text-brand-ink" onClick={() => upd(m, { capacidade: m.capacidade + 1 })}>+</button>
                    </span>
                    <select className={inputCls + ' !w-36'} value={m.sala_id ?? ''} onChange={(e) => upd(m, { sala_id: e.target.value || null, pos_x: 20, pos_y: 20 })} title="sala">
                      {salas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                    <select className={inputCls + ' !w-32'} value={m.forma} onChange={(e) => upd(m, { forma: e.target.value as Mesa['forma'], largura: TAM_FORMA[e.target.value as Mesa['forma']].w, altura: TAM_FORMA[e.target.value as Mesa['forma']].h })}>
                      <option value="quadrada">quadrada</option><option value="redonda">redonda</option><option value="retangular">retangular</option>
                    </select>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={m.ativo} onChange={(e) => upd(m, { ativo: e.target.checked })} />ativa</label>
                    <button className={btnPerigoCls + ' !min-h-[36px]'} onClick={() => remover(m)}>excluir</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/* ---------------- Produtos ---------------- */
function Produtos() {
  const [cats, setCats] = useState<Categoria[]>([])
  const [prods, setProds] = useState<Produto[]>([])
  const [ed, setEd] = useState<Partial<Produto> | null>(null)
  const [nc, setNc] = useState('')
  const [ncDest, setNcDest] = useState<Destino>('cozinha')
  const [pronto, setPronto] = useState(false)
  const [edCat, setEdCat] = useState<Categoria | null>(null)
  const [busca, setBusca] = useState('')
  const s = useSalvarMsg()
  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([db.from('pdv_categorias').select('*').order('ordem'), db.from('pdv_produtos').select('*').order('nome')])
    setCats((a.data ?? []) as Categoria[]); setProds((b.data ?? []) as Produto[]); setPronto(true)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function addCat() {
    if (!nc.trim()) return
    const { error } = await db.from('pdv_categorias').insert({ nome: nc.trim(), ordem: cats.length, destino_padrao: ncDest })
    if (error) s.falha(error.message); else { setNc(''); carregar() }
  }
  async function salvar() {
    if (!ed?.nome?.trim()) return s.falha('Informe o nome.')
    const { id, ...resto } = ed
    const dados = { ...resto, nome: ed.nome.trim(), preco: Number(ed.preco ?? 0), horarios: resto.horarios?.length ? resto.horarios : null, horario_inicio: null, horario_fim: null, dias_semana: null }
    const { error } = id ? await db.from('pdv_produtos').update(dados).eq('id', id) : await db.from('pdv_produtos').insert(dados)
    if (error) return s.falha(error.message)
    setEd(null); s.ok(); carregar()
  }
  async function patch(p: Produto, dados: Partial<Produto>) {
    setProds((x) => x.map((k) => (k.id === p.id ? { ...k, ...dados } : k)))
    const { error } = await db.from('pdv_produtos').update(dados).eq('id', p.id)
    if (error) { s.falha(error.message); carregar() }
  }
  async function alterarPreco(p: Produto, txt: string) {
    const v = lerNumero(txt)
    if (v == null || v < 0) return s.falha('Preço inválido.')
    if (v === Number(p.preco)) return
    const { error } = await db.from('pdv_produtos').update({ preco: v }).eq('id', p.id)
    if (error) return s.falha(error.message)
    setProds((x) => x.map((k) => (k.id === p.id ? { ...k, preco: v } : k)))
    s.ok(`${p.nome}: ${reais(Number(p.preco))} → ${reais(v)}. Já vale no PDV e no tablet (o tablet atualiza em até 10 s).`)
  }
  async function salvarCat() {
    if (!edCat) return
    const { id, ...resto } = edCat
    const { error } = await db.from('pdv_categorias').update({ nome: resto.nome.trim() || 'Categoria', visivel_tablet: resto.visivel_tablet !== false, horarios: resto.horarios?.length ? resto.horarios : null, horario_inicio: null, horario_fim: null, dias_semana: null }).eq('id', id)
    if (error) return s.falha(error.message)
    setEdCat(null); s.ok('Categoria salva.'); carregar()
  }
  async function importarFichas() {
    const { data: f, error } = await db.from('fichas').select('id,nome,preco_venda,foto_url,tipo').eq('ativo', true).gt('preco_venda', 0)
    if (error) return s.falha(error.message)
    const ja = new Set(prods.map((p) => p.ficha_id).filter(Boolean))
    const novos = (f ?? []).filter((x: { id: string }) => !ja.has(x.id))
    if (!novos.length) return s.ok('Nada novo para importar (fichas com preço de venda já estão no PDV).')
    if (!window.confirm(`Importar ${novos.length} ficha(s) com preço de venda como produtos do PDV? Destino inicial: cozinha (ajuste o que for bebida).`)) return
    const { error: e2 } = await db.from('pdv_produtos').insert(
      novos.map((x: { id: string; nome: string; preco_venda: number; foto_url: string | null }) => ({ ficha_id: x.id, nome: x.nome, preco: x.preco_venda, foto_url: x.foto_url, destino: 'cozinha' }))
    )
    if (e2) s.falha(e2.message); else { s.ok(`${novos.length} produtos importados.`); carregar() }
  }
  if (!pronto) return <Carregando />
  const set = (p: Partial<Produto>) => setEd((x) => ({ ...x, ...p }))
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <section className={`${cartaoCls} flex flex-wrap items-end gap-2 p-4`}>
        <Campo r="Nova categoria"><input className={inputCls + ' !w-48'} value={nc} onChange={(e) => setNc(e.target.value)} /></Campo>
        <Campo r="Imprime em"><select className={inputCls + ' !w-32'} value={ncDest} onChange={(e) => setNcDest(e.target.value as Destino)}>{DESTINOS.map((d) => <option key={d}>{d}</option>)}</select></Campo>
        <button className={btnSecCls} onClick={addCat}>Adicionar</button>
        <span className="text-sm text-ink-soft">{cats.map((c) => c.nome).join(' · ')}</span>
      </section>
      <div className="flex flex-wrap gap-2">
        <button className={btnCls} onClick={() => setEd({ destino: 'cozinha', ativo: true, disponivel: true, preco: 0, cfop: '5102', unidade: 'UN', origem: 0 })}>Novo produto</button>
        <button className={btnSecCls} onClick={importarFichas}>Importar das fichas técnicas</button>
      </div>
      <input className={inputCls} placeholder="Buscar produto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {!prods.length ? <Vazio texto="Nenhum produto no PDV." /> : [...cats, { id: '', nome: 'Sem categoria' } as Categoria].map((c) => {
        const lista = prods.filter((p) => (p.categoria_id ?? '') === c.id && (!busca || p.nome.toLowerCase().includes(busca.toLowerCase())))
        if (!lista.length) return null
        const cc = c as Categoria
        return (
          <section key={c.id || 'sem'} className={`${cartaoCls} overflow-hidden`}>
            <header className="flex flex-wrap items-center justify-between gap-2 bg-brand-soft px-3 py-2 text-sm">
              <span><b>{c.nome}</b> <span className="text-ink-soft">{c.id && rotuloHorario(cc.horarios) ? `· ${rotuloHorario(cc.horarios)}` : ''}{c.id && cc.visivel_tablet === false ? ' · oculta no tablet' : ''}</span></span>
              {c.id && <span className="flex items-center gap-2"><button className="text-brand underline" onClick={() => setEdCat(cc)}>editar</button><RelogioHorario horarios={cc.horarios} onClick={() => setEdCat(cc)} /></span>}
            </header>
            <ul className="divide-y divide-line">
              {lista.map((p) => (
                <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 p-3 text-sm ${p.ativo ? '' : 'opacity-50'}`}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setEd(p)}>
                    <b>{p.nome}</b>
                    <span className="block text-xs text-ink-soft">{p.destino}{!p.descricao && ' · sem descrição'}{!p.ncm && ' · sem NCM'}{rotuloHorario(p.horarios) ? ` · ${rotuloHorario(p.horarios)}` : ''}</span>
                  </button>
                  <span className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1">R$
                      <input className={inputCls + ' !min-h-[36px] !w-24'} inputMode="decimal" defaultValue={String(p.preco).replace('.', ',')} key={p.id + p.preco}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        onBlur={(e) => alterarPreco(p, e.target.value)} title="Enter ou sair do campo salva na hora" />
                    </label>
                    <Pilula on={p.visivel_tablet !== false} onChange={(v) => patch(p, { visivel_tablet: v })} sim="Visível" nao="Invisível" titulo="Aparece no tablet / QR Code" />
                    <Pilula on={p.disponivel} onChange={(v) => patch(p, { disponivel: v })} sim="Disponível" nao="Esgotado" titulo="Esgotado some do PDV e do tablet" />
                    <RelogioHorario horarios={p.horarios} onClick={() => setEd(p)} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {edCat && (
        <Modal titulo={`Categoria · ${edCat.nome}`} fechar={() => setEdCat(null)}>
          <Campo r="Nome"><input className={inputCls} value={edCat.nome} onChange={(e) => setEdCat({ ...edCat, nome: e.target.value })} /></Campo>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edCat.visivel_tablet !== false} onChange={(e) => setEdCat({ ...edCat, visivel_tablet: e.target.checked })} />Visível no tablet / QR Code</label>
          <HorarioCampos v={edCat.horarios} onChange={(h) => setEdCat({ ...edCat, horarios: h })} />
          <button className={btnCls} onClick={salvarCat}>Salvar</button>
        </Modal>
      )}
      {ed && (
        <Modal titulo={ed.id ? 'Editar produto' : 'Novo produto'} fechar={() => setEd(null)}>
          <Campo r="Nome"><input className={inputCls} value={ed.nome ?? ''} onChange={(e) => set({ nome: e.target.value })} /></Campo>
          <Campo r="Descrição do prato (aparece no tablet e no cardápio)">
            <textarea className={inputCls + ' !min-h-[96px] py-2'} maxLength={400} placeholder="Ex.: Filé mignon grelhado, molho de vinho tinto, batatas rústicas e legumes salteados." value={ed.descricao ?? ''} onChange={(e) => set({ descricao: e.target.value })} />
            <span className="mt-0.5 block text-right text-[11px] text-ink-soft">{(ed.descricao ?? '').length}/400</span>
          </Campo>
          <div className="flex items-center gap-3">
            {ed.foto_url ? <img src={ed.foto_url} alt="" className="h-16 w-24 rounded-lg object-cover" /> : <span className="grid h-16 w-24 place-items-center rounded-lg bg-brand-soft text-xs text-ink-soft">sem foto</span>}
            <label className="text-sm">Foto do prato<input type="file" accept="image/*" className="mt-1 block text-xs" onChange={async (e) => {
              const arq = e.target.files?.[0]; if (!arq) return
              try {
                const f = await reduzir(arq, 1200)
                const path = `produtos/${crypto.randomUUID()}.${f.name.split('.').pop()?.toLowerCase() || 'jpg'}`
                const up = await supabase.storage.from('tablet').upload(path, f, { contentType: f.type })
                if (up.error) throw up.error
                set({ foto_url: supabase.storage.from('tablet').getPublicUrl(path).data.publicUrl })
              } catch (x) { s.falha((x as Error).message) }
            }} /></label>
          </div>
          {ed.ficha_id ? <p className="text-xs text-ink-soft">Ficha técnica vinculada · <Link className="text-brand underline" to={`/fichas/${ed.ficha_id}`}>abrir ficha</Link> (ingredientes, custo e modo de preparo ficam lá).</p> : <p className="text-xs text-ink-soft">Sem ficha técnica vinculada: o estoque não baixa sozinho nas vendas deste produto.</p>}
          <div className="grid grid-cols-2 gap-2">
            <Campo r="Preço (R$)"><input className={inputCls} inputMode="decimal" defaultValue={ed.preco ?? ''} onChange={(e) => set({ preco: lerNumero(e.target.value) ?? 0 })} /></Campo>
            <Campo r="Categoria"><select className={inputCls} value={ed.categoria_id ?? ''} onChange={(e) => { const c = cats.find((k) => k.id === e.target.value); set({ categoria_id: e.target.value || null, ...(c ? { destino: c.destino_padrao } : {}) }) }}><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
            <Campo r="Imprime em"><select className={inputCls} value={ed.destino} onChange={(e) => set({ destino: e.target.value as Destino })}>{DESTINOS.map((d) => <option key={d}>{d}</option>)}</select></Campo>
            <Campo r="Código"><input className={inputCls} value={ed.codigo ?? ''} onChange={(e) => set({ codigo: e.target.value })} /></Campo>
          </div>
          <h4 className="pt-2 text-sm font-semibold">Dados fiscais</h4>
          <div className="grid grid-cols-2 gap-2">
            <Campo r="NCM"><input className={inputCls} value={ed.ncm ?? ''} onChange={(e) => set({ ncm: e.target.value })} /></Campo>
            <Campo r="CFOP"><input className={inputCls} value={ed.cfop ?? ''} onChange={(e) => set({ cfop: e.target.value })} /></Campo>
            <Campo r="CSOSN (Simples)"><input className={inputCls} placeholder="102" value={ed.csosn ?? ''} onChange={(e) => set({ csosn: e.target.value })} /></Campo>
            <Campo r="Origem (0-8)"><input className={inputCls} value={ed.origem ?? 0} onChange={(e) => set({ origem: Number(e.target.value) || 0 })} /></Campo>
            <Campo r="CEST"><input className={inputCls} value={ed.cest ?? ''} onChange={(e) => set({ cest: e.target.value })} /></Campo>
            <Campo r="Unidade"><input className={inputCls} value={ed.unidade ?? 'UN'} onChange={(e) => set({ unidade: e.target.value })} /></Campo>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.ativo ?? true} onChange={(e) => set({ ativo: e.target.checked })} />Ativo no cardápio do PDV</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.visivel_tablet !== false} onChange={(e) => set({ visivel_tablet: e.target.checked })} />Visível no tablet / QR Code</label>
          <HorarioCampos v={ed.horarios} onChange={(h) => set({ horarios: h })} />
          {ed.id ? <GruposDoProduto produtoId={ed.id} /> : <p className="text-xs text-ink-soft">Salve o produto para vincular opções (ponto, acompanhamentos, combos).</p>}
          <button className={btnCls} onClick={salvar}>Salvar</button>
        </Modal>
      )}
    </div>
  )
}

/* ---------------- Impressoras ---------------- */
function Impressoras() {
  const { pode } = usePermissoes()
  const [lista, setLista] = useState<Impressora[]>([])
  const [ed, setEd] = useState<Partial<Impressora> | null>(null)
  const [fila, setFila] = useState<{ status: string; n: number }[]>([])
  const s = useSalvarMsg()
  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([db.from('pdv_impressoras').select('*').order('funcao'), db.from('pdv_fila_impressao').select('status').in('status', ['pendente', 'erro'])])
    setLista((a.data ?? []) as Impressora[])
    const cont: Record<string, number> = {}
    ;(b.data ?? []).forEach((x: { status: string }) => (cont[x.status] = (cont[x.status] ?? 0) + 1))
    setFila(Object.entries(cont).map(([status, n]) => ({ status, n })))
  }, [])
  useEffect(() => { carregar() }, [carregar])
  async function salvar() {
    if (!ed?.nome || !ed.funcao || !ed.ip) return s.falha('Informe nome, função e IP.')
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ed.ip)) return s.falha('IP inválido (ex.: 192.168.0.50).')
    const { id, ultimo_ok, ...dados } = ed as Impressora
    void ultimo_ok
    const { error } = id ? await db.from('pdv_impressoras').update(dados).eq('id', id) : await db.from('pdv_impressoras').insert(dados)
    if (error) return s.falha(error.message)
    setEd(null); s.ok(); carregar()
  }
  async function teste(i: Impressora) {
    const { error } = await db.from('pdv_fila_impressao').insert({ impressora_id: i.id, tipo: 'teste', conteudo: { texto: `Teste ${i.nome}`, funcao: i.funcao } })
    if (error) s.falha(error.message); else { s.ok('Teste na fila. O agente de impressão imprime em poucos segundos.'); carregar() }
  }
  async function reenfileirar() {
    const { error } = await db.from('pdv_fila_impressao').update({ status: 'pendente', tentativas: 0, erro: null }).eq('status', 'erro')
    if (error) s.falha(error.message); else { s.ok('Impressões com erro voltaram para a fila.'); carregar() }
  }
  const set = (p: Partial<Impressora>) => setEd((x) => ({ ...x, ...p }))
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <p className="rounded-xl bg-brand-soft p-3 text-sm">
        O navegador não fala direto com impressora de rede. O <b>agente de impressão</b> (pasta <code>agente-impressao</code> do projeto) roda num PC/mini-PC
        ligado na mesma rede das impressoras, lê a fila e imprime em ESC/POS pela porta 9100. Tablet, celular do garçom e sistema só enfileiram.
        {fila.length > 0 && <b className="block pt-1">Na fila: {fila.map((f) => `${f.n} ${f.status}`).join(', ')}{fila.some((f) => f.status === 'erro') && <button className="ml-2 underline" onClick={reenfileirar}>reenfileirar erros</button>}</b>}
      </p>
      <button className={btnCls} onClick={() => setEd({ funcao: 'cozinha', porta: 9100, colunas: 48, codepage: 'CP860', corta_papel: true, ativo: true, via_extra: 0 })}>Nova impressora</button>
      {!lista.length ? <Vazio texto="Nenhuma impressora. Cadastre as 3: caixa, bar e cozinha." /> : (
        <ul className={`${cartaoCls} divide-y divide-line`}>
          {lista.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <button className="text-left" onClick={() => setEd(i)}><b>{i.nome}</b> · {i.funcao.toUpperCase()} · {i.ip}:{i.porta} {!i.ativo && '· inativa'}<span className="block text-xs text-ink-soft">{i.ultimo_ok ? `última impressão ${new Date(i.ultimo_ok).toLocaleString('pt-BR')}` : 'nunca imprimiu'}</span></button>
              <button className={btnSecCls} onClick={() => teste(i)}>Imprimir teste</button>
            </li>
          ))}
        </ul>
      )}
      {pode('pdv_caixa') && <ReimprimirCupons />}
      {ed && (
        <Modal titulo={ed.id ? 'Editar impressora' : 'Nova impressora'} fechar={() => setEd(null)}>
          <Campo r="Nome"><input className={inputCls} value={ed.nome ?? ''} onChange={(e) => set({ nome: e.target.value })} /></Campo>
          <Campo r="Função (de onde ela recebe os pedidos)"><select className={inputCls} value={ed.funcao} onChange={(e) => set({ funcao: e.target.value as Destino })}>{DESTINOS.map((d) => <option key={d}>{d}</option>)}</select></Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo r="IP"><input className={inputCls} placeholder="192.168.0.50" value={ed.ip ?? ''} onChange={(e) => set({ ip: e.target.value })} /></Campo>
            <Campo r="Porta"><input className={inputCls} value={ed.porta ?? 9100} onChange={(e) => set({ porta: Number(e.target.value) || 9100 })} /></Campo>
            <Campo r="Colunas (80mm=48, 58mm=32)"><input className={inputCls} value={ed.colunas ?? 48} onChange={(e) => set({ colunas: Number(e.target.value) || 48 })} /></Campo>
            <Campo r="Code page"><select className={inputCls} value={ed.codepage} onChange={(e) => set({ codepage: e.target.value })}><option>CP860</option><option>CP850</option><option>WPC1252</option></select></Campo>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.corta_papel ?? true} onChange={(e) => set({ corta_papel: e.target.checked })} />Cortar papel</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.ativo ?? true} onChange={(e) => set({ ativo: e.target.checked })} />Ativa</label>
          <button className={btnCls} onClick={salvar}>Salvar</button>
        </Modal>
      )}
    </div>
  )
}
