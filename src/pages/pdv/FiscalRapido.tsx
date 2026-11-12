import { useCallback, useEffect, useState } from 'react'
import { db, supabase } from '../../lib/supabase'
import { Carregando, Erro, btnCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { enfileirar, num, rotuloForma, soDigitos } from '../../lib/pdv'

/** CPF (11) ou CNPJ (14) com dígitos verificadores corretos. */
export function docValido(d: string) {
  const x = soDigitos(d)
  if (/^(\d)\1+$/.test(x)) return false
  if (x.length === 11) {
    const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(x[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
    return dv(9) === Number(x[9]) && dv(10) === Number(x[10])
  }
  if (x.length === 14) {
    const dv = (n: number) => { const p = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(x[i]) * p[i]; const r = s % 11; return r < 2 ? 0 : 11 - r }
    return dv(12) === Number(x[12]) && dv(13) === Number(x[13])
  }
  return false
}
export function mascaraDoc(v: string) {
  const d = soDigitos(v).slice(0, 14)
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}

export interface NotaFiscal {
  id: string; comanda_id: string | null; referencia: string; status: string; numero: number | null; serie: number | null; chave: string | null
  protocolo: string | null; mensagem: string | null; danfe_url: string | null; resposta: Record<string, unknown> | null; criado_em: string
}
const COR: Record<string, string> = { autorizada: 'bg-emerald-100 text-emerald-800', processando: 'bg-amber-100 text-amber-800', pendente: 'bg-amber-100 text-amber-800', cancelada: 'bg-surface text-ink-soft', rejeitada: 'bg-alert-soft text-alert', erro: 'bg-alert-soft text-alert' }

/** Enfileira a 2ª via do cupom (NFC-e) na impressora do caixa. */
export async function reimprimirNota(n: NotaFiscal) {
  if (!n.comanda_id) return { erro: 'Nota sem comanda.' }
  const [fc, cm, its, pg] = await Promise.all([
    db.from('pdv_fiscal_config').select('razao_social,nome_fantasia,cnpj').eq('id', 1).single(),
    db.from('pdv_comandas').select('cpf_cnpj_nota').eq('id', n.comanda_id).single(),
    db.from('pdv_pedido_itens').select('nome,qtd,preco_unit').eq('comanda_id', n.comanda_id).neq('status', 'cancelado'),
    db.from('pdv_pagamentos').select('forma,valor,troco').eq('comanda_id', n.comanda_id).eq('estornado', false),
  ])
  const itens = (its.data ?? []).map((i: { nome: string; qtd: number; preco_unit: number }) => ({ nome: i.nome, qtd: num(i.qtd), preco: num(i.preco_unit) }))
  const r = (n.resposta ?? {}) as Record<string, string>
  return enfileirar(db, 'caixa', 'cupom', {
    via2: true, emitente: fc.data?.nome_fantasia || fc.data?.razao_social, cnpj: fc.data?.cnpj,
    itens, total: itens.reduce((s: number, i: { qtd: number; preco: number }) => s + i.qtd * i.preco, 0),
    pagamentos: (pg.data ?? []).map((p: { forma: string; valor: number; troco: number }) => ({ forma: rotuloForma(p.forma), valor: num(p.valor) - num(p.troco) })),
    numero: n.numero, serie: n.serie, chave: n.chave, protocolo: n.protocolo, consumidor: cm.data?.cpf_cnpj_nota || null,
    qrcode: r.qrcode_url, url_consulta: r.url_consulta_nf,
  }, n.comanda_id)
}

async function acaoFiscal(acao: string, extra: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('pdv-fiscal', { body: { acao, ...extra } })
  if (error) {
    let m = error.message
    try { const j = await (error as unknown as { context?: Response }).context?.json(); if (j?.error) m = j.error } catch { /* ignora */ }
    return { erro: m }
  }
  return { erro: (data as { error?: string })?.error, mensagem: (data as { mensagem?: string })?.mensagem, referencia: (data as { referencia?: string })?.referencia }
}

/** Emissão rápida do cupom fiscal de uma comanda: CPF/CNPJ do cliente (ou sem) + status da nota. */
export function EmitirFiscal({ comandaId, docInicial, compacto }: { comandaId: string; docInicial?: string | null; compacto?: boolean }) {
  const [doc, setDoc] = useState(docInicial ? mascaraDoc(docInicial) : '')
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [ativo, setAtivo] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([db.from('pdv_notas').select('*').eq('comanda_id', comandaId).order('criado_em', { ascending: false }), db.from('pdv_fiscal_config').select('ativo').maybeSingle()])
    setNotas((a.data ?? []) as NotaFiscal[]); setAtivo(b.data?.ativo === true)
  }, [comandaId])
  useEffect(() => { carregar() }, [carregar])

  const viva = notas.find((n) => ['autorizada', 'processando', 'pendente'].includes(n.status))
  async function consultar(ref: string) {
    const r = await acaoFiscal('consultar', { referencia: ref })
    if (r.erro) setErro(r.erro); else setMsg(r.mensagem ?? '')
    carregar()
  }
  async function emitir() {
    setErro(''); setMsg('')
    const d = soDigitos(doc)
    if (d && !docValido(d)) return setErro('CPF/CNPJ inválido. Confira os números ou deixe em branco (consumidor não identificado).')
    setOcupado(true)
    await db.from('pdv_comandas').update({ cpf_cnpj_nota: d || null }).eq('id', comandaId)
    const r = await acaoFiscal('emitir', { comanda_id: comandaId })
    if (r.erro) { setOcupado(false); setErro(r.erro); return carregar() }
    setMsg('NFC-e enviada. Consultando a SEFAZ…')
    if (r.referencia) { await new Promise((x) => setTimeout(x, 3500)); await consultar(r.referencia) }
    setOcupado(false)
  }
  async function reimprimir(n: NotaFiscal) {
    const r = await reimprimirNota(n)
    if (r.erro) setErro(r.erro); else { setErro(''); setMsg('2ª via enviada para a impressora do caixa.') }
  }
  async function cancelar(n: NotaFiscal) {
    const j = window.prompt('Justificativa do cancelamento (mínimo 15 caracteres):')
    if (!j) return
    const r = await acaoFiscal('cancelar', { referencia: n.referencia, justificativa: j })
    if (r.erro) setErro(r.erro); else setMsg(r.mensagem ?? 'Cancelamento enviado.')
    carregar()
  }
  if (ativo === null) return <Carregando />
  return (
    <div className={compacto ? 'space-y-3' : `${cartaoCls} space-y-3 p-4`}>
      <h3 className="font-semibold">Cupom fiscal (NFC-e)</h3>
      {!ativo && <p className="rounded-xl bg-alert-soft p-3 text-sm text-alert">Módulo fiscal inativo. Ative em PDV · Configurações › Fiscal.</p>}
      {erro && <Erro texto={erro} />}
      {msg && <p className="rounded-xl bg-brand-soft px-4 py-2 text-sm text-brand">{msg}</p>}
      {!viva && (
        <>
          <label className="block text-sm">CPF ou CNPJ do cliente (opcional)
            <input className={inputCls} inputMode="numeric" placeholder="000.000.000-00" value={doc} onChange={(e) => setDoc(mascaraDoc(e.target.value))} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button className={btnCls} disabled={ocupado || !ativo} onClick={emitir}>{ocupado ? 'Emitindo…' : soDigitos(doc) ? 'Emitir com CPF/CNPJ' : 'Emitir sem CPF'}</button>
            {doc && <button className={btnSecCls} onClick={() => setDoc('')}>Limpar</button>}
          </div>
        </>
      )}
      {notas.length > 0 && (
        <ul className="divide-y divide-line text-sm">
          {notas.map((n) => (
            <li key={n.id} className="space-y-1 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR[n.status] ?? 'bg-surface'}`}>{n.status}</span>
                {n.numero && <b>nº {n.numero}</b>}
                <span className="text-xs text-ink-soft">{new Date(n.criado_em).toLocaleString('pt-BR')}</span>
              </div>
              {n.mensagem && n.status !== 'autorizada' && <p className="text-xs text-alert">{n.mensagem}</p>}
              <div className="flex flex-wrap gap-3 text-xs">
                {(n.status === 'processando' || n.status === 'pendente') && <button className="text-brand underline" onClick={() => consultar(n.referencia)}>consultar status</button>}
                {n.status === 'autorizada' && <button className="text-brand underline" onClick={() => reimprimir(n)}>reimprimir cupom</button>}
                {n.danfe_url && <a className="text-brand underline" href={n.danfe_url} target="_blank" rel="noreferrer">abrir DANFE</a>}
                {n.status === 'autorizada' && <button className="text-alert underline" onClick={() => cancelar(n)}>cancelar nota</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Área "Impressoras › Reimprimir cupom fiscal": últimas notas autorizadas, busca por nº da comanda. */
export function ReimprimirCupons() {
  const [notas, setNotas] = useState<(NotaFiscal & { comanda?: { numero: number; nome_cliente: string | null } })[]>([])
  const [busca, setBusca] = useState('')
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')
  const carregar = useCallback(async () => {
    const { data } = await db.from('pdv_notas').select('*, comanda:pdv_comandas(numero,nome_cliente)').eq('status', 'autorizada').order('criado_em', { ascending: false }).limit(40)
    setNotas((data ?? []) as typeof notas)
  }, [])
  useEffect(() => { carregar() }, [carregar])
  const lista = notas.filter((n) => !busca || String(n.comanda?.numero ?? '').includes(busca) || String(n.numero ?? '').includes(busca) || (n.comanda?.nome_cliente ?? '').toLowerCase().includes(busca.toLowerCase()))
  async function reimprimir(n: NotaFiscal) {
    const r = await reimprimirNota(n)
    if (r.erro) { setErro(r.erro); setMsg('') } else { setErro(''); setMsg('2ª via enviada para a impressora do caixa.') }
  }
  return (
    <section className={`${cartaoCls} space-y-2 p-4`}>
      <h3 className="font-semibold">Reimprimir cupom fiscal</h3>
      {erro && <Erro texto={erro} />}
      {msg && <p className="rounded-xl bg-brand-soft px-4 py-2 text-sm text-brand">{msg}</p>}
      <input className={inputCls} placeholder="Buscar por nº da comanda, nº da nota ou nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {!lista.length ? <p className="text-sm text-ink-soft">Nenhuma nota autorizada encontrada.</p> : (
        <ul className="divide-y divide-line text-sm">
          {lista.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>NFC-e <b>{n.numero ?? '—'}</b> · comanda #{n.comanda?.numero ?? '—'} {n.comanda?.nome_cliente ? `· ${n.comanda.nome_cliente}` : ''}<span className="block text-xs text-ink-soft">{new Date(n.criado_em).toLocaleString('pt-BR')}</span></span>
              <span className="flex gap-2">
                {n.danfe_url && <a className={btnSecCls + ' !min-h-[36px]'} href={n.danfe_url} target="_blank" rel="noreferrer">DANFE</a>}
                <button className={btnCls + ' !min-h-[36px]'} onClick={() => reimprimir(n)}>Reimprimir</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-soft">A 2ª via sai na impressora do <b>caixa</b> e não altera a nota.</p>
    </section>
  )
}
