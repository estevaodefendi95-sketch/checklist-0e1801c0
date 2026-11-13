import { useCallback, useEffect, useState } from 'react'
import { db, supabase } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais, lerNumero } from '../../lib/formato'
import { FORMAS, Sessao, enfileirar, hora, num, rotuloForma, useAoVivo } from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'

interface Mov { id: string; tipo: 'sangria' | 'suprimento'; valor: number; motivo: string | null; criado_em: string }

export function PdvCaixa() {
  const { pode } = usePermissoes()
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [movs, setMovs] = useState<Mov[]>([])
  const [porForma, setPorForma] = useState<Record<string, number>>({})
  const [comandasAbertas, setComandasAbertas] = useState(0)
  const [recentes, setRecentes] = useState<Sessao[]>([])
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState('')
  const [mov, setMov] = useState<'sangria' | 'suprimento' | null>(null)
  const [mValor, setMValor] = useState('')
  const [mMotivo, setMMotivo] = useState('')
  const [fechando, setFechando] = useState(false)
  const [fundoTxt, setFundoTxt] = useState('')
  const abreFecha = pode('pdv_caixa_abrir')
  const [contado, setContado] = useState<Record<string, string>>({})
  const [obs, setObs] = useState('')
  const [naoCobrado, setNaoCobrado] = useState<Record<string, number>>({})

  const carregar = useCallback(async () => {
    const { data: s } = await db.from('pdv_caixa_sessoes').select('*').eq('status', 'aberto').order('aberto_em')
    const atual = ((s ?? []) as Sessao[])[0] ?? null   // caixa único do dia
    setSessao(atual)
    const rec = await db.from('pdv_caixa_sessoes').select('*').eq('status', 'fechado').order('fechado_em', { ascending: false }).limit(10)
    setRecentes((rec.data ?? []) as Sessao[])
    if (atual) {
      const [m, p, c, sc] = await Promise.all([
        db.from('pdv_caixa_movs').select('*').eq('sessao_id', atual.id).order('criado_em'),
        db.from('pdv_pagamentos').select('forma,valor,troco').eq('sessao_id', atual.id).eq('estornado', false).not('forma', 'in', '(folha,a_receber,cortesia)'),
        db.from('pdv_comandas').select('id', { count: 'exact', head: true }).in('status', ['aberta', 'pedindo_conta']),
        db.from('pdv_pagamentos').select('forma,valor').eq('sessao_id', atual.id).eq('estornado', false).in('forma', ['a_receber', 'cortesia']),
      ])
      const nc: Record<string, number> = {}
      ;(sc.data ?? []).forEach((x: { forma: string; valor: number }) => (nc[x.forma] = (nc[x.forma] ?? 0) + num(x.valor)))
      setNaoCobrado(nc)
      setMovs((m.data ?? []) as Mov[])
      const acc: Record<string, number> = {}
      ;(p.data ?? []).forEach((x: { forma: string; valor: number; troco: number }) => (acc[x.forma] = (acc[x.forma] ?? 0) + num(x.valor) - num(x.troco)))
      setPorForma(acc)
      setComandasAbertas(c.count ?? 0)
    }
    setPronto(true)
  }, [pode])
  useAoVivo(['pdv_pagamentos', 'pdv_caixa_sessoes', 'pdv_caixa_movs'], carregar)

  const sangrias = movs.filter((m) => m.tipo === 'sangria').reduce((s, m) => s + num(m.valor), 0)
  const suprimentos = movs.filter((m) => m.tipo === 'suprimento').reduce((s, m) => s + num(m.valor), 0)
  const dinheiroEsperado = (porForma.dinheiro ?? 0) + suprimentos - sangrias
  const totalVendas = Object.values(porForma).reduce((s, v) => s + v, 0)

  async function abrir() {
    setErro('')
    const fundo = lerNumero(fundoTxt) ?? 0
    const { error } = await db.from('pdv_caixa_sessoes').insert({
      caixa: 'Caixa do dia', fundo_inicial: fundo, aberto_por: (await supabase.auth.getUser()).data.user?.id,
    })
    if (error) return setErro(error.code === '23505' ? 'O caixa já está aberto.' : error.message)
    setFundoTxt('')
    carregar()
  }
  async function lancarMov() {
    const v = lerNumero(mValor)
    if (!sessao || !mov || !v || v <= 0) return setErro('Informe o valor.')
    if (!mMotivo.trim()) return setErro('Informe o motivo.')
    const { error } = await db.from('pdv_caixa_movs').insert({
      sessao_id: sessao.id, tipo: mov, valor: v, motivo: mMotivo.trim(), user_id: (await supabase.auth.getUser()).data.user?.id,
    })
    if (error) return setErro(error.message)
    setMov(null); setMValor(''); setMMotivo(''); setErro('')
    carregar()
  }
  async function fechar() {
    if (!sessao) return
    if (comandasAbertas > 0 && !window.confirm(`Ainda há ${comandasAbertas} comanda(s) aberta(s). Fechar o caixa mesmo assim?`)) return
    const cont: Record<string, number> = {}
    FORMAS.forEach((f) => { cont[f.v] = lerNumero(contado[f.v] ?? '') ?? (f.v === 'dinheiro' ? 0 : porForma[f.v] ?? 0) })
    const esperado: Record<string, number> = { ...porForma, dinheiro: dinheiroEsperado }
    const { error } = await db.from('pdv_caixa_sessoes').update({
      status: 'fechado', fechado_em: new Date().toISOString(), fechado_por: (await supabase.auth.getUser()).data.user?.id,
      contado: cont, observacao: obs.trim() || null,
    }).eq('id', sessao.id)
    if (error) return setErro(error.message)
    const r = await enfileirar(db, 'caixa', 'fechamento_caixa', {
      caixa: sessao.caixa, aberto_em: sessao.aberto_em, sangrias, suprimentos, esperado, contado: cont,
      diferenca_dinheiro: Math.round((cont.dinheiro - dinheiroEsperado) * 100) / 100, total_vendas: totalVendas,
    })
    setFechando(false); setContado({}); setObs('')
    setErro(r.erro ? `Caixa fechado. (${r.erro})` : '')
    carregar()
  }

  if (!pronto) return <Carregando />
  if (!sessao)
    return (
      <div>
        <Cabecalho titulo="Caixa" subtitulo={`Caixa fechado · ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}`} />
        {erro && <Erro texto={erro} />}
        <section className={`${cartaoCls} max-w-md space-y-3 p-5`}>
          <h2 className="font-semibold">Caixa do dia</h2>
          {abreFecha ? (
            <>
              <p className="text-sm text-ink-soft">Existe um único caixa por dia. Depois de aberto, todos que têm permissão de caixa recebem dentro dele e cada pagamento fica no nome de quem recebeu.</p>
              <label className="block text-sm">Fundo de troco (opcional)<input className={inputCls} inputMode="decimal" placeholder="0,00" value={fundoTxt} onChange={(e) => setFundoTxt(e.target.value)} /></label>
              <button className={btnCls} onClick={abrir}>Abrir o caixa</button>
            </>
          ) : (
            <p className="text-sm text-ink-soft">O caixa está fechado. Ele abre no horário agendado ou por quem tem permissão para abrir e fechar o caixa.</p>
          )}
        </section>
        {abreFecha && <AgendaCaixa />}
        {recentes.length > 0 && <Historico lista={recentes} />}
      </div>
    )

  return (
    <div>
      <Cabecalho
        titulo="Caixa"
        subtitulo={`${sessao.caixa} · aberto ${new Date(sessao.aberto_em).toLocaleDateString('pt-BR')} às ${hora(sessao.aberto_em)}`}
        acoes={abreFecha ? <button className={btnPerigoCls} onClick={() => setFechando(true)}>Fechar caixa</button> : undefined}
      />
      {erro && <Erro texto={erro} />}
      {new Date(sessao.aberto_em).toLocaleDateString('sv-SE') !== new Date().toLocaleDateString('sv-SE') && (
        <p className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Este caixa foi aberto em {new Date(sessao.aberto_em).toLocaleDateString('pt-BR')}. Ele deve ser fechado e o caixa de hoje aberto para manter o fechamento diário.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${cartaoCls} p-4`}>
          <h2 className="mb-2 font-semibold">Recebido por forma</h2>
          <ul className="divide-y divide-line text-sm">
            {FORMAS.map((f) => (
              <li key={f.v} className="flex justify-between py-2"><span>{f.r}</span><b>{reais(porForma[f.v] ?? 0)}</b></li>
            ))}
            <li className="flex justify-between py-2 text-base"><span>Total recebido</span><b>{reais(totalVendas)}</b></li>
            {(naoCobrado.a_receber ?? 0) > 0 && <li className="flex justify-between py-2 text-amber-700"><span>Deixado a receber (não entrou no caixa)</span><b>{reais(naoCobrado.a_receber)}</b></li>}
            {(naoCobrado.cortesia ?? 0) > 0 && <li className="flex justify-between py-2 text-amber-700"><span>Consumo interno (liberado sem cobrança)</span><b>{reais(naoCobrado.cortesia)}</b></li>}
          </ul>
        </section>
        <section className={`${cartaoCls} space-y-2 p-4`}>
          <h2 className="font-semibold">Dinheiro a conferir</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>+ Vendas em dinheiro</dt><dd>{reais(porForma.dinheiro ?? 0)}</dd></div>
            <div className="flex justify-between"><dt>+ Suprimentos</dt><dd>{reais(suprimentos)}</dd></div>
            <div className="flex justify-between"><dt>− Sangrias</dt><dd>{reais(sangrias)}</dd></div>
            <div className="flex justify-between text-base font-semibold"><dt>Esperado</dt><dd>{reais(dinheiroEsperado)}</dd></div>
          </dl>
          <div className="flex gap-2 pt-2">
            <button className={btnSecCls} onClick={() => setMov('sangria')}>Sangria</button>
            <button className={btnSecCls} onClick={() => setMov('suprimento')}>Suprimento</button>
          </div>
          {movs.length > 0 && (
            <ul className="divide-y divide-line pt-2 text-sm">
              {movs.map((m) => (
                <li key={m.id} className="flex justify-between py-1.5"><span>{hora(m.criado_em)} · {m.tipo} · {m.motivo}</span><span>{reais(m.valor)}</span></li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {mov && (
        <Modal fechar={() => setMov(null)} titulo={mov === 'sangria' ? 'Sangria (retirada)' : 'Suprimento (entrada)'}>
          <label className="block text-sm">Valor<input className={inputCls} inputMode="decimal" value={mValor} onChange={(e) => setMValor(e.target.value)} /></label>
          <label className="block text-sm">Motivo<input className={inputCls} value={mMotivo} onChange={(e) => setMMotivo(e.target.value)} /></label>
          <button className={btnCls} onClick={lancarMov}>Lançar</button>
        </Modal>
      )}
      {fechando && (
        <Modal fechar={() => setFechando(false)} titulo="Fechamento de caixa">
          <p className="text-sm text-ink-soft">Conte o dinheiro da gaveta. Esperado: <b>{reais(dinheiroEsperado)}</b></p>
          <label className="block text-sm">Dinheiro contado<input className={inputCls} inputMode="decimal" value={contado.dinheiro ?? ''} onChange={(e) => setContado({ ...contado, dinheiro: e.target.value })} /></label>
          {(() => { const c = lerNumero(contado.dinheiro ?? ''); return c != null ? <p className={`text-sm ${Math.abs(c - dinheiroEsperado) > 0.005 ? 'text-alert' : 'text-brand'}`}>Diferença: {reais(c - dinheiroEsperado)}</p> : null })()}
          <p className="text-xs text-ink-soft">Cartão/Pix/voucher assumem o valor registrado, salvo se você informar o conferido da maquininha:</p>
          <div className="grid grid-cols-2 gap-2">
            {FORMAS.filter((f) => f.v !== 'dinheiro').map((f) => (
              <label key={f.v} className="block text-xs">{rotuloForma(f.v)} ({reais(porForma[f.v] ?? 0)})
                <input className={inputCls} inputMode="decimal" value={contado[f.v] ?? ''} onChange={(e) => setContado({ ...contado, [f.v]: e.target.value })} />
              </label>
            ))}
          </div>
          <label className="block text-sm">Observação<input className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} /></label>
          <button className={btnPerigoCls} onClick={fechar}>Confirmar fechamento</button>
        </Modal>
      )}
      {abreFecha && <AgendaCaixa />}
      {recentes.length > 0 && <Historico lista={recentes} />}
    </div>
  )
}

function Historico({ lista }: { lista: Sessao[] }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">Últimos fechamentos</h2>
      {!lista.length ? <Vazio texto="Sem histórico." /> : (
        <ul className={`${cartaoCls} divide-y divide-line text-sm`}>
          {lista.map((s) => (
            <li key={s.id} className="flex justify-between gap-2 p-3">
              <span>{s.caixa} · {new Date(s.aberto_em).toLocaleDateString('pt-BR')} {hora(s.aberto_em)} → {s.fechado_em ? hora(s.fechado_em) : ''}</span>
              <span>{s.contado ? `dinheiro contado ${reais(s.contado.dinheiro)}` : 'sem contagem'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function Modal({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={fechar}>
      <div className={`${cartaoCls} max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto p-5`} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{titulo}</h3>
        {children}
      </div>
    </div>
  )
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
interface Agenda { ativo: boolean; abrir_hora: string; fechar_hora: string; dias: number[]; fundo_inicial: number }

/** Abertura e fechamento automáticos do caixa do dia (roda no servidor a cada 5 minutos). */
function AgendaCaixa() {
  const [a, setA] = useState<Agenda | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    db.from('pdv_caixa_agenda').select('*').eq('id', 1).maybeSingle().then((r: { data: Agenda | null }) => {
      if (r.data) setA({ ...r.data, abrir_hora: r.data.abrir_hora.slice(0, 5), fechar_hora: r.data.fechar_hora.slice(0, 5), fundo_inicial: num(r.data.fundo_inicial) })
    })
  }, [])
  if (!a) return null
  async function salvar() {
    if (!a) return
    const { error } = await db.from('pdv_caixa_agenda').update({ ativo: a.ativo, abrir_hora: a.abrir_hora, fechar_hora: a.fechar_hora, dias: a.dias, fundo_inicial: a.fundo_inicial, atualizado_em: new Date().toISOString() }).eq('id', 1)
    setMsg(error ? error.message : 'Agenda salva.')
  }
  return (
    <section className={`${cartaoCls} mt-6 max-w-xl space-y-3 p-5`}>
      <h2 className="font-semibold">Abertura e fechamento automáticos</h2>
      <p className="text-sm text-ink-soft">O sistema abre o caixa no horário de abertura e fecha depois do horário de fechamento, sem contagem de dinheiro (o esperado vira o conferido) e imprime o resumo. Se ainda houver comanda aberta, espera até 1 hora antes de fechar.</p>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={a.ativo} onChange={(e) => setA({ ...a, ativo: e.target.checked })} /> Agendamento ligado</label>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <label>Abre às<input type="time" className={inputCls} value={a.abrir_hora} onChange={(e) => setA({ ...a, abrir_hora: e.target.value })} /></label>
        <label>Fecha às<input type="time" className={inputCls} value={a.fechar_hora} onChange={(e) => setA({ ...a, fechar_hora: e.target.value })} /></label>
        <label>Fundo (R$)<input className={inputCls} inputMode="decimal" value={String(a.fundo_inicial).replace('.', ',')} onChange={(e) => setA({ ...a, fundo_inicial: lerNumero(e.target.value) ?? 0 })} /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        {DIAS.map((d, i) => (
          <button key={d} type="button" className={a.dias.includes(i) ? btnCls : btnSecCls} onClick={() => setA({ ...a, dias: a.dias.includes(i) ? a.dias.filter((x) => x !== i) : [...a.dias, i].sort() })}>{d}</button>
        ))}
      </div>
      <button className={btnCls} onClick={salvar}>Salvar agenda</button>
      {msg && <p className="text-sm text-ink-soft">{msg}</p>}
    </section>
  )
}
