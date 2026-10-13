import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import { usePermissoes, SoComCusto } from '../context/PermissoesContext'
import { reais, pct, dataBR, diasDesde, lerNumero } from '../lib/formato'
import { Carregando, Vazio, Erro, inputCls, btnCls, btnSecCls } from '../components/Estado'

interface Insumo {
  id: string
  nome: string
  categoria: string | null
  unidade: string
  preco: number | null
  fator_correcao: number | null
  fornecedor_id: string | null
  preco_atualizado_em: string | null
}
interface Simulacao {
  ficha_id: string
  ficha: string
  custo_atual: number | null
  custo_novo: number | null
  cmv_atual: number | null
  cmv_novo: number | null
}

const UNIDADES = ['kg', 'g', 'l', 'ml', 'un']

export function Insumos() {
  const { pode } = usePermissoes()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([])
  const [usos, setUsos] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [editando, setEditando] = useState<Insumo | null>(null)
  const [novo, setNovo] = useState({ nome: '', categoria: '', unidade: 'kg' })

  async function load() {
    setCarregando(true)
    const [ins, forn, itens] = await Promise.all([
      db.from('insumos').select('*').eq('ativo', true).order('nome'),
      db.from('fornecedores').select('id,nome').order('nome'),
      db.from('ficha_itens').select('insumo_id,ficha_id').not('insumo_id', 'is', null),
    ])
    setCarregando(false)
    if (ins.error) return setErro(ins.error.message)
    setInsumos(ins.data ?? [])
    setFornecedores(forn.data ?? [])
    const mapa: Record<string, Set<string>> = {}
    for (const i of itens.data ?? []) (mapa[i.insumo_id] ??= new Set()).add(i.ficha_id)
    setUsos(Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, v.size])))
  }
  useEffect(() => {
    load()
  }, [])

  const categorias = useMemo(
    () => [...new Set(insumos.map((i) => i.categoria).filter(Boolean))].sort() as string[],
    [insumos]
  )
  // filtro vindo dos cards do painel (?filtro=sem_preco | desatualizado)
  const filtroPainel = params.get('filtro')
  const filtrados = insumos.filter(
    (i) =>
      (!categoria || i.categoria === categoria) &&
      i.nome.toLowerCase().includes(busca.toLowerCase()) &&
      (filtroPainel !== 'sem_preco' || i.preco == null) &&
      (filtroPainel !== 'desatualizado' || (i.preco != null && diasDesde(i.preco_atualizado_em) > 60))
  )
  const semPreco = insumos.filter((i) => i.preco == null).length
  const desatualizados = insumos.filter(
    (i) => i.preco != null && diasDesde(i.preco_atualizado_em) > 60
  ).length
  const nomeForn = (id: string | null) => fornecedores.find((f) => f.id === id)?.nome ?? '—'

  async function criar() {
    if (!novo.nome.trim()) return
    const { error } = await db.from('insumos').insert({
      nome: novo.nome.trim(),
      categoria: novo.categoria.trim() || null,
      unidade: novo.unidade,
    })
    if (error) return alert('Não foi possível criar: ' + error.message)
    setNovo({ nome: '', categoria: '', unidade: 'kg' })
    load()
  }

  return (
    <div>
      <h1 className="display mb-4 text-xl font-medium">insumos</h1>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Card titulo="insumos" valor={insumos.length} />
        <Card titulo="sem preço" valor={semPreco} alerta={semPreco > 0} />
        <Card titulo="preço +60 dias" valor={desatualizados} alerta={desatualizados > 0} />
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input placeholder="buscar insumo" value={busca} onChange={(e) => setBusca(e.target.value)} className={inputCls} />
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${inputCls} sm:w-56`}>
          <option value="">todas as categorias</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {filtroPainel && (
        <button
          onClick={() => setParams({}, { replace: true })}
          className="mb-3 min-h-[44px] rounded border border-warn bg-warn-soft px-3 text-xs text-warn"
        >
          {filtroPainel === 'sem_preco' ? 'só sem preço' : 'só preço com +60 dias'} · limpar filtro ×
        </button>
      )}

      {erro && <Erro texto={erro} />}
      {carregando ? (
        <Carregando />
      ) : filtrados.length === 0 ? (
        <Vazio texto="Nenhum insumo encontrado." />
      ) : (
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full text-sm">
            <thead className="bg-paper-dim text-left text-xs text-ink-soft">
              <tr>
                <th className="px-3 py-2">nome</th>
                <th className="px-3 py-2">categoria</th>
                <th className="px-3 py-2">un.</th>
                <SoComCusto><th className="px-3 py-2">preço</th></SoComCusto>
                <th className="px-3 py-2">fornecedor</th>
                <th className="px-3 py-2">fator</th>
                <th className="px-3 py-2">último preço</th>
                <th className="px-3 py-2">fichas</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtrados.map((i) => {
                const velho = diasDesde(i.preco_atualizado_em) > 60
                return (
                  <tr key={i.id}>
                    <td className="px-3 py-2 font-medium">{i.nome}</td>
                    <td className="px-3 py-2 text-ink-soft">{i.categoria ?? '—'}</td>
                    <td className="px-3 py-2">{i.unidade}</td>
                    <SoComCusto>
                      <td className="px-3 py-2">
                        {i.preco == null ? <span className="text-alert">sem preço</span> : reais(i.preco)}
                      </td>
                    </SoComCusto>
                    <td className="px-3 py-2 text-ink-soft">{nomeForn(i.fornecedor_id)}</td>
                    <td className="px-3 py-2">{i.fator_correcao ?? 1}</td>
                    <td className={`px-3 py-2 ${velho && i.preco != null ? 'font-medium text-warn' : 'text-ink-soft'}`}>
                      {dataBR(i.preco_atualizado_em)}
                    </td>
                    <td className="px-3 py-2">{usos[i.id] ?? 0}</td>
                    <td className="px-3 py-2">
                      {(pode('editar_precos') || pode('editar_fichas')) && (
                        <button onClick={() => setEditando(i)} className="text-xs underline">
                          editar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pode('editar_fichas') && (
        <div className="mt-6 rounded border border-line bg-paper-dim/40 p-3">
          <h2 className="mb-2 text-sm font-medium">novo insumo</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input placeholder="nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} className={inputCls} />
            <input placeholder="categoria" value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value })} className={inputCls} />
            <select value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value })} className={`${inputCls} sm:w-24`}>
              {UNIDADES.map((u) => <option key={u}>{u}</option>)}
            </select>
            <button onClick={criar} className={btnCls}>adicionar</button>
          </div>
        </div>
      )}

      {editando && (
        <EditarInsumo
          insumo={editando}
          fornecedores={fornecedores}
          podePreco={pode('editar_precos')}
          verCusto={pode('ver_custos')}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function Card({ titulo, valor, alerta }: { titulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="rounded border border-line p-3">
      <div className="text-xs text-ink-soft">{titulo}</div>
      <div className={`display text-2xl ${alerta ? 'text-warn' : ''}`}>{valor}</div>
    </div>
  )
}

function EditarInsumo({
  insumo,
  fornecedores,
  podePreco,
  verCusto,
  onFechar,
  onSalvo,
}: {
  insumo: Insumo
  fornecedores: { id: string; nome: string }[]
  podePreco: boolean
  verCusto: boolean
  onFechar: () => void
  onSalvo: () => void
}) {
  const [f, setF] = useState({
    nome: insumo.nome,
    categoria: insumo.categoria ?? '',
    unidade: insumo.unidade,
    fator: String(insumo.fator_correcao ?? 1).replace('.', ','),
    fornecedor_id: insumo.fornecedor_id ?? '',
    preco: insumo.preco == null ? '' : String(insumo.preco).replace('.', ','),
  })
  const [sim, setSim] = useState<Simulacao[] | null>(null)
  const [simErro, setSimErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const precoNovo = lerNumero(f.preco)
  const mudouPreco = precoNovo != null && precoNovo !== insumo.preco

  useEffect(() => {
    if (!mudouPreco || !podePreco) return setSim(null)
    const t = setTimeout(async () => {
      const { data, error } = await db.rpc('simular_preco', { p_insumo: insumo.id, p_preco_novo: precoNovo })
      if (error) return setSimErro(error.message)
      setSimErro(null)
      setSim(
        ((data ?? []) as Simulacao[]).sort(
          (a, b) =>
            Math.abs((b.custo_novo ?? 0) - (b.custo_atual ?? 0)) -
            Math.abs((a.custo_novo ?? 0) - (a.custo_atual ?? 0))
        )
      )
    }, 400)
    return () => clearTimeout(t)
  }, [f.preco])

  async function salvar() {
    setSalvando(true)
    const upd: Record<string, unknown> = {
      nome: f.nome.trim(),
      categoria: f.categoria.trim() || null,
      unidade: f.unidade,
      fator_correcao: lerNumero(f.fator) ?? 1,
      fornecedor_id: f.fornecedor_id || null,
    }
    if (podePreco && mudouPreco) upd.preco = precoNovo
    const { error } = await db.from('insumos').update(upd).eq('id', insumo.id)
    setSalvando(false)
    if (error) return alert('Não foi possível salvar: ' + error.message)
    onSalvo()
  }

  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-ink/40" onClick={onFechar}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-paper p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="display text-lg">{insumo.nome}</h2>
          <button onClick={onFechar} className={btnSecCls}>fechar</button>
        </div>
        <div className="space-y-2">
          <label className="block text-xs text-ink-soft">nome<input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} className={inputCls} /></label>
          <label className="block text-xs text-ink-soft">categoria<input value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} className={inputCls} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-ink-soft">unidade de compra
              <select value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })} className={inputCls}>
                {UNIDADES.map((u) => <option key={u}>{u}</option>)}
              </select>
            </label>
            <label className="block text-xs text-ink-soft">fator de correção<input inputMode="decimal" value={f.fator} onChange={(e) => setF({ ...f, fator: e.target.value })} className={inputCls} /></label>
          </div>
          <label className="block text-xs text-ink-soft">fornecedor
            <select value={f.fornecedor_id} onChange={(e) => setF({ ...f, fornecedor_id: e.target.value })} className={inputCls}>
              <option value="">—</option>
              {fornecedores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </label>
          {podePreco && (
            <label className="block text-xs text-ink-soft">preço por {f.unidade} (R$)
              <input inputMode="decimal" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} className={inputCls} />
            </label>
          )}
        </div>

        {podePreco && mudouPreco && verCusto && (
          <div className="mt-4 rounded border border-warn p-3">
            <h3 className="mb-2 text-sm font-medium">Antes de salvar</h3>
            {simErro && <Erro texto={simErro} />}
            {!sim ? (
              <Carregando />
            ) : sim.length === 0 ? (
              <p className="text-xs text-ink-soft">Nenhuma ficha usa este insumo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-ink-soft">
                    <tr><th className="py-1">ficha</th><th>custo atual → novo</th><th>CMV atual → novo</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sim.map((s) => (
                      <tr key={s.ficha_id}>
                        <td className="py-1.5">{s.ficha}</td>
                        <td>{reais(s.custo_atual)} → <b>{reais(s.custo_novo)}</b></td>
                        <td>{pct(s.cmv_atual)} → <b>{pct(s.cmv_novo)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <button onClick={salvar} disabled={salvando} className={`${btnCls} mt-4 w-full`}>
          {salvando ? 'salvando…' : 'salvar'}
        </button>
      </div>
    </div>
  )
}
