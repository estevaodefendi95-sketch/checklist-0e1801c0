import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { db } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePermissoes, SoComCusto } from '../context/PermissoesContext'
import { reais, pct, dataBR, diasDesde, lerNumero } from '../lib/formato'
import {
  Carregando,
  Vazio,
  Erro,
  inputCls,
  btnCls,
  btnSecCls,
  btnPerigoCls,
  cartaoCls,
  chipCls,
} from '../components/Estado'
import { Cabecalho } from '../components/Cabecalho'
import { BarraSalvar, useAlteracoesPendentes } from '../components/Alteracoes'

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

// o banco aceita só estas (CHECK em insumos.unidade)
const UNIDADES = ['kg', 'l', 'un']
// valor do seletor de fornecedor para listar os insumos sem vínculo
const SEM_FORNECEDOR = '__sem'

/** traduz erros comuns do banco para o usuário */
function mensagemErro(error: { code?: string; message: string }) {
  if (error.code === '23505') return 'Já existe um insumo com esse nome.'
  if (error.code === '23503') return 'O insumo está em uso e não pode ser excluído. Arquive em vez disso.'
  if (error.code === '23514') return 'Valor fora do permitido (unidade ou fator de correção).'
  return error.message
}

function csvCampo(v: string) {
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

function exportarCotacao(fornecedor: string, itens: Insumo[], incluirPreco: boolean) {
  const cab = ['Produto', 'Unidade de compra']
  if (incluirPreco) cab.push('Preço atual (R$)')
  cab.push('Quantidade desejada', 'Preço cotado', 'Observação')
  const linhas = [
    ['Fornecedor', fornecedor],
    ['Data', new Date().toLocaleDateString('pt-BR')],
    [],
    cab,
    ...itens.map((i) => {
      const l = [i.nome, i.unidade]
      if (incluirPreco)
        l.push(i.preco == null ? '' : Number(i.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }))
      l.push('', '', '')
      return l
    }),
  ]
  const csv = '﻿' + linhas.map((l) => l.map(csvCampo).join(';')).join('\r\n')
  const slug = fornecedor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `cotacao-${slug || 'fornecedor'}-${format(new Date(), 'yyyy-MM-dd')}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function Insumos() {
  const { pode } = usePermissoes()
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin'
  const podeEditar = pode('editar_precos') || pode('editar_fichas')
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([])
  const [usos, setUsos] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [fornecedor, setFornecedor] = useState('')
  const [arquivados, setArquivados] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [incluirPreco, setIncluirPreco] = useState(false)
  const [reativando, setReativando] = useState<string | null>(null)
  const [editando, setEditando] = useState<Insumo | null>(null)
  const [novo, setNovo] = useState({ nome: '', categoria: '', unidade: 'kg' })
  const [novoErro, setNovoErro] = useState<string | null>(null)

  async function load() {
    setCarregando(true)
    setErro(null)
    const [ins, forn, itens] = await Promise.all([
      db.from('insumos').select('*').eq('ativo', !arquivados).order('nome'),
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
  }, [arquivados])

  // a seleção vale para um fornecedor só
  function escolherFornecedor(id: string) {
    setFornecedor(id)
    setMarcados(new Set())
  }
  function verArquivados(sim: boolean) {
    setArquivados(sim)
    setMarcados(new Set())
  }

  const categorias = useMemo(
    () => [...new Set(insumos.map((i) => i.categoria).filter(Boolean))].sort() as string[],
    [insumos]
  )
  // filtro vindo dos cards do painel (?filtro=sem_preco | desatualizado)
  const filtroPainel = params.get('filtro')
  const filtrados = insumos.filter(
    (i) =>
      (!categoria || i.categoria === categoria) &&
      (!fornecedor ||
        (fornecedor === SEM_FORNECEDOR ? i.fornecedor_id == null : i.fornecedor_id === fornecedor)) &&
      i.nome.toLowerCase().includes(busca.toLowerCase()) &&
      (filtroPainel !== 'sem_preco' || i.preco == null) &&
      (filtroPainel !== 'desatualizado' || (i.preco != null && diasDesde(i.preco_atualizado_em) > 60))
  )
  const semPreco = insumos.filter((i) => i.preco == null).length
  const desatualizados = insumos.filter(
    (i) => i.preco != null && diasDesde(i.preco_atualizado_em) > 60
  ).length
  const semFornecedor = insumos.filter((i) => i.fornecedor_id == null).length
  const nomeForn = (id: string | null) => fornecedores.find((f) => f.id === id)?.nome ?? '—'

  // cotação: só com um fornecedor escolhido e na lista de ativos
  const cotando = !arquivados && !!fornecedor && fornecedor !== SEM_FORNECEDOR
  const todosVisiveisMarcados = filtrados.length > 0 && filtrados.every((i) => marcados.has(i.id))
  function alternar(id: string) {
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  function alternarTodos() {
    setMarcados((m) => {
      const n = new Set(m)
      for (const i of filtrados) {
        if (todosVisiveisMarcados) n.delete(i.id)
        else n.add(i.id)
      }
      return n
    })
  }
  function exportar() {
    const itens = insumos.filter((i) => marcados.has(i.id) && i.fornecedor_id === fornecedor)
    if (itens.length) exportarCotacao(nomeForn(fornecedor), itens, incluirPreco && pode('ver_custos'))
  }

  async function reativar(i: Insumo) {
    setReativando(i.id)
    setErro(null)
    const { data, error } = await db.from('insumos').update({ ativo: true }).eq('id', i.id).select('id')
    setReativando(null)
    if (error) return setErro(`Não foi possível reativar ${i.nome}: ${mensagemErro(error)}`)
    if (!data?.length) return setErro(`Sem permissão para reativar ${i.nome}.`)
    load()
  }

  async function criar() {
    if (!novo.nome.trim()) return setNovoErro('Informe o nome do insumo.')
    setNovoErro(null)
    const { error } = await db.from('insumos').insert({
      nome: novo.nome.trim(),
      categoria: novo.categoria.trim() || null,
      unidade: novo.unidade,
    })
    if (error) return setNovoErro('Não foi possível criar: ' + mensagemErro(error))
    setNovo({ nome: '', categoria: '', unidade: 'kg' })
    load()
  }


  return (
    <div>
      <Cabecalho
        titulo="Insumos"
        subtitulo={
          carregando ? 'Carregando…' : `${insumos.length} insumos ${arquivados ? 'arquivados' : 'ativos'}`
        }
      />

      {!arquivados && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Card titulo="insumos" valor={insumos.length} />
          <Card titulo="sem preço" valor={semPreco} alerta={semPreco > 0} />
          <Card titulo="preço +60 dias" valor={desatualizados} alerta={desatualizados > 0} />
        </div>
      )}

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input placeholder="buscar insumo" value={busca} onChange={(e) => setBusca(e.target.value)} className={inputCls} />
        <select
          value={fornecedor}
          onChange={(e) => escolherFornecedor(e.target.value)}
          aria-label="fornecedor"
          className={`${inputCls} sm:w-56`}
        >
          <option value="">todos os fornecedores</option>
          {fornecedores.map((x) => (
            <option key={x.id} value={x.id}>{x.nome}</option>
          ))}
          <option value={SEM_FORNECEDOR}>sem fornecedor ({semFornecedor})</option>
        </select>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="categoria"
          className={`${inputCls} sm:w-56`}
        >
          <option value="">todas as categorias</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto">
        <button onClick={() => verArquivados(false)} className={chipCls(!arquivados)} aria-pressed={!arquivados}>
          ativos
        </button>
        <button onClick={() => verArquivados(true)} className={chipCls(arquivados)} aria-pressed={arquivados}>
          arquivados
        </button>
      </div>

      {filtroPainel && (
        <button
          onClick={() => setParams({}, { replace: true })}
          className="mb-3 min-h-[44px] rounded border border-warn bg-warn-soft px-3 text-xs text-warn"
        >
          {filtroPainel === 'sem_preco' ? 'só sem preço' : 'só preço com +60 dias'} · limpar filtro ×
        </button>
      )}

      {cotando && !carregando && semFornecedor > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-warn/40 bg-warn-soft px-4 py-2 text-sm text-warn" role="status">
          <span>
            {semFornecedor} {semFornecedor === 1 ? 'insumo' : 'insumos'} sem fornecedor. Vincule para aparecerem aqui.
          </span>
          <button onClick={() => escolherFornecedor(SEM_FORNECEDOR)} className="min-h-[44px] font-medium underline">
            ver sem fornecedor
          </button>
        </div>
      )}

      {cotando && !carregando && filtrados.length > 0 && (
        <div className={`${cartaoCls} mb-3 flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={alternarTodos} className={btnSecCls}>
              {todosVisiveisMarcados ? 'Desmarcar todos' : 'Selecionar todos'}
            </button>
            <span className="apoio">{marcados.size} marcados</span>
            <SoComCusto>
              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={incluirPreco}
                  onChange={(e) => setIncluirPreco(e.target.checked)}
                  className="h-5 w-5 accent-[var(--color-brand)]"
                />
                incluir preço atual
              </label>
            </SoComCusto>
          </div>
          <button onClick={exportar} disabled={marcados.size === 0} className={btnCls}>
            Exportar cotação
          </button>
        </div>
      )}

      {erro && <Erro texto={erro} />}
      {carregando ? (
        <Carregando />
      ) : filtrados.length === 0 ? (
        <Vazio
          texto={
            arquivados
              ? 'Nenhum insumo arquivado.'
              : cotando
                ? 'Nenhum insumo vinculado a este fornecedor.'
                : 'Nenhum insumo encontrado.'
          }
        />
      ) : (
        <div className={`${cartaoCls} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead className="bg-paper-dim text-left text-xs text-ink-soft">
              <tr>
                {cotando && (
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={todosVisiveisMarcados}
                      onChange={alternarTodos}
                      aria-label="selecionar todos os visíveis"
                      className="h-5 w-5 accent-[var(--color-brand)]"
                    />
                  </th>
                )}
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
                  <tr key={i.id} className={marcados.has(i.id) ? 'bg-brand-soft' : undefined}>
                    {cotando && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={marcados.has(i.id)}
                          onChange={() => alternar(i.id)}
                          aria-label={`marcar ${i.nome}`}
                          className="h-5 w-5 accent-[var(--color-brand)]"
                        />
                      </td>
                    )}
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
                      {podeEditar &&
                        (arquivados ? (
                          <button
                            onClick={() => reativar(i)}
                            disabled={reativando === i.id}
                            className="min-h-[44px] whitespace-nowrap px-2 text-sm font-medium text-brand underline disabled:opacity-50"
                          >
                            {reativando === i.id ? 'reativando…' : 'Reativar'}
                          </button>
                        ) : (
                          <button onClick={() => setEditando(i)} className="min-h-[44px] px-2 text-sm font-medium text-brand underline">
                            editar
                          </button>
                        ))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pode('editar_fichas') && !arquivados && (
        <div className={`${cartaoCls} mt-6 p-4`}>
          <h2 className="mb-2 text-sm font-medium">novo insumo</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input placeholder="nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} className={inputCls} />
            <input placeholder="categoria" value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value })} className={inputCls} />
            <select value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value })} className={`${inputCls} sm:w-24`}>
              {UNIDADES.map((u) => <option key={u}>{u}</option>)}
            </select>
            <button onClick={criar} className={btnCls}>adicionar</button>
          </div>
          {novoErro && <div className="mt-2"><Erro texto={novoErro} /></div>}
        </div>
      )}

      {editando && (
        <EditarInsumo
          insumo={editando}
          fornecedores={fornecedores}
          podePreco={pode('editar_precos')}
          verCusto={pode('ver_custos')}
          ehAdmin={ehAdmin}
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
    <div className={`${cartaoCls} p-3 md:p-4`}>
      <div className="text-xs text-ink-soft">{titulo}</div>
      <div className={`display text-2xl ${alerta ? 'text-warn' : ''}`}>{valor}</div>
    </div>
  )
}

interface Uso {
  fichas: number
  entradas: number
  contagens: number
  checklist: number
}

/** "usado em 3 fichas e 2 entradas" */
function fraseUso(u: Uso) {
  const partes = [
    [u.fichas, 'ficha', 'fichas'],
    [u.entradas, 'entrada de estoque', 'entradas de estoque'],
    [u.contagens, 'contagem', 'contagens'],
    [u.checklist, 'item de checklist', 'itens de checklist'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, um, varios]) => `${n} ${n === 1 ? um : varios}`)
  if (!partes.length) return 'Sem uso em fichas, estoque ou checklist.'
  const ultima = partes.pop()
  return `Usado em ${partes.length ? `${partes.join(', ')} e ${ultima}` : ultima}.`
}

function EditarInsumo({
  insumo,
  fornecedores,
  podePreco,
  verCusto,
  ehAdmin,
  onFechar,
  onSalvo,
}: {
  insumo: Insumo
  fornecedores: { id: string; nome: string }[]
  podePreco: boolean
  verCusto: boolean
  ehAdmin: boolean
  onFechar: () => void
  onSalvo: () => void
}) {
  const [inicial] = useState(() => ({
    nome: insumo.nome,
    categoria: insumo.categoria ?? '',
    unidade: insumo.unidade,
    fator: String(insumo.fator_correcao ?? 1).replace('.', ','),
    fornecedor_id: insumo.fornecedor_id ?? '',
    preco: insumo.preco == null ? '' : String(insumo.preco).replace('.', ','),
  }))
  const [f, setF] = useState(inicial)
  const sujo = JSON.stringify(f) !== JSON.stringify(inicial)
  const { liberar, confirmarDescarte } = useAlteracoesPendentes(sujo)
  function fechar() {
    if (confirmarDescarte()) onFechar()
  }
  const [sim, setSim] = useState<Simulacao[] | null>(null)
  const [simErro, setSimErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [uso, setUso] = useState<Uso | null>(null)
  const [usoErro, setUsoErro] = useState<string | null>(null)
  const [removendo, setRemovendo] = useState(false)
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

  // uso do insumo: decide entre Excluir (sem uso, só admin) e Arquivar
  useEffect(() => {
    let ativo = true
    const contar = (tabela: string) =>
      db.from(tabela).select('id', { count: 'exact', head: true }).eq('insumo_id', insumo.id)
    Promise.all([
      db.from('ficha_itens').select('ficha_id').eq('insumo_id', insumo.id),
      contar('estoque_entradas'),
      contar('estoque_contagens'),
      contar('checklist_items'),
    ]).then(([fi, en, co, ch]) => {
      if (!ativo) return
      const falha = [fi, en, co, ch].find((r) => r.error)
      if (falha) return setUsoErro('Não foi possível verificar o uso: ' + falha.error.message)
      setUso({
        fichas: new Set((fi.data ?? []).map((x: { ficha_id: string }) => x.ficha_id)).size,
        entradas: en.count ?? 0,
        contagens: co.count ?? 0,
        checklist: ch.count ?? 0,
      })
    })
    return () => {
      ativo = false
    }
  }, [insumo.id])
  const emUso = uso != null && uso.fichas + uso.entradas + uso.contagens + uso.checklist > 0

  function validar(): string | null {
    if (!f.nome.trim()) return 'Informe o nome do insumo.'
    const fator = lerNumero(f.fator)
    if (fator == null || fator < 1) return 'O fator de correção precisa ser um número maior ou igual a 1.'
    if (podePreco && f.preco.trim() && precoNovo == null) return 'Preço inválido.'
    if (podePreco && precoNovo != null && precoNovo < 0) return 'O preço não pode ser negativo.'
    return null
  }

  async function salvar() {
    const invalido = validar()
    if (invalido) return setErro(invalido)
    setErro(null)
    setSalvando(true)
    const upd: Record<string, unknown> = {
      nome: f.nome.trim(),
      categoria: f.categoria.trim() || null,
      unidade: f.unidade,
      fator_correcao: lerNumero(f.fator),
      fornecedor_id: f.fornecedor_id || null,
    }
    if (podePreco && mudouPreco) upd.preco = precoNovo
    const { data, error } = await db.from('insumos').update(upd).eq('id', insumo.id).select('id')
    setSalvando(false)
    if (error) return setErro('Não foi possível salvar: ' + mensagemErro(error))
    if (!data?.length) return setErro('Sem permissão para editar este insumo.')
    liberar()
    onSalvo()
  }

  async function arquivar() {
    if (!confirmarDescarte()) return
    setErro(null)
    setRemovendo(true)
    const { data, error } = await db.from('insumos').update({ ativo: false }).eq('id', insumo.id).select('id')
    setRemovendo(false)
    if (error) return setErro('Não foi possível arquivar: ' + mensagemErro(error))
    if (!data?.length) return setErro('Sem permissão para arquivar este insumo.')
    liberar()
    onSalvo()
  }

  async function excluir() {
    if (!window.confirm(`Excluir o insumo "${insumo.nome}"? O histórico de preços dele também será apagado. Esta ação não pode ser desfeita.`))
      return
    setErro(null)
    setRemovendo(true)
    const { data, error } = await db.from('insumos').delete().eq('id', insumo.id).select('id')
    setRemovendo(false)
    if (error) return setErro('Não foi possível excluir: ' + mensagemErro(error))
    if (!data?.length) return setErro('Sem permissão para excluir este insumo.')
    liberar()
    onSalvo()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/40" onClick={fechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Editar ${insumo.nome}`}
        className="h-full w-full max-w-lg overflow-y-auto bg-paper p-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))] shadow-[var(--shadow-sheet)] md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="subtitulo">{insumo.nome}</h2>
          <button onClick={fechar} className={btnSecCls}>Fechar</button>
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

        <div className="mt-4 rounded-xl border border-line p-3">
          <h3 className="mb-1 text-sm font-medium">Arquivar ou excluir</h3>
          {usoErro ? (
            <Erro texto={usoErro} />
          ) : !uso ? (
            <p className="text-xs text-ink-soft" role="status">verificando uso…</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-ink-soft">{fraseUso(uso)}</p>
              {emUso ? (
                <>
                  <p className="mb-2 text-xs text-ink-soft">
                    Arquivar esconde o insumo das listas e das novas fichas, mas mantém o histórico. Dá para reativar em "arquivados".
                  </p>
                  <button onClick={arquivar} disabled={removendo} className={btnSecCls}>
                    {removendo ? 'Arquivando…' : 'Arquivar'}
                  </button>
                </>
              ) : ehAdmin ? (
                <button onClick={excluir} disabled={removendo} className={btnPerigoCls}>
                  {removendo ? 'Excluindo…' : 'Excluir'}
                </button>
              ) : (
                <p className="text-xs text-ink-soft">Só o admin pode excluir insumos.</p>
              )}
            </>
          )}
        </div>

        {erro && <div className="mt-4"><Erro texto={erro} /></div>}

        <div className="sticky bottom-0 mt-4">
          <BarraSalvar sujo={sujo} salvando={salvando} onSalvar={salvar} onDescartar={() => { setF(inicial); setErro(null) }} />
        </div>
      </div>
    </div>
  )
}
