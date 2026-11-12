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
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { db.from('pdv_salas').select('*').eq('ativo', true).order('ordem').then(({ data }: { data: Sala[] | null }) => setSalas(data ?? [])) }, [])
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
    onAberta(data.id)
  }

  const campo = 'block text-sm font-medium'
  const secao = 'space-y-3 rounded-2xl border border-line p-4'
  const mesaSel = mesas.find((m) => m.id === mesaId)
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className={`${cartaoCls} flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-b-none sm:rounded-b-[14px]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-lg font-semibold">Check-in</h3>
          <button className="min-h-[40px] px-2 text-ink-soft" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="grid flex-1 items-start gap-4 overflow-y-auto p-5 md:grid-cols-2">
          <div className="space-y-4">
            <section className={secao}>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Comanda e mesa</h4>
              <label className={campo}>Nº da comanda *
                <input className={inputCls + ' !min-h-[56px] text-center !text-2xl font-bold'} inputMode="numeric" placeholder="Ex.: 27" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
              </label>
              <div>
                <div className="mb-1 flex items-center justify-between text-sm font-medium"><span>Mesa</span><span className="text-xs font-normal text-ink-soft">{mesaSel ? `Mesa ${mesaSel.numero} selecionada` : 'sem mesa (balcão / fila)'}</span></div>
                <input className={inputCls + ' mb-2'} inputMode="search" placeholder="Buscar mesa pelo número…" value={buscaMesa} onChange={(e) => setBuscaMesa(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && mesasVis.length === 1) { setMesaId(mesasVis[0].id); e.preventDefault() } }} />
                {salas.length > 1 && (
                  <div className="mb-2 flex gap-1.5 overflow-x-auto">
                    <button type="button" className={chipCls(!salaF)} onClick={() => setSalaF('')}>Todas</button>
                    {salas.map((s) => <button type="button" key={s.id} className={chipCls(salaF === s.id)} onClick={() => setSalaF(s.id)}>{s.nome}</button>)}
                  </div>
                )}
                <div className="grid max-h-44 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
                  <button type="button" onClick={() => setMesaId('')} className={`min-h-[52px] rounded-xl border-2 px-1 text-xs font-medium leading-tight ${!mesaId ? 'border-brand bg-brand-soft text-brand' : 'border-line'}`}>Sem mesa</button>
                  {mesasVis.map((m) => (
                    <button type="button" key={m.id} onClick={() => setMesaId(m.id)} className={`min-h-[52px] rounded-xl border-2 px-1 leading-tight ${mesaId === m.id ? 'border-brand bg-brand-soft text-brand' : 'border-line'}`}>
                      <b className="block text-base">{m.numero}</b><span className="text-[10px] text-ink-soft">{m.capacidade} lug.</span>
                    </button>
                  ))}
                </div>
                {!mesasVis.length && <p className="mt-1 text-xs text-ink-soft">Nenhuma mesa livre com esse filtro.</p>}
              </div>
            </section>
            <section className={secao}>
              <h4 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Cliente</h4>
              <label className={campo}>Telefone (WhatsApp) *<input className={inputCls} inputMode="tel" placeholder="(16) 99999-9999" value={tel} onChange={(e) => setTel(mascaraTel(e.target.value))} /></label>
              {conhecido && (
                <p className="rounded-lg bg-brand-soft px-3 py-2 text-xs text-ink">
                  Cliente conhecido · {conhecido.visitas} visita(s){conhecido.visitas > 0 ? ` · ticket médio R$ ${Number(conhecido.ticket_medio).toFixed(2).replace('.', ',')}` : ''}{Number(conhecido.cashback_saldo) > 0 ? ` · cashback R$ ${Number(conhecido.cashback_saldo).toFixed(2).replace('.', ',')}` : ''}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <label className={campo}>Nome *<input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} /></label>
                <label className={campo}>Nascimento <span className="font-normal text-ink-soft">(opc.)</span><input type="date" className={inputCls} value={nasc} onChange={(e) => setNasc(e.target.value)} /></label>
              </div>
            </section>
          </div>
          <section className={secao}><PerfisCheckin perfis={perfis} cobrancas={cobrancas} qtds={qtds} onChange={setQtds} /></section>
        </div>
        <div className="space-y-2 border-t border-line bg-surface p-4">
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
