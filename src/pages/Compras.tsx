import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/supabase'
import { Cabecalho } from '../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../components/Estado'
import { reais, lerNumero } from '../lib/formato'
import { usePermissoes } from '../context/PermissoesContext'

interface Forn { id: string; nome: string; cnpj: string | null }
interface Ins { id: string; nome: string; unidade: string; preco: number | null }
interface Item {
  key: string; descricao: string; codigo_fornecedor: string | null; insumo_id: string | null; qtd: number; unidade_nf: string
  valor_unit: number; valor_total: number; fator_conv: number; atualizar_preco: boolean; preco_anterior?: number | null; preco_novo?: number | null
}
interface Nf { id?: string; fornecedor_id: string | null; numero: string; serie: string; chave: string; emissao: string; observacao: string; status: 'rascunho' | 'confirmada' }
interface Resumo { id: string; numero: string | null; emissao: string | null; entrada: string; total: number; status: string; fornecedor: { nome: string } | null }
interface Mudanca { descricao: string; antigo: number | null; novo: number; fichas: number }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const so = (s: string) => s.replace(/\D/g, '')
/** unidades do insumo (kg/l/un) por unidade da NF */
function sugerirFator(uNf: string, uIns: string) {
  const u = uNf.toLowerCase()
  if (uIns === 'kg') return u === 'g' || u === 'gr' ? 0.001 : 1
  if (uIns === 'l') return u === 'ml' ? 0.001 : 1
  return 1
}
function achaInsumo(desc: string, ins: Ins[]) {
  const t = new Set(norm(desc).split(' ').filter((x) => x.length > 2))
  let melhor: Ins | null = null, nota = 0
  for (const i of ins) {
    const ti = norm(i.nome).split(' ').filter((x) => x.length > 2)
    if (!ti.length) continue
    const n = ti.filter((x) => t.has(x)).length / ti.length
    if (n > nota) { nota = n; melhor = i }
  }
  return nota >= 0.75 ? melhor : null
}

export function Compras() {
  const { pode } = usePermissoes()
  const [lista, setLista] = useState<Resumo[]>([])
  const [forn, setForn] = useState<Forn[]>([])
  const [ins, setIns] = useState<Ins[]>([])
  const [nf, setNf] = useState<Nf | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [muds, setMuds] = useState<Mudanca[] | null>(null)
  const arq = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      db.from('nf_compras').select('id,numero,emissao,entrada,total,status,fornecedor:fornecedores(nome)').order('entrada', { ascending: false }).order('criado_em', { ascending: false }).limit(60),
      db.from('fornecedores').select('id,nome,cnpj').order('nome'),
      db.from('insumos').select('id,nome,unidade,preco').eq('ativo', true).order('nome'),
    ])
    if (a.error) setErro(a.error.message)
    setLista((a.data ?? []) as unknown as Resumo[]); setForn((b.data ?? []) as Forn[]); setIns((c.data ?? []) as Ins[]); setPronto(true)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const novoItem = (): Item => ({ key: crypto.randomUUID(), descricao: '', codigo_fornecedor: null, insumo_id: null, qtd: 1, unidade_nf: 'KG', valor_unit: 0, valor_total: 0, fator_conv: 1, atualizar_preco: true })
  const total = itens.reduce((s, i) => s + i.valor_total, 0)
  const insPorId = useMemo(() => new Map(ins.map((i) => [i.id, i])), [ins])

  function setItem(key: string, p: Partial<Item>) {
    setItens((x) => x.map((i) => {
      if (i.key !== key) return i
      const n = { ...i, ...p }
      if ('insumo_id' in p && p.insumo_id) { const ii = insPorId.get(p.insumo_id); if (ii) n.fator_conv = sugerirFator(n.unidade_nf, ii.unidade) }
      if ('qtd' in p || 'valor_unit' in p) n.valor_total = Math.round(n.qtd * n.valor_unit * 100) / 100
      if ('valor_total' in p && n.qtd > 0) n.valor_unit = Math.round((n.valor_total / n.qtd) * 10000) / 10000
      return n
    }))
  }

  async function abrir(id: string) {
    setErro(''); setMsg(''); setMuds(null)
    const [a, b] = await Promise.all([db.from('nf_compras').select('*').eq('id', id).single(), db.from('nf_compra_itens').select('*').eq('nf_id', id).order('descricao')])
    if (a.error) return setErro(a.error.message)
    const n = a.data
    setNf({ id: n.id, fornecedor_id: n.fornecedor_id, numero: n.numero ?? '', serie: n.serie ?? '', chave: n.chave ?? '', emissao: n.emissao ?? '', observacao: n.observacao ?? '', status: n.status })
    setItens((b.data ?? []).map((i: Item & { id: string }) => ({ ...i, key: i.id, valor_unit: Number(i.valor_unit), valor_total: Number(i.valor_total), qtd: Number(i.qtd), fator_conv: Number(i.fator_conv) })))
  }

  async function importarXml(f: File) {
    setErro(''); setMsg('')
    try {
      const doc = new DOMParser().parseFromString(await f.text(), 'text/xml')
      const t = (el: Element | Document | null | undefined, tag: string) => el?.getElementsByTagName(tag)[0]?.textContent ?? ''
      const inf = doc.getElementsByTagName('infNFe')[0]
      if (!inf) return setErro('Arquivo não parece uma NF-e (XML sem infNFe).')
      const emit = doc.getElementsByTagName('emit')[0]
      const cnpj = so(t(emit, 'CNPJ')), nome = t(emit, 'xNome') || t(emit, 'xFant')
      const chave = (inf.getAttribute('Id') ?? '').replace(/^NFe/, '')
      if (chave && (await db.from('nf_compras').select('id').eq('chave', chave).maybeSingle()).data) return setErro('Esta NF-e já foi lançada (mesma chave de acesso).')
      let fo = forn.find((x) => x.cnpj && so(x.cnpj) === cnpj) ?? forn.find((x) => norm(x.nome) === norm(nome))
      if (!fo && nome) {
        const { data } = await db.from('fornecedores').insert({ nome, cnpj: cnpj || null }).select('id,nome,cnpj').single()
        if (data) { fo = data as Forn; setForn((x) => [...x, fo!]) }
      } else if (fo && !fo.cnpj && cnpj) await db.from('fornecedores').update({ cnpj }).eq('id', fo.id)
      // memória: o que já foi vinculado antes para este fornecedor/código
      const { data: ant } = fo ? await db.from('nf_compra_itens').select('codigo_fornecedor,insumo_id,fator_conv,nf:nf_compras!inner(fornecedor_id)').eq('nf.fornecedor_id', fo.id).not('insumo_id', 'is', null).not('codigo_fornecedor', 'is', null) : { data: [] }
      const memo = new Map((ant ?? []).map((a: { codigo_fornecedor: string; insumo_id: string; fator_conv: number }) => [a.codigo_fornecedor, a]))
      const novos: Item[] = Array.from(doc.getElementsByTagName('det')).map((d) => {
        const p = d.getElementsByTagName('prod')[0]
        const cod = t(p, 'cProd'), desc = t(p, 'xProd'), un = t(p, 'uCom') || 'UN', q = Number(t(p, 'qCom')) || 1
        const vu = Number(t(p, 'vUnCom')) || 0, vt = Number(t(p, 'vProd')) || q * vu
        const m = memo.get(cod) as { insumo_id: string; fator_conv: number } | undefined
        const ii = m ? insPorId.get(m.insumo_id) : achaInsumo(desc, ins)
        return { key: crypto.randomUUID(), descricao: desc, codigo_fornecedor: cod || null, insumo_id: ii?.id ?? null, qtd: q, unidade_nf: un, valor_unit: vu, valor_total: vt, fator_conv: m?.fator_conv ?? (ii ? sugerirFator(un, ii.unidade) : 1), atualizar_preco: true }
      })
      setMuds(null)
      setNf({ fornecedor_id: fo?.id ?? null, numero: t(doc.getElementsByTagName('ide')[0], 'nNF'), serie: t(doc.getElementsByTagName('ide')[0], 'serie'), chave, emissao: (t(doc.getElementsByTagName('ide')[0], 'dhEmi') || t(doc.getElementsByTagName('ide')[0], 'dEmi')).slice(0, 10), observacao: '', status: 'rascunho' })
      setItens(novos)
      setMsg(`${novos.length} itens importados; ${novos.filter((i) => i.insumo_id).length} já vinculados a insumos. Confira o vínculo e o fator de conversão antes de confirmar.`)
    } catch (e) { setErro('Não consegui ler o XML: ' + (e as Error).message) }
  }

  async function salvar(): Promise<string | null> {
    if (!nf) return null
    setErro('')
    if (!itens.length) { setErro('Adicione ao menos um item.'); return null }
    if (itens.some((i) => !i.descricao.trim())) { setErro('Há item sem descrição.'); return null }
    const cab = { fornecedor_id: nf.fornecedor_id, numero: nf.numero || null, serie: nf.serie || null, chave: nf.chave || null, emissao: nf.emissao || null, observacao: nf.observacao || null, total, status: 'rascunho' as const }
    let id = nf.id
    if (id) { const { error } = await db.from('nf_compras').update(cab).eq('id', id); if (error) { setErro(error.message); return null } }
    else { const { data, error } = await db.from('nf_compras').insert(cab).select('id').single(); if (error) { setErro(error.code === '23505' ? 'Esta NF (chave) já foi lançada.' : error.message); return null } id = data.id }
    await db.from('nf_compra_itens').delete().eq('nf_id', id)
    const { error } = await db.from('nf_compra_itens').insert(itens.map((i) => ({ nf_id: id, descricao: i.descricao.trim(), codigo_fornecedor: i.codigo_fornecedor, insumo_id: i.insumo_id, qtd: i.qtd, unidade_nf: i.unidade_nf, valor_unit: i.valor_unit, valor_total: i.valor_total, fator_conv: i.fator_conv > 0 ? i.fator_conv : 1, atualizar_preco: i.atualizar_preco })))
    if (error) { setErro(error.message); return null }
    setNf({ ...nf, id }); return id ?? null
  }
  async function confirmar() {
    const vinc = itens.filter((i) => i.insumo_id && i.atualizar_preco && i.valor_unit > 0)
    if (!window.confirm(vinc.length ? `Confirmar a NF? ${vinc.length} insumo(s) terão o preço atualizado e o custo das fichas será recalculado.` : 'Nenhum item vinculado a insumo: a NF será só registrada. Confirmar?')) return
    const id = await salvar()
    if (!id) return
    const { data, error } = await db.rpc('nf_compra_confirmar', { p_nf: id })
    if (error) return setErro(error.message)
    setMuds(data as Mudanca[]); setNf((x) => (x ? { ...x, status: 'confirmada' } : x)); carregar()
  }
  async function excluir(id: string) {
    if (!window.confirm('Excluir este rascunho?')) return
    await db.from('nf_compras').delete().eq('id', id); setNf(null); carregar()
  }

  if (!pode('lancar_estoque') && !pode('editar_precos') && !pode('pdv_gerir')) return <Erro texto="Sem permissão para notas de compra." />
  if (!pronto) return <Carregando />
  const trava = nf?.status === 'confirmada'
  return (
    <div>
      <Cabecalho titulo="Notas de compra" subtitulo="Cadastre a NF do fornecedor e reajuste o custo das fichas técnicas automaticamente" />
      {erro && <div className="mb-3"><Erro texto={erro} /></div>}
      {msg && <p className="mb-3 rounded-xl bg-brand-soft px-4 py-2 text-sm text-brand">{msg}</p>}
      <input ref={arq} type="file" accept=".xml,text/xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importarXml(f) }} />

      {!nf ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button className={btnCls} onClick={() => { setNf({ fornecedor_id: null, numero: '', serie: '', chave: '', emissao: '', observacao: '', status: 'rascunho' }); setItens([novoItem()]); setMuds(null); setMsg('') }}>Lançar NF manualmente</button>
            <button className={btnSecCls} onClick={() => arq.current?.click()}>Importar XML da NF-e</button>
          </div>
          <p className="text-sm text-ink-soft">O XML vem do e-mail do fornecedor ou do portal da NF-e. O sistema reconhece o fornecedor, sugere o insumo de cada linha e lembra os vínculos nas próximas notas.</p>
          {!lista.length ? <Vazio texto="Nenhuma nota de compra lançada." /> : (
            <ul className={`${cartaoCls} divide-y divide-line`}>
              {lista.map((n) => (
                <li key={n.id}><button className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm" onClick={() => abrir(n.id)}>
                  <span><b>{n.fornecedor?.nome ?? 'Sem fornecedor'}</b> · NF {n.numero ?? '—'}<span className="block text-xs text-ink-soft">entrada {new Date(n.entrada + 'T12:00').toLocaleDateString('pt-BR')} · {n.status}</span></span>
                  <b>{reais(Number(n.total))}</b>
                </button></li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <button className="text-sm text-brand underline" onClick={() => { setNf(null); carregar() }}>← voltar às notas</button>
          {muds && (
            <section className={`${cartaoCls} space-y-2 p-4`}>
              <h3 className="font-semibold">NF confirmada · preços reajustados</h3>
              {!muds.length ? <p className="text-sm text-ink-soft">Nenhum insumo foi atualizado.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {muds.map((m, i) => { const v = m.antigo ? ((m.novo - m.antigo) / m.antigo) * 100 : null; return (
                    <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5"><span>{m.descricao}</span><span>{m.antigo != null ? reais(m.antigo) : '—'} → <b>{reais(m.novo)}</b>{v != null && <em className={`ml-1 ${v > 0 ? 'text-alert' : 'text-emerald-700'}`}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</em>} · {m.fichas} ficha(s)</span></li>
                  ) })}
                </ul>
              )}
              <p className="text-xs text-ink-soft">O custo e o CMV das fichas já refletem os novos preços (Fichas técnicas). Reveja o preço de venda das que passaram da meta.</p>
            </section>
          )}
          <section className={`${cartaoCls} grid gap-2 p-4 sm:grid-cols-2`}>
            <label className="block text-sm">Fornecedor
              <select className={inputCls} disabled={trava} value={nf.fornecedor_id ?? ''} onChange={(e) => setNf({ ...nf, fornecedor_id: e.target.value || null })}><option value="">—</option>{forn.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
            </label>
            <label className="block text-sm">Data de emissão<input type="date" disabled={trava} className={inputCls} value={nf.emissao} onChange={(e) => setNf({ ...nf, emissao: e.target.value })} /></label>
            <label className="block text-sm">Número<input disabled={trava} className={inputCls} value={nf.numero} onChange={(e) => setNf({ ...nf, numero: e.target.value })} /></label>
            <label className="block text-sm">Chave de acesso (44 dígitos, opcional)<input disabled={trava} className={inputCls} value={nf.chave} onChange={(e) => setNf({ ...nf, chave: so(e.target.value).slice(0, 44) })} /></label>
          </section>
          <section className="space-y-2">
            {itens.map((i) => {
              const ii = i.insumo_id ? insPorId.get(i.insumo_id) : null
              const novo = ii && i.valor_unit > 0 ? Math.round((i.valor_unit / (i.fator_conv || 1)) * 10000) / 10000 : null
              const v = novo != null && ii?.preco ? ((novo - Number(ii.preco)) / Number(ii.preco)) * 100 : null
              return (
                <div key={i.key} className={`${cartaoCls} space-y-2 p-3 text-sm`}>
                  <div className="flex gap-2">
                    <input disabled={trava} className={inputCls} placeholder="Descrição na nota" value={i.descricao} onChange={(e) => setItem(i.key, { descricao: e.target.value })} />
                    {!trava && <button className={btnPerigoCls + ' !min-h-[44px]'} onClick={() => setItens((x) => x.filter((k) => k.key !== i.key))} aria-label="Remover item">×</button>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label>Qtd<input disabled={trava} className={inputCls} inputMode="decimal" defaultValue={String(i.qtd).replace('.', ',')} onBlur={(e) => setItem(i.key, { qtd: lerNumero(e.target.value) ?? 1 })} /></label>
                    <label>Unid. da NF<input disabled={trava} className={inputCls} value={i.unidade_nf} onChange={(e) => setItem(i.key, { unidade_nf: e.target.value })} /></label>
                    <label>Valor unit.<input disabled={trava} className={inputCls} inputMode="decimal" key={i.valor_unit} defaultValue={String(i.valor_unit).replace('.', ',')} onBlur={(e) => setItem(i.key, { valor_unit: lerNumero(e.target.value) ?? 0 })} /></label>
                    <label>Total<input disabled={trava} className={inputCls} inputMode="decimal" key={i.valor_total} defaultValue={String(i.valor_total).replace('.', ',')} onBlur={(e) => setItem(i.key, { valor_total: lerNumero(e.target.value) ?? 0 })} /></label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                    <label>Insumo do sistema
                      <select disabled={trava} className={inputCls} value={i.insumo_id ?? ''} onChange={(e) => setItem(i.key, { insumo_id: e.target.value || null })}><option value="">— não vincular (só registrar)</option>{ins.map((x) => <option key={x.id} value={x.id}>{x.nome} ({x.unidade})</option>)}</select>
                    </label>
                    <label title="Quantas unidades do insumo vêm em 1 unidade da NF (ex.: g→kg = 0,001; caixa com 12 un = 12)">Fator de conversão<input disabled={trava} className={inputCls} inputMode="decimal" key={i.fator_conv} defaultValue={String(i.fator_conv).replace('.', ',')} onBlur={(e) => setItem(i.key, { fator_conv: lerNumero(e.target.value) || 1 })} /></label>
                  </div>
                  {ii && novo != null && (
                    <p className="flex flex-wrap items-center gap-2 text-xs">
                      <span>Preço do insumo: {ii.preco != null ? reais(Number(ii.preco)) : 'sem preço'} → <b>{reais(novo)}</b>/{ii.unidade}</span>
                      {v != null && <em className={v > 0 ? 'text-alert' : 'text-emerald-700'}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</em>}
                      <label className="ml-auto flex items-center gap-1"><input type="checkbox" disabled={trava} checked={i.atualizar_preco} onChange={(e) => setItem(i.key, { atualizar_preco: e.target.checked })} />atualizar preço</label>
                    </p>
                  )}
                </div>
              )
            })}
            {!trava && <button className={btnSecCls} onClick={() => setItens((x) => [...x, novoItem()])}>+ Adicionar item</button>}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <b>Total da NF: {reais(total)}</b>
            {!trava && (
              <span className="flex flex-wrap gap-2">
                {nf.id && <button className={btnPerigoCls} onClick={() => excluir(nf.id!)}>Excluir rascunho</button>}
                <button className={btnSecCls} onClick={async () => { if (await salvar()) setMsg('Rascunho salvo.') }}>Salvar rascunho</button>
                <button className={btnCls} onClick={confirmar}>Confirmar e reajustar preços</button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
