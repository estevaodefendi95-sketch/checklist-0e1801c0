import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { reais, pct } from '../lib/formato'
import { Carregando, Vazio, Erro, inputCls, btnCls } from '../components/Estado'
import { FichaCusto, TIPO_LABEL, TipoFicha, corCmv } from '../lib/fichas'

interface Linha {
  id: string
  tipo: TipoFicha
  nome: string
  preco_venda: number | null
  meta_cmv: number
  precisa_revisao: boolean
}

const TIPOS: { v: '' | TipoFicha; label: string }[] = [
  { v: '', label: 'todos' },
  { v: 'prato', label: 'pratos' },
  { v: 'preparacao', label: 'preparações-base' },
  { v: 'rodizio', label: 'rodízio' },
]

export function Fichas() {
  const { pode, carregado } = usePermissoes()
  const verCusto = pode('ver_custos')
  const [params, setParams] = useSearchParams()
  const [fichas, setFichas] = useState<Linha[]>([])
  const [custos, setCustos] = useState<Map<string, FichaCusto>>(new Map())
  const [cardapios, setCardapios] = useState<{ id: string; nome: string }[]>([])
  const [vinculos, setVinculos] = useState<{ ficha_id: string; cardapio_id: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const busca = params.get('q') ?? ''
  const tipo = (params.get('tipo') ?? '') as '' | TipoFicha
  const cardapio = params.get('cardapio') ?? ''
  const soRevisar = params.get('revisar') === '1'
  const soAcima = params.get('acima') === '1'

  function filtro(chave: string, valor: string) {
    const p = new URLSearchParams(params)
    if (valor) p.set(chave, valor)
    else p.delete(chave)
    setParams(p, { replace: true })
  }

  useEffect(() => {
    if (!carregado) return
    let ativo = true
    ;(async () => {
      setCarregando(true)
      const [f, c, v, custo] = await Promise.all([
        db.from('fichas').select('id,tipo,nome,preco_venda,meta_cmv,precisa_revisao').eq('ativo', true).order('nome'),
        db.from('cardapios').select('id,nome').order('ordem'),
        db.from('ficha_cardapios').select('ficha_id,cardapio_id'),
        verCusto
          ? db.from('v_fichas_custo').select('id,custo_unitario,cmv_pct,margem,preco_sugerido,pendencias')
          : { data: [] },
      ])
      if (!ativo) return
      setCarregando(false)
      if (f.error) return setErro(f.error.message)
      setErro(custo.error ? 'Não foi possível carregar os custos: ' + custo.error.message : null)
      setFichas(f.data ?? [])
      setCardapios(c.data ?? [])
      setVinculos(v.data ?? [])
      setCustos(new Map(((custo.data ?? []) as FichaCusto[]).map((x) => [x.id, x])))
    })()
    return () => {
      ativo = false
    }
  }, [carregado, verCusto])

  const termo = busca.trim().toLowerCase()
  const filtradas = fichas.filter((f) => {
    if (tipo && f.tipo !== tipo) return false
    if (termo && !f.nome.toLowerCase().includes(termo)) return false
    if (soRevisar && !f.precisa_revisao) return false
    if (cardapio && !vinculos.some((v) => v.ficha_id === f.id && v.cardapio_id === cardapio)) return false
    if (soAcima) {
      const cmv = custos.get(f.id)?.cmv_pct
      if (cmv == null || cmv <= f.meta_cmv) return false
    }
    return true
  })

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="display text-xl font-medium">fichas técnicas</h1>
        {pode('editar_fichas') && (
          <Link to="/fichas/nova" className={`${btnCls} flex items-center`}>
            + nova ficha
          </Link>
        )}
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <input
          placeholder="buscar ficha"
          value={busca}
          onChange={(e) => filtro('q', e.target.value)}
          className={inputCls}
        />
        <select value={cardapio} onChange={(e) => filtro('cardapio', e.target.value)} className={`${inputCls} sm:w-56`}>
          <option value="">todos os cardápios</option>
          {cardapios.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap gap-1">
        {TIPOS.map((t) => (
          <button
            key={t.v}
            onClick={() => filtro('tipo', t.v)}
            className={`min-h-[44px] rounded border px-3 text-xs ${
              tipo === t.v ? 'border-ink bg-ink text-paper' : 'border-line text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => filtro('revisar', soRevisar ? '' : '1')}
          className={`min-h-[44px] rounded border px-3 text-xs ${
            soRevisar ? 'border-warn bg-warn-soft text-warn' : 'border-line text-ink-soft'
          }`}
        >
          só para revisar
        </button>
        {verCusto && (
          <button
            onClick={() => filtro('acima', soAcima ? '' : '1')}
            className={`min-h-[44px] rounded border px-3 text-xs ${
              soAcima ? 'border-alert bg-alert-soft text-alert' : 'border-line text-ink-soft'
            }`}
          >
            CMV acima da meta
          </button>
        )}
      </div>

      {erro && <Erro texto={erro} />}
      {carregando ? (
        <Carregando />
      ) : filtradas.length === 0 ? (
        <Vazio texto={fichas.length === 0 ? 'Nenhuma ficha cadastrada.' : 'Nenhuma ficha com esses filtros.'} />
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-soft">{filtradas.length} fichas</p>
          <ul className="divide-y divide-line rounded border border-line">
            {filtradas.map((f) => {
              const c = custos.get(f.id)
              return (
                <li key={f.id}>
                  <Link to={`/fichas/${f.id}`} className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-paper-dim/60">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{f.nome}</span>
                      <span className="text-xs text-ink-soft">{TIPO_LABEL[f.tipo]}</span>
                      {f.precisa_revisao && (
                        <span className="rounded bg-warn-soft px-1.5 py-0.5 text-xs text-warn">Revisar</span>
                      )}
                    </span>
                    {verCusto && c && (
                      <span className="flex flex-wrap items-center gap-3 text-xs">
                        <span title="custo por porção / unidade">{reais(c.custo_unitario)}</span>
                        {f.tipo !== 'preparacao' && (
                          <>
                            <span className="text-ink-soft">{reais(f.preco_venda)}</span>
                            <span className={`font-medium ${corCmv(c.cmv_pct, f.meta_cmv)}`}>CMV {pct(c.cmv_pct)}</span>
                          </>
                        )}
                        {c.pendencias > 0 && (
                          <span className="rounded bg-alert-soft px-1.5 py-0.5 text-alert">
                            {c.pendencias} {c.pendencias === 1 ? 'pendência' : 'pendências'}
                          </span>
                        )}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
