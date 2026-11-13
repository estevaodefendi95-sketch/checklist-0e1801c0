import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../lib/supabase'
import { Cabecalho } from '../../components/Cabecalho'
import { Carregando, Erro, btnCls, cartaoCls } from '../../components/Estado'
import { reais } from '../../lib/formato'
import { Comanda, Mesa, Sala, Totais, minutosDesde, num, useAoVivo } from '../../lib/pdv'

const COR: Record<string, string> = {
  livre: 'border-line bg-surface text-ink-soft',
  aberta: 'border-emerald-500 bg-emerald-100 text-emerald-900',
  pedindo_conta: 'border-red-500 bg-red-100 text-red-800',
}
const tempo = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`)

function Num({ rotulo, valor, tom }: { rotulo: string; valor: number | string; tom?: 'ok' | 'alerta' }) {
  return (
    <div className={`${cartaoCls} p-4`}>
      <p className="apoio">{rotulo}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${tom === 'ok' ? 'text-ok' : tom === 'alerta' ? 'text-alert' : 'text-ink'}`}>{valor}</p>
    </div>
  )
}

/** Tela inicial: como está o salão agora. Só consulta (nada aqui edita). Para operar, o garçom vai ao Salão e informa o PIN. */
export function DashboardSalao() {
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

  const porMesa = useMemo(() => new Map(comandas.filter((c) => c.mesa_id).map((c) => [c.mesa_id!, c])), [comandas])
  const semMesa = comandas.filter((c) => !c.mesa_id)
  const ocupadas = mesas.filter((m) => porMesa.has(m.id)).length
  const pedindo = comandas.filter((c) => c.status === 'pedindo_conta').length
  const pessoas = comandas.reduce((s, c) => s + num(c.pessoas), 0)
  const consumo = comandas.reduce((s, c) => s + num(totais[c.id]?.total), 0)
  const grupos = salas.length ? salas : [{ id: '', nome: 'Salão', ordem: 0, ativo: true } as Sala]

  if (!pronto) return <Carregando />
  return (
    <div>
      <Cabecalho
        titulo="Salão agora"
        subtitulo={`${comandas.length} comanda(s) aberta(s) · ${reais(consumo)} em consumo · atualiza sozinho`}
        acoes={<Link to="/pdv" className={btnCls}>Ir para o Salão e mesas</Link>}
      />
      {erro && <Erro texto={erro} />}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Num rotulo="Comandas abertas" valor={comandas.length} />
        <Num rotulo="Mesas ocupadas" valor={`${ocupadas} de ${mesas.length}`} />
        <Num rotulo="Mesas livres" valor={mesas.length - ocupadas} tom="ok" />
        <Num rotulo="Pedindo a conta" valor={pedindo} tom={pedindo ? 'alerta' : undefined} />
        <Num rotulo="Pessoas no salão" valor={pessoas} />
      </div>

      {grupos.map((sala) => {
        const doSala = mesas.filter((m) => (sala.id ? m.sala_id === sala.id : true))
        if (!doSala.length) return null
        return (
          <section key={sala.id || 'unico'} className="mb-6">
            {grupos.length > 1 && <h2 className="subtitulo mb-2">{sala.nome}</h2>}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
              {doSala.map((m) => {
                const c = porMesa.get(m.id)
                const st = c ? c.status : 'livre'
                return (
                  <div key={m.id} className={`rounded-xl border-2 p-2.5 text-center ${COR[st]}`} aria-label={`Mesa ${m.numero}: ${c ? (st === 'pedindo_conta' ? 'pedindo a conta' : 'ocupada') : 'livre'}`}>
                    <p className="text-lg font-bold leading-tight">{m.numero}</p>
                    {c ? (
                      <>
                        <p className="truncate text-xs font-medium">{c.nome_cliente || `Comanda ${c.numero}`}</p>
                        <p className="text-[11px] opacity-80">{tempo(minutosDesde(c.aberta_em))} · {reais(totais[c.id]?.total)}</p>
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
        <section className="mb-6">
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
      <p className="text-xs text-ink-soft">Painel só de consulta. Para abrir comanda, lançar pedido ou fechar conta, entre em <b>Salão e mesas</b> e informe o seu PIN.</p>
    </div>
  )
}
