import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, btnCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { noHorarios, type Faixa } from '../../lib/pdv'
import { Avisos, Campo, useSalvarMsg } from './PdvConfig'
import { DIAS, Grupo, Opcao } from './ConfigCardapio'
import { CardapioCliente } from '../../components/CardapioCliente'

interface Tema { primaria: string; fundo: string; texto: string; destaque: string; titulo: string; subtitulo: string; colunas: 1 | 2; mostrar_fotos: boolean }
const PADRAO: Tema = { primaria: '#7a1f2b', fundo: '#faf7f2', texto: '#222222', destaque: '#c9a24b', titulo: 'Paggio', subtitulo: '', colunas: 2, mostrar_fotos: true }
const PRESETS: { nome: string; t: Partial<Tema> }[] = [
  { nome: 'Paggio (bordô e creme)', t: { primaria: '#7a1f2b', fundo: '#faf7f2', texto: '#222222', destaque: '#c9a24b' } },
  { nome: 'Noite (escuro)', t: { primaria: '#c9a24b', fundo: '#1b1416', texto: '#f3ece4', destaque: '#c9a24b' } },
  { nome: 'Verde oliva', t: { primaria: '#3f5b3a', fundo: '#f6f3ea', texto: '#222222', destaque: '#b08d3c' } },
]
const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
interface Cat { id: string; nome: string; visivel_tablet: boolean; horarios: Faixa[] | null }
interface Prod { id: string; nome: string; descricao: string | null; preco: number; categoria_id: string | null; foto_url: string | null; visivel_tablet: boolean; disponivel: boolean; horarios: Faixa[] | null }

/** Aba "Layout do tablet": prévia fiel do que o cliente vê + ajustes de cor/título. */
export function TabletLayout() {
  const [tema, setTema] = useState<Tema>(PADRAO)
  const [cats, setCats] = useState<Cat[]>([])
  const [prods, setProds] = useState<Prod[]>([])
  const [grupos, setGrupos] = useState<(Grupo & { opcoes: Opcao[]; produtos: string[] })[]>([])
  const [boasVindas, setBoas] = useState('')
  const [pronto, setPronto] = useState(false)
  const [dia, setDia] = useState<number>(new Date().getDay())
  const [hora, setHora] = useState(() => new Date().toTimeString().slice(0, 5))
  const [agora, setAgora] = useState(true)
  const [aberto, setAberto] = useState<Prod | null>(null)
  const [larg, setLarg] = useState<'tablet' | 'celular'>('tablet')
  const s = useSalvarMsg()

  const carregar = useCallback(async () => {
    const [cfg, c, p, g, o, pg] = await Promise.all([
      db.from('pdv_config').select('tablet_tema,tablet_mensagem_boas_vindas').single(),
      db.from('pdv_categorias').select('id,nome,visivel_tablet,horarios').eq('ativo', true).order('ordem'),
      db.from('pdv_produtos').select('id,nome,descricao,preco,categoria_id,foto_url,visivel_tablet,disponivel,horarios').eq('ativo', true).order('ordem').order('nome'),
      db.from('pdv_grupos_opcoes').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_opcoes').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_produto_grupos').select('produto_id,grupo_id'),
    ])
    setTema({ ...PADRAO, ...((cfg.data?.tablet_tema as Partial<Tema>) ?? {}) }); setBoas(cfg.data?.tablet_mensagem_boas_vindas ?? '')
    setCats((c.data ?? []) as Cat[]); setProds((p.data ?? []) as Prod[])
    setGrupos(((g.data ?? []) as Grupo[]).map((x) => ({ ...x, opcoes: ((o.data ?? []) as Opcao[]).filter((y) => y.grupo_id === x.id), produtos: ((pg.data ?? []) as { produto_id: string; grupo_id: string }[]).filter((y) => y.grupo_id === x.id).map((y) => y.produto_id) })))
    setPronto(true)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  // "agora" = relógio real; senão simula o dia/hora escolhidos
  const quando = useMemo(() => {
    if (agora) return new Date()
    const d = new Date(); d.setDate(d.getDate() + ((dia - d.getDay() + 7) % 7)); const [h, m] = hora.split(':').map(Number); d.setHours(h || 0, m || 0, 0, 0); return d
  }, [agora, dia, hora])
  const catOk = useMemo(() => new Map(cats.filter((c) => c.visivel_tablet && noHorarios(c.horarios, quando)).map((c) => [c.id, c])), [cats, quando])
  const visiveis = useMemo(() => prods.filter((p) => p.visivel_tablet && p.disponivel && (!p.categoria_id || catOk.has(p.categoria_id)) && noHorarios(p.horarios, quando)), [prods, catOk, quando])
  const catsVis = [...catOk.values()].filter((c) => visiveis.some((p) => p.categoria_id === c.id))
  const gruposDe = (p: Prod) => grupos.filter((g) => g.produtos.includes(p.id) && g.opcoes.length)

  async function salvar() {
    const { error } = await db.from('pdv_config').update({ tablet_tema: tema, tablet_mensagem_boas_vindas: boasVindas || null }).eq('id', 1)
    if (error) s.falha(error.message); else s.ok('Layout salvo. Os tablets/QR Codes já usam as novas cores.')
  }
  const set = (p: Partial<Tema>) => setTema((t) => ({ ...t, ...p }))
  if (!pronto) return <Carregando />

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <div className="space-y-3">
        <Avisos s={s} />
        <section className={`${cartaoCls} space-y-3 p-4`}>
          <h3 className="font-semibold">Aparência</h3>
          <div className="flex flex-wrap gap-2">{PRESETS.map((p) => <button key={p.nome} className={btnSecCls + ' !min-h-[36px] text-xs'} onClick={() => set(p.t)}>{p.nome}</button>)}</div>
          <Campo r="Título (nome da casa)"><input className={inputCls} value={tema.titulo} onChange={(e) => set({ titulo: e.target.value })} /></Campo>
          <Campo r="Mensagem de boas-vindas"><input className={inputCls} value={boasVindas} onChange={(e) => setBoas(e.target.value)} placeholder="Bem-vindo! Faça seu pedido pelo tablet." /></Campo>
          <div className="grid grid-cols-2 gap-2">
            {([['primaria', 'Cor principal'], ['fundo', 'Fundo'], ['texto', 'Texto'], ['destaque', 'Destaque']] as const).map(([k, r]) => (
              <label key={k} className="block text-sm">{r}<input type="color" className="mt-1 h-11 w-full rounded-[10px] border border-line" value={tema[k]} onChange={(e) => set({ [k]: e.target.value })} /></label>
            ))}
          </div>
          <div className="flex gap-2">
            <button className={tema.colunas === 1 ? btnCls : btnSecCls} onClick={() => set({ colunas: 1 })}>1 coluna</button>
            <button className={tema.colunas === 2 ? btnCls : btnSecCls} onClick={() => set({ colunas: 2 })}>2 colunas</button>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tema.mostrar_fotos} onChange={(e) => set({ mostrar_fotos: e.target.checked })} />Mostrar fotos dos produtos</label>
          <div className="flex gap-2"><button className={btnCls} onClick={salvar}>Salvar layout</button><button className={btnSecCls} onClick={() => { setTema(PADRAO); setBoas('') }}>Restaurar</button></div>
        </section>
        <section className={`${cartaoCls} space-y-2 p-4`}>
          <h3 className="font-semibold">Simular horário</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={agora} onChange={(e) => setAgora(e.target.checked)} />Agora (horário real)</label>
          {!agora && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">{DIAS.map((d, i) => <button key={d} className={dia === i ? btnCls + ' !min-h-[34px] !px-3' : btnSecCls + ' !min-h-[34px] !px-3'} onClick={() => setDia(i)}>{d}</button>)}</div>
              <input type="time" className={inputCls} value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          )}
          <p className="text-xs text-ink-soft">Veja como o cardápio muda por horário (almoço, happy hour, rodízio…). Mostrando {visiveis.length} produto(s) em {catsVis.length} categoria(s).</p>
        </section>
        <div className="flex gap-2"><button className={larg === 'tablet' ? btnCls : btnSecCls} onClick={() => setLarg('tablet')}>Tablet</button><button className={larg === 'celular' ? btnCls : btnSecCls} onClick={() => setLarg('celular')}>Celular (QR)</button></div>
      </div>

      <div className="flex justify-center overflow-auto rounded-[14px] bg-paper-dim p-4">
        <div className="rounded-[34px] bg-[#111] p-3 shadow-2xl" style={{ width: larg === 'tablet' ? 760 : 380, maxWidth: '100%' }}>
          <div className="relative overflow-hidden rounded-[24px]" style={{ height: larg === 'tablet' ? 640 : 700 }}>
            <CardapioCliente
              tema={tema} mesa="12" boasVindas={boasVindas || 'Faça seu pedido pelo tablet. Nós levamos até a sua mesa.'}
              categorias={catsVis.map((c) => ({ id: c.id, nome: c.nome }))}
              produtos={visiveis.map((p) => ({ id: p.id, nome: p.nome, descricao: p.descricao, preco: Number(p.preco), categoria_id: p.categoria_id, foto_url: p.foto_url, personalizavel: gruposDe(p).length > 0 }))}
              lateral={larg === 'tablet'} qtdDe={(id) => (id === aberto?.id ? 0 : 0)} onAdd={(c) => setAberto(prods.find((x) => x.id === c.id) ?? null)} onMenos={() => {}}
              acoes={<><span className="rounded-full border border-white/60 px-3 py-1.5 text-xs">Chamar garçom</span><span className="rounded-full border border-white/60 px-3 py-1.5 text-xs">Pedir a conta</span></>}
              sobrepor={aberto && (
                <div className="absolute inset-0 z-20 flex items-end bg-black/50" onClick={() => setAberto(null)}>
                  <div className="max-h-[85%] w-full space-y-3 overflow-y-auto rounded-t-3xl bg-white p-4 text-[#222]" onClick={(e) => e.stopPropagation()}>
                    <h2 className="text-lg font-semibold">{aberto.nome}</h2>
                    {aberto.descricao && <p className="text-sm opacity-70">{aberto.descricao}</p>}
                    {gruposDe(aberto).map((g) => (
                      <fieldset key={g.id} className="space-y-1">
                        <legend className="font-medium">{g.nome} <span className="text-xs opacity-60">{g.min_escolhas > 0 ? 'obrigatório' : 'opcional'}{g.max_escolhas > 1 ? ` · até ${g.max_escolhas}` : ''}</span></legend>
                        {g.opcoes.map((o) => <div key={o.id} className="flex justify-between rounded-xl border p-3 text-sm"><span>○ {o.nome}</span>{Number(o.preco_adicional) > 0 && <span className="opacity-70">+ {brl(Number(o.preco_adicional))}</span>}</div>)}
                      </fieldset>
                    ))}
                    <div className="rounded-xl py-3 text-center font-semibold text-white" style={{ background: tema.primaria }}>Adicionar · {brl(Number(aberto.preco))}</div>
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
