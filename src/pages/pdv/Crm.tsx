import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, chipCls, inputCls } from '../../components/Estado'
import { reais, lerNumero, diasDesde, dataBR } from '../../lib/formato'
import { usePermissoes } from '../../context/PermissoesContext'
import { Modal } from './PdvCaixa'
import { mascaraTel, soDigitos } from './CheckinRapido'

export interface Cli { id: string; nome: string; telefone: string; nascimento: string | null; email: string | null; observacao: string | null; aceita_marketing: boolean; criado_em: string; visitas: number; gasto: number; ticket_medio: number; ticket_pessoa: number; ultima_visita: string | null; visitas_90d: number; cashback_saldo: number }
interface Regra { id: string; nome: string; tipo: 'aniversario' | 'ticket_medio' | 'produto' | 'inativos' | 'recorrentes'; params: Record<string, number | string>; acao: 'mensagem' | 'cashback'; cashback_valor: number; mensagem: string; ativo: boolean }
interface Envio { regra_id: string; cliente_id: string; criado_em: string }
interface ProdCli { cliente_id: string; nome: string; qtd: number; valor: number; visitas: number }

const TIPOS: Record<Regra['tipo'], { r: string; ajuda: string }> = {
  aniversario: { r: 'Aniversário', ajuda: 'Clientes que fazem aniversário nos próximos N dias.' },
  ticket_medio: { r: 'Ticket médio', ajuda: 'Clientes numa faixa de ticket médio (ex.: VIP acima de R$ 150).' },
  produto: { r: 'Produto consumido', ajuda: 'Quem consumiu um produto (nome contém) ao menos N vezes.' },
  inativos: { r: 'Inativos', ajuda: 'Clientes com N visitas ou mais que não voltam há X dias.' },
  recorrentes: { r: 'Recorrentes', ajuda: 'Clientes com N visitas ou mais nos últimos 90 dias.' },
}
const MODELOS: Omit<Regra, 'id' | 'ativo'>[] = [
  { nome: 'Parabéns de aniversário', tipo: 'aniversario', params: { dias: 3 }, acao: 'cashback', cashback_valor: 20, mensagem: 'Oi {primeiro_nome}! A equipe do {casa} deseja um feliz aniversário 🎉 Preparamos um mimo: R$ 20 de cashback para você usar na sua comemoração!' },
  { nome: 'Clientes VIP (ticket alto)', tipo: 'ticket_medio', params: { min: 150, min_visitas: 2 }, acao: 'mensagem', cashback_valor: 0, mensagem: 'Oi {primeiro_nome}, você é cliente especial do {casa}! Reservamos uma mesa para você quando quiser. É só responder aqui.' },
  { nome: 'Sentimos sua falta', tipo: 'inativos', params: { dias: 45, min_visitas: 2 }, acao: 'cashback', cashback_valor: 15, mensagem: 'Oi {primeiro_nome}, faz um tempo que não nos vemos no {casa}! Volte e ganhe R$ 15 de cashback na sua próxima visita.' },
  { nome: 'Fãs da casa (recorrentes)', tipo: 'recorrentes', params: { min_visitas: 3 }, acao: 'mensagem', cashback_valor: 0, mensagem: 'Oi {primeiro_nome}! Obrigado por voltar sempre ao {casa} 💛 Temos novidades no cardápio, vem conferir!' },
]
const CASA = 'Paggio'

function proxAniversario(n: string | null) {
  if (!n) return Infinity
  const [, m, d] = n.split('-').map(Number)
  const h = new Date(); h.setHours(0, 0, 0, 0)
  let a = new Date(h.getFullYear(), m - 1, d)
  if (a < h) a = new Date(h.getFullYear() + 1, m - 1, d)
  return Math.round((a.getTime() - h.getTime()) / 864e5)
}
export function segmento(c: Cli): { r: string; cor: string } {
  const du = diasDesde(c.ultima_visita)
  if (c.visitas === 0) return { r: 'Sem visita', cor: 'bg-surface text-ink-soft ring-1 ring-line' }
  if (du > 90) return { r: 'Inativo', cor: 'bg-alert-soft text-alert' }
  if (du > 45) return { r: 'Em risco', cor: 'bg-amber-100 text-amber-800' }
  if (c.visitas_90d >= 3) return { r: 'Recorrente', cor: 'bg-emerald-100 text-emerald-800' }
  if (c.visitas <= 1) return { r: 'Novo', cor: 'bg-sky-100 text-sky-800' }
  return { r: 'Ativo', cor: 'bg-brand-soft text-brand' }
}
const waLink = (tel: string, texto: string) => `https://wa.me/55${soDigitos(tel).slice(-11)}?text=${encodeURIComponent(texto)}`
const montar = (m: string, c: Cli) => m.replaceAll('{nome}', c.nome).replaceAll('{primeiro_nome}', c.nome.split(' ')[0]).replaceAll('{saldo}', reais(c.cashback_saldo)).replaceAll('{casa}', CASA)

export function Crm() {
  const { pode } = usePermissoes()
  const gerir = pode('pdv_gerir')
  const [aba, setAba] = useState<'geral' | 'clientes' | 'reguas' | 'cashback'>('geral')
  const [clis, setClis] = useState<Cli[] | null>(null)
  const [regras, setRegras] = useState<Regra[]>([])
  const [envios, setEnvios] = useState<Envio[]>([])
  const [prods, setProds] = useState<ProdCli[]>([])
  const [aberto, setAberto] = useState<Cli | null>(null)

  const carregar = useCallback(async () => {
    const [c, r, e, p] = await Promise.all([
      db.from('v_clientes_resumo').select('*').order('gasto', { ascending: false }).limit(5000),
      db.from('crm_regras').select('*').order('criado_em'),
      db.from('crm_envios').select('regra_id,cliente_id,criado_em').gte('criado_em', new Date(Date.now() - 90 * 864e5).toISOString()),
      db.from('v_cliente_produtos').select('cliente_id,nome,qtd,valor,visitas'),
    ])
    setClis(((c.data ?? []) as Cli[]).map((x) => ({ ...x, gasto: Number(x.gasto), ticket_medio: Number(x.ticket_medio), ticket_pessoa: Number(x.ticket_pessoa), cashback_saldo: Number(x.cashback_saldo) })))
    setRegras((r.data ?? []) as Regra[]); setEnvios((e.data ?? []) as Envio[]); setProds((p.data ?? []) as ProdCli[])
  }, [])
  useEffect(() => { carregar() }, [carregar])

  if (!clis) return <Carregando />
  return (
    <div>
      <Cabecalho titulo="CRM" subtitulo={`${clis.length} cliente(s) · base montada a partir do check-in`} />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {([['geral', 'Visão geral'], ['clientes', 'Clientes'], ['reguas', 'Réguas e ações'], ['cashback', 'Cashback']] as const).map(([v, r]) => <button key={v} className={chipCls(aba === v)} onClick={() => setAba(v)}>{r}</button>)}
      </div>
      {aba === 'geral' && <Geral clis={clis} regras={regras} irReguas={() => setAba('reguas')} abrir={setAberto} />}
      {aba === 'clientes' && <Lista clis={clis} abrir={setAberto} />}
      {aba === 'reguas' && <Reguas clis={clis} regras={regras} envios={envios} prods={prods} gerir={gerir} recarregar={carregar} />}
      {aba === 'cashback' && <Cashback clis={clis} gerir={gerir} abrir={setAberto} />}
      {aberto && <Ficha c={aberto} gerir={gerir} fechar={() => setAberto(null)} salvo={() => { carregar(); setAberto(null) }} />}
    </div>
  )
}

function Kpi({ r, v, sub }: { r: string; v: string; sub?: string }) {
  return <div className={`${cartaoCls} p-3`}><div className="text-xs text-ink-soft">{r}</div><div className="text-xl font-semibold">{v}</div>{sub && <div className="text-xs text-ink-soft">{sub}</div>}</div>
}

function Geral({ clis, regras, irReguas, abrir }: { clis: Cli[]; regras: Regra[]; irReguas: () => void; abrir: (c: Cli) => void }) {
  const d = useMemo(() => {
    const comVisita = clis.filter((c) => c.visitas > 0)
    const gasto = comVisita.reduce((s, c) => s + c.gasto, 0), vis = comVisita.reduce((s, c) => s + c.visitas, 0)
    const faixas = [['até R$ 50', 0, 50], ['R$ 50–100', 50, 100], ['R$ 100–150', 100, 150], ['R$ 150–250', 150, 250], ['acima de R$ 250', 250, 1e9]] as const
    return {
      novos30: clis.filter((c) => diasDesde(c.criado_em) <= 30).length,
      recorrentes: clis.filter((c) => segmento(c).r === 'Recorrente').length,
      emRisco: clis.filter((c) => ['Em risco', 'Inativo'].includes(segmento(c).r)).length,
      ticket: vis ? gasto / vis : 0,
      aniv7: clis.filter((c) => proxAniversario(c.nascimento) <= 7),
      anivHoje: clis.filter((c) => proxAniversario(c.nascimento) === 0).length,
      saldo: clis.reduce((s, c) => s + c.cashback_saldo, 0),
      semNasc: clis.filter((c) => !c.nascimento).length,
      topGasto: comVisita.slice(0, 8), freq: [...comVisita].sort((a, b) => b.visitas - a.visitas).slice(0, 8),
      faixas: faixas.map(([r, a, b]) => ({ r, n: comVisita.filter((c) => c.ticket_medio >= a && c.ticket_medio < b).length })),
      vip: comVisita.filter((c) => c.ticket_medio >= 150 && c.visitas >= 2).length,
    }
  }, [clis])
  const maxF = Math.max(1, ...d.faixas.map((f) => f.n))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Kpi r="Clientes" v={String(clis.length)} sub={`${d.novos30} novos em 30 dias`} />
        <Kpi r="Ticket médio" v={reais(d.ticket)} sub="por visita" />
        <Kpi r="Recorrentes" v={String(d.recorrentes)} sub="3+ visitas em 90 dias" />
        <Kpi r="Em risco / inativos" v={String(d.emRisco)} sub="sem voltar há 45+ dias" />
        <Kpi r="Aniversariantes (7 dias)" v={String(d.aniv7.length)} sub={d.anivHoje ? `${d.anivHoje} hoje` : undefined} />
        <Kpi r="Cashback em aberto" v={reais(d.saldo)} />
        <Kpi r="VIP" v={String(d.vip)} sub="ticket ≥ R$ 150 e 2+ visitas" />
        <Kpi r="Sem data de nascimento" v={String(d.semNasc)} sub="peça no check-in" />
      </div>
      <section className={`${cartaoCls} p-4`}>
        <h3 className="mb-2 font-semibold">Ações sugeridas</h3>
        <ul className="space-y-1 text-sm">
          {d.anivHoje + d.aniv7.length > 0 && <li>🎂 {d.aniv7.length} aniversariante(s) nos próximos 7 dias — mande parabéns com cashback.</li>}
          {d.emRisco > 0 && <li>💤 {d.emRisco} cliente(s) não voltam há mais de 45 dias — dispare a régua “Sentimos sua falta”.</li>}
          {d.vip > 0 && <li>⭐ {d.vip} cliente(s) VIP — ofereça reserva prioritária e novidades.</li>}
          {d.semNasc > 0 && <li>📅 {d.semNasc} cliente(s) sem aniversário cadastrado — peça no próximo check-in.</li>}
          {!regras.length && <li>📣 Nenhuma régua criada ainda: comece pelos modelos prontos.</li>}
        </ul>
        <button className={btnSecCls + ' mt-3'} onClick={irReguas}>Abrir réguas e ações</button>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${cartaoCls} p-4`}>
          <h3 className="mb-2 font-semibold">Clientes por faixa de ticket médio</h3>
          {d.faixas.map((f) => <div key={f.r} className="mb-1 flex items-center gap-2 text-sm"><span className="w-32 shrink-0">{f.r}</span><span className="h-4 rounded bg-brand" style={{ width: `${(f.n / maxF) * 100}%`, minWidth: f.n ? 4 : 0 }} /><b>{f.n}</b></div>)}
        </section>
        <section className={`${cartaoCls} p-4`}>
          <h3 className="mb-2 font-semibold">Aniversariantes próximos</h3>
          {!d.aniv7.length ? <p className="text-sm text-ink-soft">Ninguém nos próximos 7 dias.</p> : d.aniv7.map((c) => <button key={c.id} onClick={() => abrir(c)} className="flex w-full justify-between py-1 text-left text-sm"><span>{c.nome}</span><span className="text-ink-soft">{proxAniversario(c.nascimento) === 0 ? 'hoje' : `em ${proxAniversario(c.nascimento)} dia(s)`}</span></button>)}
        </section>
        <section className={`${cartaoCls} p-4`}>
          <h3 className="mb-2 font-semibold">Quem mais gastou</h3>
          {d.topGasto.map((c) => <button key={c.id} onClick={() => abrir(c)} className="flex w-full justify-between py-1 text-left text-sm"><span>{c.nome}</span><span>{reais(c.gasto)} · {c.visitas}x</span></button>)}
          {!d.topGasto.length && <p className="text-sm text-ink-soft">Ainda sem comandas fechadas ligadas a clientes.</p>}
        </section>
        <section className={`${cartaoCls} p-4`}>
          <h3 className="mb-2 font-semibold">Mais frequentes</h3>
          {d.freq.map((c) => <button key={c.id} onClick={() => abrir(c)} className="flex w-full justify-between py-1 text-left text-sm"><span>{c.nome}</span><span>{c.visitas} visitas · ticket {reais(c.ticket_medio)}</span></button>)}
        </section>
      </div>
    </div>
  )
}

function csv(clis: Cli[]) {
  const l = [['Nome', 'Telefone', 'Nascimento', 'Visitas', 'Gasto', 'Ticket médio', 'Última visita', 'Cashback', 'Segmento'].join(';')]
  clis.forEach((c) => l.push([c.nome, c.telefone, c.nascimento ?? '', c.visitas, c.gasto.toFixed(2), c.ticket_medio.toFixed(2), c.ultima_visita?.slice(0, 10) ?? '', c.cashback_saldo.toFixed(2), segmento(c).r].join(';')))
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + l.join('\n')], { type: 'text/csv' })); a.download = 'clientes.csv'; a.click()
}

function Lista({ clis, abrir }: { clis: Cli[]; abrir: (c: Cli) => void }) {
  const [q, setQ] = useState(''); const [seg, setSeg] = useState(''); const [mes, setMes] = useState(''); const [tmin, setTmin] = useState(''); const [ord, setOrd] = useState('gasto')
  const vis = useMemo(() => {
    const t = q.trim().toLowerCase(), min = lerNumero(tmin) ?? 0
    return clis.filter((c) => (!t || c.nome.toLowerCase().includes(t) || c.telefone.includes(soDigitos(t) || '§')) && (!seg || segmento(c).r === seg) && (!mes || (c.nascimento && Number(c.nascimento.slice(5, 7)) === Number(mes))) && c.ticket_medio >= min)
      .sort((a, b) => ord === 'visitas' ? b.visitas - a.visitas : ord === 'ticket' ? b.ticket_medio - a.ticket_medio : ord === 'recente' ? (b.ultima_visita ?? '').localeCompare(a.ultima_visita ?? '') : ord === 'nome' ? a.nome.localeCompare(b.nome) : b.gasto - a.gasto)
  }, [clis, q, seg, mes, tmin, ord])
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-5">
        <input className={inputCls + ' md:col-span-2'} placeholder="Buscar nome ou telefone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputCls} value={seg} onChange={(e) => setSeg(e.target.value)}><option value="">Todos os segmentos</option>{['Novo', 'Ativo', 'Recorrente', 'Em risco', 'Inativo', 'Sem visita'].map((s) => <option key={s}>{s}</option>)}</select>
        <select className={inputCls} value={mes} onChange={(e) => setMes(e.target.value)}><option value="">Aniversário: qualquer mês</option>{['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <input className={inputCls} inputMode="decimal" placeholder="Ticket mínimo R$" value={tmin} onChange={(e) => setTmin(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-soft">{vis.length} cliente(s)</span>
        <select className={inputCls + ' !w-auto'} value={ord} onChange={(e) => setOrd(e.target.value)}><option value="gasto">Maior gasto</option><option value="visitas">Mais visitas</option><option value="ticket">Maior ticket</option><option value="recente">Visita mais recente</option><option value="nome">Nome</option></select>
        <button className={btnSecCls + ' ml-auto'} onClick={() => csv(vis)}>Exportar CSV</button>
      </div>
      {!vis.length ? <Vazio texto="Nenhum cliente com esses filtros." /> : (
        <div className={`${cartaoCls} divide-y divide-line`}>
          {vis.slice(0, 300).map((c) => (
            <button key={c.id} onClick={() => abrir(c)} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left text-sm">
              <span className="min-w-0"><b>{c.nome}</b><span className="block text-xs text-ink-soft">{mascaraTel(c.telefone)}{c.nascimento ? ` · 🎂 ${dataBR(c.nascimento).slice(0, 5)}` : ''}</span></span>
              <span className="flex items-center gap-3 text-xs"><span>{c.visitas} visita(s)</span><span>ticket {reais(c.ticket_medio)}</span><span>{reais(c.gasto)}</span><span className={`rounded-full px-2 py-0.5 ${segmento(c).cor}`}>{segmento(c).r}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function avaliar(r: Regra, clis: Cli[], prods: ProdCli[]): Cli[] {
  const p = r.params
  const n = (k: string, d = 0) => Number(p[k] ?? d)
  switch (r.tipo) {
    case 'aniversario': return clis.filter((c) => proxAniversario(c.nascimento) <= n('dias', 7))
    case 'ticket_medio': return clis.filter((c) => c.visitas >= n('min_visitas', 1) && c.ticket_medio >= n('min', 0) && c.ticket_medio < (n('max', 0) || 1e9))
    case 'inativos': return clis.filter((c) => c.visitas >= n('min_visitas', 1) && diasDesde(c.ultima_visita) >= n('dias', 45))
    case 'recorrentes': return clis.filter((c) => c.visitas_90d >= n('min_visitas', 3))
    case 'produto': {
      const t = String(p.produto ?? '').toLowerCase(); if (!t) return []
      const por = new Map<string, number>()
      prods.filter((x) => x.nome.toLowerCase().includes(t)).forEach((x) => por.set(x.cliente_id, (por.get(x.cliente_id) ?? 0) + x.qtd))
      return clis.filter((c) => (por.get(c.id) ?? 0) >= n('min_qtd', 1))
    }
  }
}

function Reguas({ clis, regras, envios, prods, gerir, recarregar }: { clis: Cli[]; regras: Regra[]; envios: Envio[]; prods: ProdCli[]; gerir: boolean; recarregar: () => void }) {
  const [ed, setEd] = useState<Partial<Regra> | null>(null)
  const [ver, setVer] = useState<Regra | null>(null)
  const [msg, setMsg] = useState('')
  async function salvar() {
    if (!ed?.nome?.trim() || !ed.tipo) return setMsg('Informe nome e tipo.')
    const { id, ...d } = ed
    const { error } = id ? await db.from('crm_regras').update(d).eq('id', id) : await db.from('crm_regras').insert(d)
    if (error) return setMsg(error.message)
    setEd(null); setMsg(''); recarregar()
  }
  async function apagar(r: Regra) { if (window.confirm(`Apagar a régua "${r.nome}"?`)) { await db.from('crm_regras').delete().eq('id', r.id); recarregar() } }
  return (
    <div className="space-y-3">
      {gerir && (
        <div className="flex flex-wrap gap-2">
          <button className={btnCls} onClick={() => setEd({ tipo: 'aniversario', params: { dias: 3 }, acao: 'mensagem', cashback_valor: 0, mensagem: 'Oi {primeiro_nome}! …', ativo: true })}>Nova régua</button>
          {MODELOS.map((m) => <button key={m.nome} className={btnSecCls} onClick={() => setEd({ ...m, ativo: true })}>+ {m.nome}</button>)}
        </div>
      )}
      {!regras.length ? <Vazio texto="Nenhuma régua ainda. Use um modelo pronto acima." /> : regras.map((r) => {
        const alvo = avaliar(r, clis, prods).filter((c) => c.aceita_marketing)
        const novos = alvo.filter((c) => !envios.some((e) => e.regra_id === r.id && e.cliente_id === c.id && diasDesde(e.criado_em) < 30))
        return (
          <section key={r.id} className={`${cartaoCls} flex flex-wrap items-center justify-between gap-3 p-3 ${r.ativo ? '' : 'opacity-60'}`}>
            <div className="min-w-0">
              <b>{r.nome}</b> <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">{TIPOS[r.tipo].r}</span>
              <p className="text-xs text-ink-soft">{alvo.length} cliente(s) na régua · {novos.length} ainda não abordado(s) nos últimos 30 dias · ação: {r.acao === 'cashback' ? `cashback ${reais(r.cashback_valor)} + mensagem` : 'mensagem'}</p>
            </div>
            <div className="flex gap-2">
              <button className={btnCls} onClick={() => setVer(r)}>Ver e disparar</button>
              {gerir && <button className={btnSecCls} onClick={() => setEd(r)}>Editar</button>}
              {gerir && <button className={btnPerigoCls} onClick={() => apagar(r)}>Apagar</button>}
            </div>
          </section>
        )
      })}
      {ed && (
        <Modal titulo={ed.id ? 'Editar régua' : 'Nova régua'} fechar={() => setEd(null)}>
          <label className="block text-sm">Nome<input className={inputCls} value={ed.nome ?? ''} onChange={(e) => setEd({ ...ed, nome: e.target.value })} /></label>
          <label className="block text-sm">Tipo<select className={inputCls} value={ed.tipo} onChange={(e) => setEd({ ...ed, tipo: e.target.value as Regra['tipo'], params: {} })}>{Object.entries(TIPOS).map(([v, t]) => <option key={v} value={v}>{t.r}</option>)}</select></label>
          <p className="text-xs text-ink-soft">{ed.tipo && TIPOS[ed.tipo].ajuda}</p>
          <Params ed={ed} set={setEd} />
          <label className="block text-sm">Ação<select className={inputCls} value={ed.acao} onChange={(e) => setEd({ ...ed, acao: e.target.value as Regra['acao'] })}><option value="mensagem">Só mensagem (WhatsApp)</option><option value="cashback">Cashback + mensagem</option></select></label>
          {ed.acao === 'cashback' && <label className="block text-sm">Valor do cashback (R$)<input className={inputCls} inputMode="decimal" defaultValue={ed.cashback_valor ?? 0} onChange={(e) => setEd({ ...ed, cashback_valor: lerNumero(e.target.value) ?? 0 })} /></label>}
          <label className="block text-sm">Mensagem <span className="text-xs text-ink-soft">({'{primeiro_nome} {nome} {saldo} {casa}'})</span><textarea className={inputCls + ' !min-h-[110px] py-2'} value={ed.mensagem ?? ''} onChange={(e) => setEd({ ...ed, mensagem: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.ativo !== false} onChange={(e) => setEd({ ...ed, ativo: e.target.checked })} />Régua ativa</label>
          {msg && <p className="text-sm text-alert">{msg}</p>}
          <button className={btnCls} onClick={salvar}>Salvar régua</button>
        </Modal>
      )}
      {ver && <Disparo r={ver} alvo={avaliar(ver, clis, prods).filter((c) => c.aceita_marketing)} envios={envios} gerir={gerir} fechar={() => { setVer(null); recarregar() }} />}
    </div>
  )
}

function Params({ ed, set }: { ed: Partial<Regra>; set: (r: Partial<Regra>) => void }) {
  const p = ed.params ?? {}
  const campo = (k: string, r: string, ph?: string, txt?: boolean) => (
    <label key={k} className="block text-sm">{r}<input className={inputCls} inputMode={txt ? 'text' : 'decimal'} placeholder={ph} defaultValue={String(p[k] ?? '')} onChange={(e) => set({ ...ed, params: { ...p, [k]: txt ? e.target.value : lerNumero(e.target.value) ?? 0 } })} /></label>
  )
  switch (ed.tipo) {
    case 'aniversario': return campo('dias', 'Avisar quantos dias antes?', '3')
    case 'ticket_medio': return <div className="grid grid-cols-3 gap-2">{campo('min', 'Ticket mín. R$', '150')}{campo('max', 'Ticket máx. R$', 'sem limite')}{campo('min_visitas', 'Visitas mín.', '2')}</div>
    case 'produto': return <div className="grid grid-cols-2 gap-2">{campo('produto', 'Produto (nome contém)', 'Chopp', true)}{campo('min_qtd', 'Qtd. mínima', '3')}</div>
    case 'inativos': return <div className="grid grid-cols-2 gap-2">{campo('dias', 'Sem voltar há (dias)', '45')}{campo('min_visitas', 'Visitas mín.', '2')}</div>
    case 'recorrentes': return campo('min_visitas', 'Visitas mínimas em 90 dias', '3')
    default: return null
  }
}

function Disparo({ r, alvo, envios, gerir, fechar }: { r: Regra; alvo: Cli[]; envios: Envio[]; gerir: boolean; fechar: () => void }) {
  const [feitos, setFeitos] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState('')
  const jaEnviado = (c: Cli) => feitos.has(c.id) || envios.some((e) => e.regra_id === r.id && e.cliente_id === c.id && diasDesde(e.criado_em) < 30)
  async function enviar(c: Cli) {
    await db.from('crm_envios').insert({ regra_id: r.id, cliente_id: c.id, acao: 'mensagem' })
    setFeitos((s) => new Set(s).add(c.id))
    window.open(waLink(c.telefone, montar(r.mensagem, c)), '_blank')
  }
  async function creditarTodos() {
    const pend = alvo.filter((c) => !jaEnviado(c))
    if (!pend.length || !window.confirm(`Creditar ${reais(r.cashback_valor)} para ${pend.length} cliente(s)?`)) return
    const a = await db.from('pdv_cashback_mov').insert(pend.map((c) => ({ cliente_id: c.id, tipo: 'credito', valor: r.cashback_valor, motivo: `Régua: ${r.nome}` })))
    if (a.error) return setMsg(a.error.message)
    await db.from('crm_envios').insert(pend.map((c) => ({ regra_id: r.id, cliente_id: c.id, acao: 'cashback' })))
    setFeitos((s) => new Set([...s, ...pend.map((c) => c.id)])); setMsg(`Cashback creditado para ${pend.length} cliente(s). Agora envie a mensagem para cada um.`)
  }
  return (
    <Modal titulo={r.nome} fechar={fechar}>
      <p className="text-xs text-ink-soft">Cada envio abre o WhatsApp com a mensagem pronta; a abordagem fica registrada e a régua não repete o cliente por 30 dias. Clientes que recusaram marketing não entram.</p>
      {gerir && r.acao === 'cashback' && r.cashback_valor > 0 && <button className={btnSecCls} onClick={creditarTodos}>Creditar {reais(r.cashback_valor)} a quem ainda não recebeu</button>}
      {msg && <p className="text-sm text-brand">{msg}</p>}
      {!alvo.length ? <p className="text-sm text-ink-soft">Ninguém na régua agora.</p> : alvo.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm">
          <span><b>{c.nome}</b><span className="block text-xs text-ink-soft">{mascaraTel(c.telefone)} · {c.visitas} visita(s) · ticket {reais(c.ticket_medio)}</span></span>
          <button className={jaEnviado(c) ? btnSecCls : btnCls} onClick={() => enviar(c)}>{jaEnviado(c) ? 'Reenviar' : 'WhatsApp'}</button>
        </div>
      ))}
    </Modal>
  )
}

function Cashback({ clis, gerir, abrir }: { clis: Cli[]; gerir: boolean; abrir: (c: Cli) => void }) {
  const [pct, setPct] = useState<string>('')
  const [msg, setMsg] = useState('')
  useEffect(() => { db.from('pdv_config').select('cashback_pct').eq('id', 1).single().then(({ data }: { data: { cashback_pct: number } | null }) => setPct(String(data?.cashback_pct ?? 0).replace('.', ','))) }, [])
  async function salvar() {
    const v = lerNumero(pct) ?? 0
    const { error } = await db.from('pdv_config').update({ cashback_pct: v }).eq('id', 1)
    setMsg(error ? error.message : v > 0 ? `Pronto: ${v}% do consumo vira cashback ao fechar a comanda de um cliente.` : 'Cashback automático desligado.')
  }
  const com = clis.filter((c) => c.cashback_saldo > 0).sort((a, b) => b.cashback_saldo - a.cashback_saldo)
  return (
    <div className="space-y-3">
      <section className={`${cartaoCls} space-y-2 p-4`}>
        <h3 className="font-semibold">Cashback automático</h3>
        <p className="text-sm text-ink-soft">Percentual do consumo (sem taxa de serviço) devolvido ao cliente quando a comanda dele é fechada. 0 = desligado. O saldo é usado como desconto no fechamento (lance o desconto na comanda e registre o uso na ficha do cliente).</p>
        <div className="flex items-end gap-2"><label className="text-sm">% de cashback<input className={inputCls + ' !w-28'} inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} disabled={!gerir} /></label>{gerir && <button className={btnCls} onClick={salvar}>Salvar</button>}</div>
        {msg && <p className="text-sm text-brand">{msg}</p>}
      </section>
      <section className={`${cartaoCls} p-4`}>
        <h3 className="mb-2 font-semibold">Clientes com saldo ({com.length}) · {reais(com.reduce((s, c) => s + c.cashback_saldo, 0))}</h3>
        {com.map((c) => <button key={c.id} onClick={() => abrir(c)} className="flex w-full justify-between py-1 text-left text-sm"><span>{c.nome}</span><b>{reais(c.cashback_saldo)}</b></button>)}
        {!com.length && <p className="text-sm text-ink-soft">Nenhum saldo ainda.</p>}
      </section>
      <section className={`${cartaoCls} p-4 text-sm`}>
        <h3 className="mb-1 font-semibold">Outras ações comerciais que você pode usar</h3>
        <ul className="list-disc space-y-1 pl-5 text-ink-soft"><li>Cashback de aniversário e de reativação (modelos na aba Réguas).</li><li>Programa de indicação: crédito para quem traz um amigo (lance como “ajuste” na ficha).</li><li>Clube de recorrentes: avisar novidades do cardápio só para quem veio 3+ vezes.</li><li>Convite para rodízio/evento direcionado a quem consome certos produtos.</li></ul>
      </section>
    </div>
  )
}

function Ficha({ c, gerir, fechar, salvo }: { c: Cli; gerir: boolean; fechar: () => void; salvo: () => void }) {
  const [f, setF] = useState({ nome: c.nome, nascimento: c.nascimento ?? '', email: c.email ?? '', observacao: c.observacao ?? '', aceita_marketing: c.aceita_marketing })
  const [prods, setProds] = useState<ProdCli[]>([])
  const [hist, setHist] = useState<{ id: string; numero: number; aberta_em: string; status: string; total: number; mesa: string | null }[]>([])
  const [mov, setMov] = useState<{ id: string; tipo: string; valor: number; motivo: string | null; criado_em: string }[]>([])
  const [val, setVal] = useState(''); const [mot, setMot] = useState(''); const [erro, setErro] = useState('')
  const carregar = useCallback(async () => {
    const [p, h, m] = await Promise.all([
      db.from('v_cliente_produtos').select('cliente_id,nome,qtd,valor,visitas').eq('cliente_id', c.id).order('qtd', { ascending: false }).limit(10),
      db.from('v_comandas_busca').select('id,numero,aberta_em,status,total,mesa').eq('cliente_id', c.id).order('aberta_em', { ascending: false }).limit(15),
      db.from('pdv_cashback_mov').select('id,tipo,valor,motivo,criado_em').eq('cliente_id', c.id).order('criado_em', { ascending: false }).limit(15),
    ])
    setProds((p.data ?? []) as ProdCli[]); setHist((h.data ?? []) as typeof hist); setMov((m.data ?? []) as typeof mov)
  }, [c.id])
  useEffect(() => { carregar() }, [carregar])
  async function salvar() {
    const { error } = await db.from('pdv_clientes').update({ nome: f.nome.trim(), nascimento: f.nascimento || null, email: f.email.trim() || null, observacao: f.observacao.trim() || null, aceita_marketing: f.aceita_marketing, atualizado_em: new Date().toISOString() }).eq('id', c.id)
    if (error) setErro(error.message); else salvo()
  }
  async function lancar(tipo: 'credito' | 'uso') {
    const v = lerNumero(val); if (!v || v <= 0) return setErro('Informe um valor.')
    if (tipo === 'uso' && v > c.cashback_saldo) return setErro('Valor maior que o saldo.')
    const { error } = await db.from('pdv_cashback_mov').insert({ cliente_id: c.id, tipo, valor: tipo === 'uso' ? -v : v, motivo: mot.trim() || (tipo === 'uso' ? 'Uso de cashback' : 'Crédito manual') })
    if (error) return setErro(error.message)
    setVal(''); setMot(''); setErro(''); salvo()
  }
  return (
    <Modal titulo={c.nome} fechar={fechar}>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-surface p-2"><b className="block text-base">{c.visitas}</b>visitas</div>
        <div className="rounded-lg bg-surface p-2"><b className="block text-base">{reais(c.ticket_medio)}</b>ticket médio</div>
        <div className="rounded-lg bg-surface p-2"><b className="block text-base">{reais(c.cashback_saldo)}</b>cashback</div>
      </div>
      <p className="text-xs text-ink-soft">{mascaraTel(c.telefone)} · cliente desde {dataBR(c.criado_em)} · última visita {c.ultima_visita ? dataBR(c.ultima_visita) : '—'} · ticket por pessoa {reais(c.ticket_pessoa)}</p>
      <a className={btnSecCls} href={waLink(c.telefone, `Oi ${c.nome.split(' ')[0]}! `)} target="_blank" rel="noreferrer">Chamar no WhatsApp</a>
      <label className="block text-sm">Nome<input className={inputCls} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">Nascimento<input type="date" className={inputCls} value={f.nascimento} onChange={(e) => setF({ ...f, nascimento: e.target.value })} /></label>
        <label className="block text-sm">E-mail<input className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      </div>
      <label className="block text-sm">Observações (alergias, preferências…)<input className={inputCls} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.aceita_marketing} onChange={(e) => setF({ ...f, aceita_marketing: e.target.checked })} />Aceita receber mensagens e promoções</label>
      <button className={btnCls} onClick={salvar}>Salvar cliente</button>
      <h4 className="pt-2 text-sm font-semibold">Mais consumidos</h4>
      {prods.length ? prods.map((p) => <div key={p.nome} className="flex justify-between text-sm"><span>{p.nome}</span><span className="text-ink-soft">{p.qtd}× · {reais(Number(p.valor))}</span></div>) : <p className="text-xs text-ink-soft">Sem consumo registrado.</p>}
      <h4 className="pt-2 text-sm font-semibold">Visitas</h4>
      {hist.map((h) => <div key={h.id} className="flex justify-between text-sm"><span>#{h.numero} · {dataBR(h.aberta_em)}{h.mesa ? ` · mesa ${h.mesa}` : ''}</span><span className="text-ink-soft">{reais(Number(h.total))} · {h.status}</span></div>)}
      <h4 className="pt-2 text-sm font-semibold">Cashback</h4>
      {mov.map((m) => <div key={m.id} className="flex justify-between text-xs"><span>{dataBR(m.criado_em)} · {m.motivo ?? m.tipo}</span><b className={Number(m.valor) < 0 ? 'text-alert' : 'text-emerald-700'}>{reais(Number(m.valor))}</b></div>)}
      {gerir && (
        <div className="space-y-2 rounded-xl bg-surface p-3">
          <div className="grid grid-cols-2 gap-2"><input className={inputCls} inputMode="decimal" placeholder="Valor R$" value={val} onChange={(e) => setVal(e.target.value)} /><input className={inputCls} placeholder="Motivo" value={mot} onChange={(e) => setMot(e.target.value)} /></div>
          <div className="flex gap-2"><button className={btnSecCls} onClick={() => lancar('credito')}>Creditar</button><button className={btnSecCls} onClick={() => lancar('uso')}>Registrar uso</button></div>
        </div>
      )}
      {erro && <p className="text-sm text-alert">{erro}</p>}
    </Modal>
  )
}
