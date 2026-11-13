import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { Modal } from '../pages/pdv/PdvCaixa'
import { Alerta, Carregando, btnCls, btnSecCls } from './Estado'

interface Op { id: string; numero: number; nome_cliente: string | null; pessoas: number; status: string; mesa: string | null; subtotal: number }
const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Junta outras comandas abertas na comanda atual para fechar tudo numa conta só. */
export function AgruparComandas({ principalId, principalNumero, onFechar, onOk }: { principalId: string; principalNumero: number; onFechar: () => void; onOk: (n: number) => void }) {
  const [ops, setOps] = useState<Op[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState('')
  const [carga, setCarga] = useState(false)

  useEffect(() => {
    (async () => {
      const cs = await db.from('pdv_comandas').select('id,numero,nome_cliente,pessoas,status,mesa_id,funcionario_id').in('status', ['aberta', 'pedindo_conta']).neq('id', principalId).is('funcionario_id', null).order('numero')
      if (cs.error) return setErro(cs.error.message)
      const lista = (cs.data ?? []) as { id: string; numero: number; nome_cliente: string | null; pessoas: number; status: string; mesa_id: string | null }[]
      const ids = lista.map((x) => x.id)
      const [its, ms, pg] = await Promise.all([
        ids.length ? db.from('pdv_pedido_itens').select('comanda_id,qtd,preco_unit,status,tipo').in('comanda_id', ids) : { data: [] },
        db.from('pdv_mesas').select('id,numero'),
        ids.length ? db.from('pdv_pagamentos').select('comanda_id,estornado').in('comanda_id', ids) : { data: [] },
      ])
      const mesa = new Map(((ms.data ?? []) as { id: string; numero: string }[]).map((m) => [m.id, m.numero]))
      const comPag = new Set(((pg.data ?? []) as { comanda_id: string; estornado: boolean }[]).filter((p) => !p.estornado).map((p) => p.comanda_id))
      const soma = new Map<string, number>()
      for (const i of (its.data ?? []) as { comanda_id: string; qtd: number; preco_unit: number; status: string }[]) if (i.status !== 'cancelado') soma.set(i.comanda_id, (soma.get(i.comanda_id) ?? 0) + i.qtd * Number(i.preco_unit))
      setOps(lista.filter((x) => !comPag.has(x.id)).map((x) => ({ ...x, mesa: x.mesa_id ? mesa.get(x.mesa_id) ?? null : null, subtotal: soma.get(x.id) ?? 0 })))
    })()
  }, [principalId])

  const escolhidas = (ops ?? []).filter((o) => sel.has(o.id))
  const extra = escolhidas.reduce((s, o) => s + o.subtotal, 0)
  function alterna(id: string) { setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }) }
  async function agrupar() {
    setCarga(true); setErro('')
    const { data, error } = await db.rpc('pdv_agrupar_comandas', { p_principal: principalId, p_ids: [...sel] })
    setCarga(false)
    if (error) return setErro(error.message)
    onOk(Number(data ?? sel.size))
  }

  return (
    <Modal titulo={`Agrupar comandas na #${principalNumero}`} fechar={onFechar}>
      <p className="text-sm text-ink-soft">Escolha as comandas que vão pagar juntas. Os itens vão para a comanda #{principalNumero} (continua aparecendo de qual comanda cada item veio) e as outras são encerradas.</p>
      {!ops ? <Carregando /> : !ops.length ? <p className="rounded-xl bg-paper-dim p-4 text-center text-sm text-ink-soft">Nenhuma outra comanda aberta para agrupar.</p> : (
        <ul className="max-h-[50vh] space-y-2 overflow-y-auto">
          {ops.map((o) => {
            const on = sel.has(o.id)
            return (
              <li key={o.id}>
                <button type="button" onClick={() => alterna(o.id)} className={`flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${on ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/50'}`}>
                  <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border text-sm font-bold ${on ? 'border-brand bg-brand text-brand-ink' : 'border-line'}`}>{on ? '✓' : ''}</span>
                  <span className="min-w-0 flex-1">
                    <b className="block">#{o.numero}{o.nome_cliente ? ` · ${o.nome_cliente}` : ''}</b>
                    <span className="text-xs text-ink-soft">{o.mesa ? `Mesa ${o.mesa}` : 'Sem mesa'} · {o.pessoas} pessoa(s){o.status === 'pedindo_conta' ? ' · conta pedida' : ''}</span>
                  </span>
                  <b className="shrink-0">{reais(o.subtotal)}</b>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {sel.size > 0 && <p className="rounded-xl bg-paper-dim px-4 py-2 text-sm">{sel.size} comanda(s) · soma de itens <b>{reais(extra)}</b> a mais na #{principalNumero}</p>}
      {erro && <Alerta tipo="erro" texto={erro} />}
      <div className="flex gap-2">
        <button className={btnSecCls + ' flex-1'} onClick={onFechar}>Voltar</button>
        <button className={btnCls + ' flex-1'} disabled={carga || !sel.size} onClick={agrupar}>{carga ? 'Agrupando…' : `Agrupar ${sel.size || ''}`.trim()}</button>
      </div>
    </Modal>
  )
}
