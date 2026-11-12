import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, Vazio, btnCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { Comanda, Mesa, Sala, Totais, minutosDesde, num, useAoVivo } from '../../lib/pdv'
import { usePermissoes } from '../../context/PermissoesContext'
import { CheckinModal } from './CheckinRapido'

const COR: Record<string, string> = {
  livre: 'border-line bg-surface text-ink',
  aberta: 'border-brand bg-brand-soft text-ink',
  pedindo_conta: 'border-alert bg-alert-soft text-alert',
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
  const mesasSala = mesas.filter((m) => (m.sala_id ?? null) === sala || (!sala && !m.sala_id))
  const abertas = comandas.length
  const aberto = comandas.reduce((s, c) => s + num(totais[c.id]?.total), 0)

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
            <button className={btnCls} onClick={() => setNovaMesa({ id: '', numero: 'Balcão' } as Mesa)}>Check-in rápido</button>
            <button className={btnSecCls} onClick={() => nav('/pdv/comandas')}>Todas as comandas</button>
          </>
        }
      />
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); nav(`/pdv/comandas?q=${encodeURIComponent(busca)}`) }}>
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
      {!mesas.length ? (
        <Vazio texto={pode('pdv_gerir') ? 'Nenhuma mesa cadastrada. Monte o mapa em PDV · Configurações › Salão.' : 'Nenhuma mesa cadastrada.'} />
      ) : (
        <div className={`${cartaoCls} relative overflow-auto p-3`} style={{ minHeight: 420 }}>
          <div className="relative" style={{ minWidth: 640, height: Math.max(420, ...mesasSala.map((m) => m.pos_y + m.altura + 20)) }}>
            {mesasSala.map((m) => {
              const c = porMesa.get(m.id)
              const st = c ? c.status : 'livre'
              return (
                <button
                  key={m.id}
                  onClick={() => clicar(m)}
                  style={{ left: m.pos_x, top: m.pos_y, width: m.largura, height: m.altura }}
                  className={`absolute flex flex-col items-center justify-center border-2 text-center text-xs leading-tight transition-transform active:scale-95 ${m.forma === 'redonda' ? 'rounded-full' : 'rounded-xl'} ${COR[st]}`}
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
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-soft">
        <span>▢ livre</span><span className="text-brand">▣ ocupada</span><span className="text-alert">▣ pediu a conta</span>
      </div>
      {semMesa.length > 0 && (
        <section className="mt-6">
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
      {novaMesa && (
        <CheckinModal mesas={mesas.filter((m) => !porMesa.has(m.id))} mesaInicial={novaMesa.id ? novaMesa : null} onClose={() => setNovaMesa(null)} onAberta={(id) => nav(`/pdv/comanda/${id}`)} />
      )}
    </div>
  )
}
