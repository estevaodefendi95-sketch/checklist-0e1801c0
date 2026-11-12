import { useCallback, useState } from 'react'
import { db, supabase } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais, lerNumero } from '../../lib/formato'
import { FORMAS, Sessao, enfileirar, hora, num, rotuloForma, useAoVivo } from '../../lib/pdv'

interface Mov { id: string; tipo: 'sangria' | 'suprimento'; valor: number; motivo: string | null; criado_em: string }

export function PdvCaixa() {
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [movs, setMovs] = useState<Mov[]>([])
  const [porForma, setPorForma] = useState<Record<string, number>>({})
  const [comandasAbertas, setComandasAbertas] = useState(0)
  const [recentes, setRecentes] = useState<Sessao[]>([])
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState('')
  const [fundo, setFundo] = useState('')
  const [mov, setMov] = useState<'sangria' | 'suprimento' | null>(null)
  const [mValor, setMValor] = useState('')
  const [mMotivo, setMMotivo] = useState('')
  const [fechando, setFechando] = useState(false)
  const [contado, setContado] = useState<Record<string, string>>({})
  const [obs, setObs] = useState('')

  const carregar = useCallback(async () => {
    const { data: s } = await db.from('pdv_caixa_sessoes').select('*').eq('status', 'aberto').limit(1)
    const atual = (s?.[0] as Sessao) ?? null
    setSessao(atual)
    const rec = await db.from('pdv_caixa_sessoes').select('*').eq('status', 'fechado').order('fechado_em', { ascending: false }).limit(8)
    setRecentes((rec.data ?? []) as Sessao[])
    if (atual) {
      const [m, p, c] = await Promise.all([
        db.from('pdv_caixa_movs').select('*').eq('sessao_id', atual.id).order('criado_em'),
        db.from('pdv_pagamentos').select('forma,valor,troco').eq('sessao_id', atual.id).eq('estornado', false),
        db.from('pdv_comandas').select('id', { count: 'exact', head: true }).in('status', ['aberta', 'pedindo_conta']),
      ])
      setMovs((m.data ?? []) as Mov[])
      const acc: Record<string, number> = {}
      ;(p.data ?? []).forEach((x: { forma: string; valor: number; troco: number }) => (acc[x.forma] = (acc[x.forma] ?? 0) + num(x.valor) - num(x.troco)))
      setPorForma(acc)
      setComandasAbertas(c.count ?? 0)
    }
    setPronto(true)
  }, [])
  useAoVivo(['pdv_pagamentos', 'pdv_caixa_sessoes', 'pdv_caixa_movs'], carregar)

  const sangrias = movs.filter((m) => m.tipo === 'sangria').reduce((s, m) => s + num(m.valor), 0)
  const suprimentos = movs.filter((m) => m.tipo === 'suprimento').reduce((s, m) => s + num(m.valor), 0)
  const dinheiroEsperado = num(sessao?.fundo_inicial) + (porForma.dinheiro ?? 0) + suprimentos - sangrias
  const totalVendas = Object.values(porForma).reduce((s, v) => s + v, 0)

  async function abrir() {
    setErro('')
    const { error } = await db.from('pdv_caixa_sessoes').insert({
      caixa: 'Caixa 1', fundo_inicial: lerNumero(fundo) ?? 0, aberto_por: (await supabase.auth.getUser()).data.user?.id,
    })
    if (error) return setErro(error.code === '23505' ? 'Já existe um caixa aberto.' : error.message)
    setFundo('')
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
      caixa: sessao.caixa, aberto_em: sessao.aberto_em, fundo: sessao.fundo_inicial, sangrias, suprimentos, esperado, contado: cont,
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
        <Cabecalho titulo="Caixa" subtitulo="Caixa fechado" />
        {erro && <Erro texto={erro} />}
        <section className={`${cartaoCls} max-w-md space-y-3 p-5`}>
          <h2 className="font-semibold">Abertura de caixa</h2>
          <label className="block text-sm">Fundo de troco (R$)<input className={inputCls} inputMode="decimal" value={fundo} onChange={(e) => setFundo(e.target.value)} /></label>
          <button className={btnCls} onClick={abrir}>Abrir caixa</button>
        </section>
        {recentes.length > 0 && <Historico lista={recentes} />}
      </div>
    )

  return (
    <div>
      <Cabecalho
        titulo="Caixa"
        subtitulo={`${sessao.caixa} aberto desde ${hora(sessao.aberto_em)} · fundo ${reais(sessao.fundo_inicial)}`}
        acoes={<button className={btnPerigoCls} onClick={() => setFechando(true)}>Fechar caixa</button>}
      />
      {erro && <Erro texto={erro} />}
      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${cartaoCls} p-4`}>
          <h2 className="mb-2 font-semibold">Recebido por forma</h2>
          <ul className="divide-y divide-line text-sm">
            {FORMAS.map((f) => (
              <li key={f.v} className="flex justify-between py-2"><span>{f.r}</span><b>{reais(porForma[f.v] ?? 0)}</b></li>
            ))}
            <li className="flex justify-between py-2 text-base"><span>Total vendido</span><b>{reais(totalVendas)}</b></li>
          </ul>
        </section>
        <section className={`${cartaoCls} space-y-2 p-4`}>
          <h2 className="font-semibold">Dinheiro em gaveta</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Fundo</dt><dd>{reais(sessao.fundo_inicial)}</dd></div>
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
              <span>{new Date(s.aberto_em).toLocaleDateString('pt-BR')} {hora(s.aberto_em)} → {s.fechado_em ? hora(s.fechado_em) : ''}</span>
              <span>dinheiro contado {reais(s.contado?.dinheiro)}</span>
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
