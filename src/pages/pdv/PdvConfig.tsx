import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais, lerNumero } from '../../lib/formato'
import { Categoria, DESTINOS, Destino, Impressora, Mesa, Produto, Sala } from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'
import { Modal } from './PdvCaixa'
import { Tablet } from './ConfigTablet'
import { Checkin } from './ConfigCheckin'
import { Fiscal, Tef } from './ConfigFiscal'

type Aba = 'salao' | 'checkin' | 'produtos' | 'impressoras' | 'tablet' | 'fiscal' | 'pagamentos'
const ABAS: { v: Aba; r: string; perm: 'pdv_gerir' | 'pdv_fiscal' }[] = [
  { v: 'salao', r: 'Salão e mesas', perm: 'pdv_gerir' },
  { v: 'checkin', r: 'Check-in: couvert e rodízio', perm: 'pdv_gerir' },
  { v: 'produtos', r: 'Produtos', perm: 'pdv_gerir' },
  { v: 'impressoras', r: 'Impressoras', perm: 'pdv_gerir' },
  { v: 'tablet', r: 'Tablet e QR Code', perm: 'pdv_gerir' },
  { v: 'fiscal', r: 'Fiscal (NFC-e)', perm: 'pdv_fiscal' },
  { v: 'pagamentos', r: 'Pagamentos / TEF', perm: 'pdv_gerir' },
]

export function PdvConfig() {
  const { pode } = usePermissoes()
  const abas = ABAS.filter((a) => pode(a.perm))
  const [aba, setAba] = useState<Aba>(abas[0]?.v ?? 'salao')
  return (
    <div>
      <Cabecalho titulo="Configurações do PDV" subtitulo="Salão, produtos, impressoras, tablet, fiscal e pagamentos" />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {abas.map((a) => <button key={a.v} className={aba === a.v ? btnCls : btnSecCls} onClick={() => setAba(a.v)}>{a.r}</button>)}
      </div>
      {aba === 'salao' && <Salao />}
      {aba === 'checkin' && <Checkin />}
      {aba === 'produtos' && <Produtos />}
      {aba === 'impressoras' && <Impressoras />}
      {aba === 'tablet' && <Tablet />}
      {aba === 'fiscal' && <Fiscal />}
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
      return { sala_id: sala, numero: String(i0 + k), capacidade: Number(lote.cap) || 4, pos_x: 20 + col * 100, pos_y: 20 + lin * 100 }
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
  async function remover(m: Mesa) {
    if (!window.confirm(`Remover mesa ${m.numero}?`)) return
    const { error } = await db.from('pdv_mesas').delete().eq('id', m.id)
    if (error) s.falha('Não dá para remover mesa com histórico. Desative-a.'); else carregar()
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
          </section>
          <p className="text-sm text-ink-soft">Arraste as mesas para montar o mapa do salão.</p>
          <div ref={area} className={`${cartaoCls} relative overflow-auto`} style={{ height: 480, touchAction: 'none' }} onPointerMove={mover} onPointerUp={soltar} onPointerLeave={soltar}>
            {doSala.map((m) => (
              <div key={m.id}
                onPointerDown={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); drag.current = { id: m.id, dx: e.clientX - r.left, dy: e.clientY - r.top } }}
                style={{ left: m.pos_x, top: m.pos_y, width: m.largura, height: m.altura, opacity: m.ativo ? 1 : 0.4 }}
                className={`absolute flex cursor-grab select-none items-center justify-center border-2 border-brand bg-brand-soft font-semibold ${m.forma === 'redonda' ? 'rounded-full' : 'rounded-xl'}`}>
                {m.numero}
              </div>
            ))}
          </div>
          <section className={`${cartaoCls} p-4`}>
            <h3 className="mb-2 font-semibold">Mesas da sala</h3>
            {!doSala.length ? <Vazio texto="Nenhuma mesa." /> : (
              <ul className="divide-y divide-line text-sm">
                {doSala.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                    <b className="w-10">{m.numero}</b>
                    <input className={inputCls + ' !w-20'} defaultValue={m.capacidade} onBlur={(e) => upd(m, { capacidade: Number(e.target.value) || 1 })} title="lugares" />
                    <select className={inputCls + ' !w-32'} value={m.forma} onChange={(e) => upd(m, { forma: e.target.value as Mesa['forma'], largura: e.target.value === 'retangular' ? 140 : 80 })}>
                      <option value="quadrada">quadrada</option><option value="redonda">redonda</option><option value="retangular">retangular</option>
                    </select>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={m.ativo} onChange={(e) => upd(m, { ativo: e.target.checked })} />ativa</label>
                    <button className={btnPerigoCls + ' !min-h-[36px]'} onClick={() => remover(m)}>remover</button>
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
    const dados = { ...resto, nome: ed.nome.trim(), preco: Number(ed.preco ?? 0) }
    const { error } = id ? await db.from('pdv_produtos').update(dados).eq('id', id) : await db.from('pdv_produtos').insert(dados)
    if (error) return s.falha(error.message)
    setEd(null); s.ok(); carregar()
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
      {!prods.length ? <Vazio texto="Nenhum produto no PDV." /> : (
        <ul className={`${cartaoCls} divide-y divide-line`}>
          {prods.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <button className="text-left" onClick={() => setEd(p)}>
                <b>{p.nome}</b> <span className="text-ink-soft">· {cats.find((c) => c.id === p.categoria_id)?.nome ?? 'sem categoria'} · {p.destino}{!p.ncm && ' · sem NCM'}</span>
              </button>
              <span className="flex items-center gap-3">
                {reais(p.preco)}
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={p.disponivel} onChange={async (e) => { await db.from('pdv_produtos').update({ disponivel: e.target.checked }).eq('id', p.id); carregar() }} />disp.</label>
              </span>
            </li>
          ))}
        </ul>
      )}
      {ed && (
        <Modal titulo={ed.id ? 'Editar produto' : 'Novo produto'} fechar={() => setEd(null)}>
          <Campo r="Nome"><input className={inputCls} value={ed.nome ?? ''} onChange={(e) => set({ nome: e.target.value })} /></Campo>
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
          <button className={btnCls} onClick={salvar}>Salvar</button>
        </Modal>
      )}
    </div>
  )
}

/* ---------------- Impressoras ---------------- */
function Impressoras() {
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
  const set = (p: Partial<Impressora>) => setEd((x) => ({ ...x, ...p }))
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <p className="rounded-xl bg-brand-soft p-3 text-sm">
        O navegador não fala direto com impressora de rede. O <b>agente de impressão</b> (pasta <code>agente-impressao</code> do projeto) roda num PC/mini-PC
        ligado na mesma rede das impressoras, lê a fila e imprime em ESC/POS pela porta 9100. Tablet, celular do garçom e sistema só enfileiram.
        {fila.length > 0 && <b className="block pt-1">Na fila: {fila.map((f) => `${f.n} ${f.status}`).join(', ')}</b>}
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
