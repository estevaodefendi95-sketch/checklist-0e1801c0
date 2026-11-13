import { useEffect, useMemo, useState } from 'react'
import { db, supabase } from '../../lib/supabase'
import { btnCls, btnSecCls, cartaoCls, chipCls, inputCls } from '../../components/Estado'
import type { Mesa, Sala } from '../../lib/pdv'
import { PerfisCheckin, usePerfisCobrancas } from './PerfisCheckin'

export const soDigitos = (s: string) => s.replace(/\D/g, '')
export function mascaraTel(s: string) {
  const d = soDigitos(s).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Check-in: nome e telefone obrigatórios, nascimento opcional. Reconhece o cliente pelo telefone. */
interface ResHoje { id: string; nome: string; telefone: string; pessoas: number; hora: string; mesa_id: string | null }

export function CheckinModal({ mesas, mesaInicial, nomeInicial, telInicial, onClose, onAberta }: {
  mesas: Mesa[]; mesaInicial: Mesa | null; nomeInicial?: string; telInicial?: string; onClose: () => void; onAberta: (comandaId: string) => void
}) {
  const { perfis, cobrancas, exige } = usePerfisCobrancas()
  const [mesaId, setMesaId] = useState(mesaInicial?.id ?? '')
  const [tel, setTel] = useState(mascaraTel(telInicial ?? ''))
  const [numero, setNumero] = useState('')
  const [nome, setNome] = useState(nomeInicial ?? '')
  const [nasc, setNasc] = useState('')
  const [qtds, setQtds] = useState<Record<string, number>>({})
  const [conhecido, setConhecido] = useState<{ visitas: number; ticket_medio: number; cashback_saldo: number } | null>(null)
  const [salas, setSalas] = useState<Sala[]>([])
  const [buscaMesa, setBuscaMesa] = useState('')
  const [salaF, setSalaF] = useState('')
  const [ocupadas, setOcupadas] = useState<Set<string>>(new Set())
  const [reservas, setReservas] = useState<ResHoje[]>([])
  const [reservaId, setReservaId] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { db.from('pdv_salas').select('*').eq('ativo', true).order('ordem').then(({ data }: { data: Sala[] | null }) => setSalas(data ?? [])) }, [])
  useEffect(() => {
    db.from('pdv_comandas').select('mesa_id').in('status', ['aberta', 'pedindo_conta']).not('mesa_id', 'is', null).then(({ data }: { data: { mesa_id: string }[] | null }) => setOcupadas(new Set((data ?? []).map((x) => x.mesa_id))))
    db.from('reservas').select('id,nome,telefone,pessoas,hora,mesa_id').eq('data', new Date().toLocaleDateString('sv-SE')).in('status', ['pendente', 'confirmada']).order('hora').then(({ data }: { data: ResHoje[] | null }) => setReservas(data ?? []))
  }, [])
  const resPorMesa = useMemo(() => new Map(reservas.filter((r) => r.mesa_id).map((r) => [r.mesa_id as string, r])), [reservas])
  function usarReserva(r: ResHoje) {
    if (reservaId === r.id) { setReservaId(''); return }
    setReservaId(r.id); setNome(r.nome); setTel(mascaraTel(r.telefone)); if (r.mesa_id && !ocupadas.has(r.mesa_id)) setMesaId(r.mesa_id)
  }
  function escolherMesa(m: Mesa) {
    const r = resPorMesa.get(m.id)
    if (r && r.id !== reservaId && !window.confirm(`Mesa ${m.numero} está reservada às ${r.hora.slice(0, 5)} para ${r.nome} (${r.pessoas}). Sentar este cliente mesmo assim?`)) return
    setMesaId(m.id)
  }
  const mesasVis = useMemo(() => mesas.filter((m) => (!salaF || m.sala_id === salaF) && (!buscaMesa.trim() || m.numero.toLowerCase().includes(buscaMesa.trim().toLowerCase()))), [mesas, salaF, buscaMesa])

  // reconhece cliente já cadastrado pelo telefone
  useEffect(() => {
    const d = soDigitos(tel)
    if (d.length < 10) return setConhecido(null)
    let vivo = true
    db.from('v_clientes_resumo').select('nome,nascimento,visitas,ticket_medio,cashback_saldo').eq('telefone', d.length > 11 ? d.slice(-11) : d).maybeSingle().then(({ data }: { data: { nome: string; nascimento: string | null; visitas: number; ticket_medio: number; cashback_saldo: number } | null }) => {
      if (!vivo) return
      if (data) { setNome((n) => n || data.nome); setNasc((x) => x || data.nascimento || ''); setConhecido(data) } else setConhecido(null)
    })
    return () => { vivo = false }
  }, [tel])

  async function abrir() {
    setErro('')
    const nc = Math.floor(Number(numero))
    if (!nc || nc < 1) return setErro('Informe o número da comanda.')
    if (!nome.trim()) return setErro('Informe o nome do cliente.')
    if (soDigitos(tel).length < 10) return setErro('Informe o telefone com DDD.')
    const pessoas = Object.values(qtds).reduce((a, n) => a + n, 0)
    if (perfis.length && exige && pessoas === 0) return setErro('Informe quantas pessoas de cada perfil (adulto, criança…).')
    const mSel = mesas.find((m) => m.id === mesaId)
    if (mSel && pessoas > mSel.capacidade && !window.confirm(`A mesa ${mSel.numero} tem ${mSel.capacidade} lugares e o grupo tem ${pessoas} pessoas. Abrir mesmo assim?`)) return
    setSalvando(true)
    const cli = await db.rpc('pdv_cliente_garantir', { p_nome: nome, p_telefone: tel, p_nascimento: nasc || null })
    if (cli.error) { setSalvando(false); return setErro(cli.error.message) }
    const { data, error } = await db.from('pdv_comandas').insert({
      numero: nc, mesa_id: mesaId || null, pessoas: pessoas || 1, nome_cliente: nome.trim(), telefone: soDigitos(tel), cliente_id: cli.data, origem: 'sistema',
      aberta_por: (await supabase.auth.getUser()).data.user?.id,
      taxa_servico_pct: (await db.from('pdv_config').select('taxa_servico_pct').single()).data?.taxa_servico_pct ?? 10,
    }).select('id').single()
    if (error) { setSalvando(false); return setErro(error.code === '23505' ? (error.message.includes('numero') ? `A comanda nº ${nc} já está em uso. Use outro número.` : 'Essa mesa já tem comanda aberta.') : error.message) }
    if (pessoas > 0) {
      const r = await db.rpc('pdv_aplicar_perfis', { p_comanda: data.id, p_perfis: Object.entries(qtds).map(([perfil_id, qtd]) => ({ perfil_id, qtd })) })
      if (r.error) setErro('Comanda aberta, mas não consegui lançar couvert/rodízio: ' + r.error.message)
    }
    if (reservaId) await db.from('reservas').update({ status: 'sentada', comanda_id: data.id, mesa_id: mesaId || null, atualizado_em: new Date().toISOString() }).eq('id', reservaId)
    onAberta(data.id)
  }

  const campo = 'block text-xs font-medium text-ink-soft'
  const secao = 'space-y-2.5 rounded-2xl border border-line p-3.5'
  const mesaSel = mesas.find((m) => m.id === mesaId)
  const pessoasTot = Object.values(qtds).reduce((a, n) => a + n, 0)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className={`${cartaoCls} flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-b-none sm:rounded-b-[14px]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
          <h3 className="text-lg font-semibold">Check-in</h3>
          <button className="min-h-[40px] px-2 text-ink-soft" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="grid flex-1 items-start gap-3 overflow-y-auto p-4 md:grid-cols-2">
          <div className="space-y-3">
            <section className={secao}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Cliente</h4>
              {reservas.length > 0 && (
                <div>
                  <div className="mb-1 text-xs text-ink-soft">Veio por reserva hoje?</div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {reservas.map((r) => <button type="button" key={r.id} className={chipCls(reservaId === r.id) + ' !min-h-[34px] !px-3 text-xs'} onClick={() => usarReserva(r)}>{r.hora.slice(0, 5)} · {r.nome.split(' ')[0]} ({r.pessoas})</button>)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-[92px_1fr] gap-2">
                <label className={campo}>Comanda *<input className={inputCls + ' !min-h-[46px] text-center !text-lg font-bold'} inputMode="numeric" placeholder="Nº" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus /></label>
                <label className={campo}>Nome *<input className={inputCls + ' !min-h-[46px]'} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={campo}>Telefone (WhatsApp) *<input className={inputCls + ' !min-h-[46px]'} inputMode="tel" placeholder="(16) 99999-9999" value={tel} onChange={(e) => setTel(mascaraTel(e.target.value))} /></label>
                <label className={campo}>Nascimento (opc.)<input type="date" className={inputCls + ' !min-h-[46px]'} value={nasc} onChange={(e) => setNasc(e.target.value)} /></label>
              </div>
              {conhecido && (
                <p className="rounded-lg bg-brand-soft px-3 py-1.5 text-xs text-ink">
                  Cliente conhecido · {conhecido.visitas} visita(s){conhecido.visitas > 0 ? ` · ticket médio R$ ${Number(conhecido.ticket_medio).toFixed(2).replace('.', ',')}` : ''}{Number(conhecido.cashback_saldo) > 0 ? ` · cashback R$ ${Number(conhecido.cashback_saldo).toFixed(2).replace('.', ',')}` : ''}
                </p>
              )}
            </section>
            <section className={secao}><PerfisCheckin perfis={perfis} cobrancas={cobrancas} qtds={qtds} onChange={setQtds} /></section>
          </div>
          <section className={secao}>
            <div className="flex items-center justify-between text-sm font-medium"><span>Mesa</span><span className="text-xs font-normal text-ink-soft">{mesaSel ? `Mesa ${mesaSel.numero} · ${mesaSel.capacidade} lugares${pessoasTot > mesaSel.capacidade ? ' · grupo maior que a mesa' : ''}` : 'sem mesa (balcão / fila)'}</span></div>
            <input className={inputCls + ' !min-h-[42px]'} inputMode="search" placeholder="Buscar mesa pelo número…" value={buscaMesa} onChange={(e) => setBuscaMesa(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && mesasVis.length === 1 && !ocupadas.has(mesasVis[0].id)) { escolherMesa(mesasVis[0]); e.preventDefault() } }} />
            {salas.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto">
                <button type="button" className={chipCls(!salaF)} onClick={() => setSalaF('')}>Todas</button>
                {salas.map((s) => <button type="button" key={s.id} className={chipCls(salaF === s.id)} onClick={() => setSalaF(s.id)}>{s.nome}</button>)}
              </div>
            )}
            <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
              <button type="button" onClick={() => setMesaId('')} className={`min-h-[56px] rounded-xl border-2 px-1 text-xs font-medium leading-tight ${!mesaId ? 'border-brand bg-brand-soft text-brand' : 'border-line'}`}>Sem mesa</button>
              {mesasVis.map((m) => {
                const oc = ocupadas.has(m.id); const rv = resPorMesa.get(m.id)
                const cls = mesaId === m.id ? 'border-brand bg-brand-soft text-brand' : oc ? 'border-alert/60 bg-alert-soft text-alert' : rv ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-line'
                return (
                  <button type="button" key={m.id} disabled={oc} onClick={() => escolherMesa(m)} className={`min-h-[56px] rounded-xl border-2 px-1 leading-tight ${cls} ${oc ? 'cursor-not-allowed' : ''}`}>
                    <b className="block text-base">{m.numero}</b>
                    <span className="text-[10px]">{oc ? 'ocupada' : rv ? `reserva ${rv.hora.slice(0, 5)}` : `${m.capacidade} lug.`}</span>
                  </button>
                )
              })}
            </div>
            {!mesasVis.length && <p className="text-xs text-ink-soft">Nenhuma mesa com esse filtro.</p>}
            <div className="flex flex-wrap gap-3 text-[11px] text-ink-soft">
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-line align-middle" />livre</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-amber-400 bg-amber-50 align-middle" />reservada hoje</span>
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-alert/60 bg-alert-soft align-middle" />ocupada</span>
            </div>
          </section>
        </div>
        <div className="space-y-2 border-t border-line bg-surface p-3">
          {erro && <p className="rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">{erro}</p>}
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex sm:justify-end">
            <button className={btnCls + ' sm:min-w-[220px]'} disabled={salvando} onClick={abrir}>Abrir comanda</button>
            <button className={btnSecCls} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
