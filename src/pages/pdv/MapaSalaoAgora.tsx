import { useCallback, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, Erro, cartaoCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { Comanda, Mesa, Sala, Totais, minutosDesde, num, useAoVivo } from '../../lib/pdv'
import { agruparPorMesa, statusMesa, totalMesa } from './ComandasDaMesa'

const COR: Record<string, string> = {
  livre: 'border-line bg-surface text-ink-soft',
  aberta: 'border-ok/70 bg-ok-soft text-ink',
  pedindo_conta: 'border-alert bg-alert-soft text-ink',
}
const tempo = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`)

function Num({ rotulo, valor, tom }: { rotulo: string; valor: number | string; tom?: 'ok' | 'alerta' }) {
  return (
    <div className={`${cartaoCls} p-3 sm:p-4`}>
      <p className="apoio !text-[11px] leading-tight sm:!text-sm">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums sm:text-3xl ${tom === 'ok' ? 'text-ok' : tom === 'alerta' ? 'text-alert' : 'text-ink'}`}>{valor}</p>
    </div>
  )
}

/** Mapa do salão agora (somente consulta): cada mesa livre, ocupada ou pedindo a conta, com tempo e valor. */
export function MapaSalaoAgora() {
  const [salas, setSalas] = useState<Sala[]>([])
  const [mesas, setMesas] = useState<Mesa[]>([])
  const [comandas, setComandas] = useState<Comanda[]>([])
  const [totais, setTotais] = useState<Record<string, Totais>>({})
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)

  const carregar = useCallback(async () => {
    const [s, m, c, t] = await Promise.all([
      db.from('pdv_salas').select('*').eq('ativo', true).order('ordem'),
      db.from('pdv_mesas').select('*').eq('ativo', true),
      db.from('pdv_comandas').select('*').in('status', ['aberta', 'pedindo_conta']).order('aberta_em'),
      db.from('pdv_comanda_totais').select('*'),
    ])
    const e = s.error || m.error || c.error || t.error
    setErro(e ? e.message : '')
    setSalas((s.data ?? []) as Sala[])
    setMesas(((m.data ?? []) as Mesa[]).sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true })))
    setComandas((c.data ?? []) as Comanda[])
    setTotais(Object.fromEntries(((t.data ?? []) as Totais[]).map((x) => [x.comanda_id, x])))
    setPronto(true)
  }, [])
  useAoVivo(['pdv_comandas', 'pdv_mesas', 'pdv_pedido_itens'], carregar, 20000)

  const porMesa = useMemo(() => agruparPorMesa(comandas), [comandas])
  const semMesa = comandas.filter((c) => !c.mesa_id)
  const ocupadas = mesas.filter((m) => porMesa.has(m.id)).length
  const pedindo = comandas.filter((c) => c.status === 'pedindo_conta').length
  const pessoas = comandas.reduce((s, c) => s + num(c.pessoas), 0)
  const grupos = salas.length ? salas : [{ id: '', nome: 'Salão', ordem: 0, ativo: true } as Sala]

  if (!pronto) return <Carregando />
  return (
    <div>
      {erro && <Erro texto={erro} />}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Num rotulo="Mesas ocupadas" valor={`${ocupadas}/${mesas.length}`} />
        <Num rotulo="Mesas livres" valor={mesas.length - ocupadas} tom="ok" />
        <Num rotulo="Pedindo conta" valor={pedindo} tom={pedindo ? 'alerta' : undefined} />
        <Num rotulo="Pessoas" valor={pessoas} />
      </div>

      {grupos.map((sala) => {
        const doSala = mesas.filter((m) => (sala.id ? m.sala_id === sala.id : true))
        if (!doSala.length) return null
        return (
          <section key={sala.id || 'unico'} className="mb-5">
            {grupos.length > 1 && <h2 className="subtitulo mb-2">{sala.nome}</h2>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
              {doSala.map((m) => {
                const l = porMesa.get(m.id)
                const st = l ? statusMesa(l) : 'livre'
                return (
                  <div key={m.id} className={`rounded-xl border-2 p-2.5 text-center ${COR[st]}`} aria-label={`Mesa ${m.numero}: ${l ? (st === 'pedindo_conta' ? 'pedindo a conta' : 'ocupada') : 'livre'}`}>
                    <p className="text-lg font-bold leading-tight">{m.numero}</p>
                    {l ? (
                      <>
                        {l.length > 1 ? (
                          <>
                            <p className="truncate text-xs font-medium">{l.slice(0, 2).map((c) => (c.nome_cliente || `#${c.numero}`).split(' ')[0]).join(' · ')}{l.length > 2 ? ` +${l.length - 2}` : ''}</p>
                            <p className="text-[10px] font-semibold uppercase opacity-80">{l.length} comandas</p>
                          </>
                        ) : <p className="truncate text-xs font-medium">{l[0].nome_cliente || `Comanda ${l[0].numero}`}</p>}
                        <p className="text-[11px] opacity-80">{tempo(minutosDesde(l[0].aberta_em))} · {reais(totalMesa(l, totais))}</p>
                        {st === 'pedindo_conta' && <p className="text-[11px] font-semibold">pediu a conta</p>}
                      </>
                    ) : <p className="text-[11px]">livre</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {semMesa.length > 0 && (
        <section className="mb-5">
          <h2 className="subtitulo mb-2">Balcão / sem mesa ({semMesa.length})</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {semMesa.map((c) => (
              <div key={c.id} className={`rounded-xl border-2 p-2.5 text-center ${COR[c.status] ?? COR.aberta}`}>
                <p className="truncate text-sm font-bold">{c.nome_cliente || `Comanda ${c.numero}`}</p>
                <p className="text-[11px] opacity-80">{tempo(minutosDesde(c.aberta_em))} · {reais(totais[c.id]?.total)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
