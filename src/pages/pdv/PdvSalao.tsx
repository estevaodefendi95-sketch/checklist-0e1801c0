import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { Comanda, Mesa, Sala, TAM_FORMA, Totais, dimMesa, minutosDesde, num, useAoVivo } from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'
import { CheckinModal } from './CheckinRapido'

const COR: Record<string, string> = {
  livre: 'border-line bg-surface text-ink',
  aberta: 'border-emerald-500 bg-emerald-100 text-emerald-900',
  pedindo_conta: 'border-red-500 bg-red-100 text-red-800',
}

export function PdvSalao() {
  const nav = useNavigate()
  const { pode } = usePermissoes()
  const [salas, setSalas] = useState<Sala[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [comandas, setComandas] = useState<Comanda[]>([])
  const [totais, setTotais] = useState<Record<string, Totais>>({})
  const [salaId, setSalaId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)
  const [novaMesa, setNovaMesa] = useState<Mesa | null>(null)
  const [busca, setBusca] = useState('')
  const [visao, setVisao] = useState<'lista' | 'mapa'>(() => { try { return (localStorage.getItem('salao_visao') as 'lista' | 'mapa') || (window.innerWidth < 768 ? 'lista' : 'mapa') } catch { return 'mapa' } })
  const trocarVisao = (v: 'lista' | 'mapa') => { setVisao(v); try { localStorage.setItem('salao_visao', v) } catch { /* sem armazenamento */ } }
  const [editando, setEditando] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const drag = useRef<{ id: string; dx: number; dy: number; moveu: boolean } | null>(null)
  const area = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    const [s, m, c, t] = await Promise.all([
      db.from('pdv_salas').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_mesas').select('*').eq('ativo', true).order('numero'),
      db.from('pdv_comandas').select('*').in('status', ['aberta', 'pedindo_conta']).order('aberta_em'),
      db.from('pdv_comanda_totais').select('*'),
    ])
    const e = s.error || m.error || c.error || t.error
    if (e) setErro(e.message)
    setSalas((s.data ?? []) as Sala[])
    setMesas((m.data ?? []) as Mesa[])
    setComandas((c.data ?? []) as Comanda[])
    setTotais(Object.fromEntries(((t.data ?? []) as Totais[]).map((x) => [x.comanda_id, x])))
    setPronto(true)
  }, [])
  useAoVivo(['pdv_comandas', 'pdv_pedido_itens', 'pdv_mesas'], carregar)

  const porMesa = useMemo(() => new Map(comandas.filter((c) => c.mesa_id).map((c) => [c.mesa_id!, c])), [comandas])
  const semMesa = comandas.filter((c) => !c.mesa_id)
  const sala = salaId ?? salas[0]?.id ?? null
  // no celular o mapa encolhe para caber na largura da tela (sem rolar para o lado); na edição fica em tamanho real
  const caixa = useRef<HTMLDivElement>(null)
  const [larguraCaixa, setLarguraCaixa] = useState(0)
  useEffect(() => {
    const f = () => setLarguraCaixa(caixa.current?.clientWidth ?? 0)
    f(); window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [mesas.length])
  const mesasSala = mesas.filter((m) => (m.sala_id ?? null) === sala || (!sala && !m.sala_id))
  const conteudoW = Math.max(320, ...mesasSala.map((m) => m.pos_x + dimMesa(m).w + 20))
  const alturaMapa = Math.max(300, ...mesasSala.map((m) => m.pos_y + dimMesa(m).h + 20))
  const escala = editando || !larguraCaixa ? 1 : Math.max(0.55, Math.min(1, (larguraCaixa - 24) / conteudoW))
  const abertas = comandas.length
  const aberto = comandas.reduce((s, c) => s + num(totais[c.id]?.total), 0)

  async function upd(m: Mesa, p: Partial<Mesa>) {
    setMesas((x) => x.map((k) => (k.id === m.id ? { ...k, ...p } : k)))
    const { error } = await db.from('pdv_mesas').update(p).eq('id', m.id)
    if (error) { setErro(error.code === '23505' ? 'Já existe uma mesa com esse número.' : error.message); carregar() } else setErro('')
  }
  async function novaMesaEd() {
    if (!sala) return setErro('Crie uma sala em Configurações do PDV primeiro.')
    const n = Math.max(0, ...mesas.map((m) => parseInt(m.numero, 10) || 0)) + 1
    const doSala = mesas.filter((m) => m.sala_id === sala)
    const { data, error } = await db.from('pdv_mesas').insert({ sala_id: sala, numero: String(n), capacidade: 4, pos_x: 20 + (doSala.length % 6) * 120, pos_y: 20 + Math.floor(doSala.length / 6) * 120 }).select('id').single()
    if (error) return setErro(error.message)
    setSelId(data.id); carregar()
  }
  async function espacar(f: number) {
    const lista = mesas.filter((m) => m.sala_id === sala)
    const novas = lista.map((m) => ({ id: m.id, pos_x: Math.max(0, Math.round((m.pos_x * f) / 10) * 10), pos_y: Math.max(0, Math.round((m.pos_y * f) / 10) * 10) }))
    setMesas((ms) => ms.map((m) => novas.find((n) => n.id === m.id) ? { ...m, ...novas.find((n) => n.id === m.id)! } : m))
    await Promise.all(novas.map((n) => db.from('pdv_mesas').update({ pos_x: n.pos_x, pos_y: n.pos_y }).eq('id', n.id)))
  }
  async function removerMesa(m: Mesa) {
    if (porMesa.has(m.id)) return setErro('Esta mesa tem comanda aberta.')
    if (!window.confirm(`Remover a mesa ${m.numero}? Se ela tiver histórico, será apenas desativada.`)) return
    const r = await db.from('pdv_mesas').delete().eq('id', m.id)
    if (r.error) await db.from('pdv_mesas').update({ ativo: false }).eq('id', m.id)
    setSelId(null); carregar()
  }
  function mover(e: React.PointerEvent) {
    const d = drag.current; if (!d || !area.current) return
    const r = area.current.getBoundingClientRect()
    d.moveu = true
    const x = Math.max(0, Math.round((e.clientX - r.left - d.dx) / 10) * 10)
    const y = Math.max(0, Math.round((e.clientY - r.top - d.dy) / 10) * 10)
    setMesas((ms) => ms.map((m) => (m.id === d.id ? { ...m, pos_x: x, pos_y: y } : m)))
  }
  async function soltar() {
    const d = drag.current; drag.current = null
    const m = mesas.find((k) => k.id === d?.id)
    if (m && d?.moveu) await db.from('pdv_mesas').update({ pos_x: m.pos_x, pos_y: m.pos_y }).eq('id', m.id)
  }
  function clicar(m: Mesa) {
    const c = porMesa.get(m.id)
    if (c) nav(`/pdv/comanda/${c.id}`)
    else {
      setNovaMesa(m)
    }
  }

  if (!pronto) return <Carregando />
  return (
    <div>
      <Cabecalho
        titulo="Salão"
        subtitulo={`${abertas} comanda(s) aberta(s) · ${reais(aberto)} em consumo`}
        acoes={
          <>
            <button className={(editando ? btnCls : btnSecCls) + (editando ? '' : ' hidden md:inline-flex')} onClick={() => { setEditando((v) => !v); setSelId(null); trocarVisao('mapa') }}>{editando ? 'Concluir edição' : 'Editar mesas'}</button>
            {editando && <button className={btnSecCls} onClick={() => espacar(1.2)}>Espaçar</button>}
            {editando && <button className={btnSecCls} onClick={() => espacar(1 / 1.2)}>Aproximar</button>}
            {!editando && <button className={btnCls + ' hidden md:inline-flex'} onClick={() => setNovaMesa({ id: '', numero: 'Balcão' } as Mesa)}>Check-in rápido</button>}
            {!editando && <button className={btnSecCls + ' hidden md:inline-flex'} onClick={() => nav('/pdv/comandas')}>Todas as comandas</button>}
          </>
        }
      />
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); nav(`/pdv/comandas?q=${encodeURIComponent(busca)}`) }}>
        <input className={inputCls} placeholder="Buscar comanda por nº, nome, telefone ou mesa…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <button className={btnSecCls}>Buscar</button>
      </form>
      {erro && <Erro texto={erro} />}
      {salas.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {salas.map((s) => (
            <button key={s.id} onClick={() => setSalaId(s.id)} className={s.id === sala ? btnCls : btnSecCls}>{s.nome}</button>
          ))}
        </div>
      )}
      {!editando && (
        <div className="mb-3 inline-flex gap-1 rounded-xl border border-line bg-surface p-1 md:hidden" role="tablist">
          {(['lista', 'mapa'] as const).map((v) => <button key={v} role="tab" aria-selected={visao === v} onClick={() => trocarVisao(v)} className={`min-h-[40px] rounded-lg px-5 text-sm ${visao === v ? 'bg-brand-soft font-semibold text-brand' : 'text-ink-soft'}`}>{v === 'lista' ? 'Comandas' : 'Mapa'}</button>)}
        </div>
      )}
      {!editando && visao === 'lista' && (
        <div className="md:hidden">
          {(() => {
            const ord = [...comandas].sort((a, b) => Number(b.status === 'pedindo_conta') - Number(a.status === 'pedindo_conta') || a.aberta_em.localeCompare(b.aberta_em))
            const livres = mesasSala.filter((m) => !porMesa.has(m.id))
            return (
              <>
                {!ord.length ? <p className="mb-4 rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-soft">Nenhuma comanda aberta. Toque em uma mesa livre ou em "+ Check-in".</p> : (
                  <ul className="mb-4 space-y-2">
                    {ord.map((c) => {
                      const m = mesas.find((x) => x.id === c.mesa_id)
                      const conta = c.status === 'pedindo_conta'
                      return (
                        <li key={c.id}>
                          <button onClick={() => nav(`/pdv/comanda/${c.id}`)} className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left active:scale-[0.99] ${conta ? 'border-red-500 bg-red-100 text-red-900' : 'border-emerald-500 bg-emerald-50 text-emerald-950'}`}>
                            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/70 text-center leading-none"><small className="text-[10px] uppercase opacity-70">{m ? 'mesa' : 'balcão'}</small><b className="text-xl">{m?.numero ?? '·'}</b></span>
                            <span className="min-w-0 flex-1"><b className="block truncate">#{c.numero} · {c.nome_cliente ?? 'Sem nome'}</b><span className="text-xs opacity-80">{c.pessoas} pess. · {minutosDesde(c.aberta_em)} min{conta ? ' · CONTA PEDIDA' : ''}</span></span>
                            <b className="shrink-0">{reais(num(totais[c.id]?.total))}</b>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {livres.length > 0 && (
                  <>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Mesas livres</h2>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {livres.map((m) => <button key={m.id} onClick={() => setNovaMesa(m)} className="min-h-[48px] min-w-[56px] rounded-xl border border-line bg-surface px-3 text-base font-semibold">{m.numero}</button>)}
                    </div>
                  </>
                )}
              </>
            )
          })()}
        </div>
      )}
      {editando && (
        <section className={`${cartaoCls} mb-3 space-y-3 p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-soft">Arraste as mesas para mudar a disposição. Toque numa mesa para ajustar número, lugares e formato.</p>
            <button className={btnSecCls} onClick={novaMesaEd}>+ Nova mesa nesta sala</button>
          </div>
          {(() => { const m = mesas.find((x) => x.id === selId); if (!m) return null; return (
            <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
              <label className="text-xs text-ink-soft">Número<input className={inputCls + ' !w-24'} defaultValue={m.numero} key={m.id + m.numero} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== m.numero) upd(m, { numero: v }) }} /></label>
              <div className="text-xs text-ink-soft">Lugares
                <div className="mt-1 flex items-center gap-2">
                  <button className="h-11 w-11 rounded-lg border border-line text-xl" onClick={() => upd(m, { capacidade: Math.max(1, m.capacidade - 1) })}>−</button>
                  <b className="w-8 text-center text-lg text-ink">{m.capacidade}</b>
                  <button className="h-11 w-11 rounded-lg bg-brand text-xl text-brand-ink" onClick={() => upd(m, { capacidade: m.capacidade + 1 })}>+</button>
                </div>
              </div>
              <div className="text-xs text-ink-soft">Formato
                <div className="mt-1 flex gap-1.5">
                  {(['quadrada', 'redonda', 'retangular'] as const).map((f) => <button key={f} className={`min-h-[44px] rounded-lg border px-3 text-sm ${m.forma === f ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-soft'}`} onClick={() => upd(m, { forma: f, largura: TAM_FORMA[f].w, altura: TAM_FORMA[f].h })}>{f}</button>)}
                </div>
              </div>
              {salas.length > 1 && <label className="text-xs text-ink-soft">Sala<select className={inputCls + ' !w-36'} value={m.sala_id ?? ''} onChange={(e) => upd(m, { sala_id: e.target.value || null, pos_x: 20, pos_y: 20 })}>{salas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>}
              <button className={btnSecCls + ' !text-alert'} onClick={() => removerMesa(m)}>Excluir mesa</button>
            </div>) })()}
        </section>
      )}
      {!mesas.length ? (
        <Vazio texto={pode('pdv_gerir') ? 'Nenhuma mesa cadastrada. Monte o mapa em PDV · Configurações › Salão.' : 'Nenhuma mesa cadastrada.'} />
      ) : (
        <div ref={caixa} className={`${cartaoCls} relative overflow-auto p-3 ${!editando && visao === 'lista' ? 'hidden md:block' : ''}`}>
          <div style={{ width: editando ? undefined : Math.max(0, conteudoW * escala), height: editando ? undefined : alturaMapa * escala }}>
          <div ref={area} className="relative touch-none select-none" onPointerMove={editando ? mover : undefined} onPointerUp={editando ? soltar : undefined} style={{ minWidth: editando ? 640 : undefined, width: editando ? undefined : conteudoW, height: alturaMapa, transform: escala < 1 ? `scale(${escala})` : undefined, transformOrigin: 'top left' }}>
            {mesasSala.map((m) => {
              const c = porMesa.get(m.id)
              const st = c ? c.status : 'livre'
              return (
                <button
                  key={m.id}
                  onClick={() => (editando ? setSelId(m.id) : clicar(m))}
                  onPointerDown={editando ? (e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); drag.current = { id: m.id, dx: e.clientX - r.left, dy: e.clientY - r.top, moveu: false }; setSelId(m.id) } : undefined}
                  style={{ left: m.pos_x, top: m.pos_y, width: dimMesa(m).w, height: dimMesa(m).h }}
                  className={`absolute flex flex-col items-center justify-center border-2 text-center text-xs leading-tight transition-transform active:scale-95 ${m.forma === 'redonda' ? 'rounded-full' : 'rounded-xl'} ${COR[st]} ${editando && selId === m.id ? 'ring-2 ring-brand' : ''} ${editando ? 'cursor-move border-dashed' : ''}`}
                >
                  <b className="text-base">{m.numero}</b>
                  {c ? (
                    <>
                      <span>{reais(num(totais[c.id]?.total))}</span>
                      <span className="opacity-70">{minutosDesde(c.aberta_em)} min</span>
                    </>
                  ) : (
                    <span className="opacity-60">{m.capacidade} lug.</span>
                  )}
                </button>
              )
            })}
          </div>
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-soft">
        <span>▢ livre</span><span className="text-emerald-700">▣ conta aberta</span><span className="text-red-700">▣ conta fechada (aguardando pagamento)</span>
      </div>
      {semMesa.length > 0 && (
        <section className={`mt-6 ${visao === 'lista' ? 'hidden md:block' : ''}`}>
          <h2 className="mb-2 text-sm font-semibold">Comandas sem mesa</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {semMesa.map((c) => (
              <button key={c.id} onClick={() => nav(`/pdv/comanda/${c.id}`)} className={`${cartaoCls} p-3 text-left`}>
                <b>#{c.numero} {c.nome_cliente ?? 'Balcão'}</b>
                <div className="text-sm text-ink-soft">{reais(num(totais[c.id]?.total))} · {minutosDesde(c.aberta_em)} min</div>
              </button>
            ))}
          </div>
        </section>
      )}
      {!editando && (
        <button onClick={() => setNovaMesa({ id: '', numero: 'Balcão' } as Mesa)} className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-4 z-20 flex min-h-[52px] items-center gap-2 rounded-full bg-brand px-5 text-base font-semibold text-brand-ink shadow-xl md:hidden">+ Check-in</button>
      )}
      {novaMesa && (
        <CheckinModal mesas={mesas} mesaInicial={novaMesa.id ? novaMesa : null} onClose={() => setNovaMesa(null)} onAberta={(id) => nav(`/pdv/comanda/${id}`)} />
      )}
    </div>
  )
}
