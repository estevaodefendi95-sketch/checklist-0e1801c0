import { useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { Modal } from './PdvCaixa'
import { btnCls, btnSecCls, inputCls } from '../../components/Estado'
import { reais, lerNumero } from '../../lib/formato'
import { Comanda, Item, num } from '../../lib/pdv'
import { useAuth } from '../../context/AuthContext'

export interface RegraDesconto {
  id: string; nome: string; pct: number; escopo: 'todos' | 'produtos'; produto_ids: string[]
  inclui_couvert: boolean; remove_servico: boolean; ativo: boolean; ordem: number
}
export interface DescontoDetalhe {
  regra_id: string | null; regra_nome: string | null; tira_couvert: boolean; tira_servico: boolean
  manual_tipo: 'pct' | 'valor' | null; manual_valor: number; motivo: string | null; por: string | null
}
const r2 = (n: number) => Math.round(n * 100) / 100

/** Calcula o desconto da conta: regra automática + retirada do couvert + desconto manual (% ou R$). */
export function calcularDesconto(itens: Item[], regra: RegraDesconto | null, tiraCouvert: boolean, tiraServico: boolean, manualTipo: 'pct' | 'valor', manualValor: number, servicoPadrao: number) {
  const ativos = itens.filter((i) => i.status !== 'cancelado')
  const soma = (l: Item[]) => l.reduce((s, i) => s + num(i.qtd) * num(i.preco_unit), 0)
  const subtotal = soma(ativos)
  const couvert = soma(ativos.filter((i) => i.tipo === 'couvert'))
  let dRegra = 0
  if (regra) {
    const el = ativos.filter((i) =>
      i.tipo === 'produto'
        ? regra.escopo === 'todos' || (!!i.produto_id && regra.produto_ids.includes(i.produto_id))
        : regra.inclui_couvert && (i.tipo === 'rodizio' || (i.tipo === 'couvert' && !tiraCouvert)))
    dRegra = r2((soma(el) * regra.pct) / 100)
  }
  const dCouvert = tiraCouvert ? r2(couvert) : 0
  const servicoPct = regra?.remove_servico || tiraServico ? 0 : servicoPadrao
  const servico = r2((subtotal * servicoPct) / 100)
  const bruto = subtotal + servico
  const base = Math.max(0, bruto - dRegra - dCouvert)
  const dManual = Math.min(base, Math.max(0, manualTipo === 'pct' ? r2((base * manualValor) / 100) : manualValor))
  const desconto = r2(dRegra + dCouvert + dManual)
  return { subtotal, couvert, servicoPct, servico, dRegra, dCouvert, dManual, desconto, total: Math.max(0, r2(bruto - desconto)) }
}

export function DescontosComanda({ c, itens, onFechar, onSalvo, perm }: { c: Comanda; itens: Item[]; onFechar: () => void; onSalvo: () => void; perm: { desconto: boolean; servico: boolean; couvert: boolean } }) {
  const { profile } = useAuth()
  const [regras, setRegras] = useState<RegraDesconto[]>([])
  const [servicoPadrao, setServicoPadrao] = useState(10)
  const det = (c as Comanda & { desconto_detalhe?: DescontoDetalhe | null }).desconto_detalhe ?? null
  const [regraId, setRegraId] = useState<string | null>(det?.regra_id ?? null)
  const [tiraCouvert, setTiraCouvert] = useState(det?.tira_couvert ?? false)
  const [tiraServico, setTiraServico] = useState(det?.tira_servico ?? (num(c.taxa_servico_pct) === 0 && !det))
  const [manualTipo, setManualTipo] = useState<'pct' | 'valor'>(det?.manual_tipo ?? 'valor')
  const [manualTxt, setManualTxt] = useState(det ? (det.manual_valor ? String(det.manual_valor).replace('.', ',') : '') : num(c.desconto) > 0 ? String(num(c.desconto)).replace('.', ',') : '')
  const [motivo, setMotivo] = useState(det?.motivo ?? '')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    Promise.all([
      db.from('pdv_descontos_regras').select('*').eq('ativo', true).order('ordem').order('nome'),
      db.from('pdv_config').select('taxa_servico_pct').eq('id', 1).maybeSingle(),
    ]).then(([r, cf]) => {
      setRegras(((r.data ?? []) as RegraDesconto[]).map((x) => ({ ...x, pct: num(x.pct) })))
      setServicoPadrao(num(cf.data?.taxa_servico_pct ?? 10))
    })
  }, [])

  const regra = regras.find((r) => r.id === regraId) ?? null
  const manual = lerNumero(manualTxt) ?? 0
  const k = useMemo(() => calcularDesconto(itens, regra, tiraCouvert, tiraServico, manualTipo, manual, servicoPadrao), [itens, regra, tiraCouvert, tiraServico, manualTipo, manual, servicoPadrao])
  const temCouvert = k.couvert > 0

  async function salvar() {
    if (manual > 0 && motivo.trim().length < 3) return setErro('Informe o motivo do desconto manual.')
    if (manualTipo === 'pct' && manual > 100) return setErro('Percentual acima de 100%.')
    setSalvando(true); setErro('')
    const detalhe: DescontoDetalhe = {
      regra_id: regra?.id ?? null, regra_nome: regra?.nome ?? null, tira_couvert: tiraCouvert, tira_servico: tiraServico,
      manual_tipo: manual > 0 ? manualTipo : null, manual_valor: manual, motivo: manual > 0 ? motivo.trim() : null, por: profile?.nome ?? null,
    }
    const { error } = await db.from('pdv_comandas').update({ desconto: k.desconto, taxa_servico_pct: k.servicoPct, desconto_detalhe: detalhe }).eq('id', c.id)
    setSalvando(false)
    if (error) return setErro(error.message)
    onSalvo()
  }

  return (
    <Modal titulo="Descontos e ajustes da conta" fechar={onFechar}>
      {regras.length > 0 && (
        <div className="space-y-1.5">
          <b className="text-sm">Desconto automático</b>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!perm.desconto} className={regraId === null ? btnCls : btnSecCls} onClick={() => setRegraId(null)}>Nenhum</button>
            {regras.map((r) => (
              <button key={r.id} type="button" disabled={!perm.desconto} className={regraId === r.id ? btnCls : btnSecCls} onClick={() => setRegraId(r.id)}>
                {r.nome} · {r.pct}%
              </button>
            ))}
          </div>
          {regra && (
            <p className="text-xs text-ink-soft">
              {regra.pct}% {regra.escopo === 'todos' ? 'sobre todo o consumo' : `só nos ${regra.produto_ids.length} produto(s) da regra`}
              {regra.inclui_couvert ? ', inclusive couvert/rodízio' : ''}{regra.remove_servico ? ' · sem taxa de serviço' : ''}.
            </p>
          )}
        </div>
      )}
      <label className={`flex items-center gap-2 text-sm ${!temCouvert ? 'opacity-50' : ''}`}>
        <input type="checkbox" disabled={!temCouvert || !perm.couvert} checked={tiraCouvert} onChange={(e) => setTiraCouvert(e.target.checked)} />
        Retirar couvert{temCouvert ? ` (${reais(k.couvert)})` : ' (não há couvert nesta conta)'}{!perm.couvert && ' · sem permissão'}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={tiraServico || !!regra?.remove_servico} disabled={!!regra?.remove_servico || !perm.servico} onChange={(e) => setTiraServico(e.target.checked)} />
        Não cobrar taxa de serviço ({servicoPadrao}%){!perm.servico && ' · sem permissão'}
      </label>
      <div className="space-y-1.5">
        <b className="text-sm">Desconto manual</b>
        <div className="flex gap-2">
          <button type="button" disabled={!perm.desconto} className={manualTipo === 'valor' ? btnCls : btnSecCls} onClick={() => setManualTipo('valor')}>R$</button>
          <button type="button" disabled={!perm.desconto} className={manualTipo === 'pct' ? btnCls : btnSecCls} onClick={() => setManualTipo('pct')}>%</button>
          <input className={inputCls} disabled={!perm.desconto} inputMode="decimal" placeholder={manualTipo === 'pct' ? 'Ex.: 10' : 'Ex.: 25,00'} value={manualTxt} onChange={(e) => setManualTxt(e.target.value)} />
        </div>
        {manual > 0 && <input className={inputCls} placeholder="Motivo do desconto (obrigatório)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
      </div>
      <dl className="space-y-1 rounded-xl bg-paper-dim p-3 text-sm">
        <div className="flex justify-between"><dt>Consumo</dt><dd>{reais(k.subtotal)}</dd></div>
        <div className="flex justify-between"><dt>Serviço {k.servicoPct}%</dt><dd>{reais(k.servico)}</dd></div>
        {k.dRegra > 0 && <div className="flex justify-between"><dt>{regra?.nome}</dt><dd>− {reais(k.dRegra)}</dd></div>}
        {k.dCouvert > 0 && <div className="flex justify-between"><dt>Couvert retirado</dt><dd>− {reais(k.dCouvert)}</dd></div>}
        {k.dManual > 0 && <div className="flex justify-between"><dt>Desconto manual</dt><dd>− {reais(k.dManual)}</dd></div>}
        <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>Total a pagar</dt><dd>{reais(k.total)}</dd></div>
      </dl>
      {erro && <p className="text-sm text-alert">{erro}</p>}
      <div className="flex gap-2">
        <button className={btnSecCls + ' flex-1'} onClick={onFechar}>Voltar</button>
        <button className={btnCls + ' flex-1'} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Aplicar'}</button>
      </div>
    </Modal>
  )
}

/** Campo rápido de desconto dentro de "Receber": valor (R$ ou %) + motivo + Aplicar. Mantém a regra automática e o couvert já definidos. */
export function DescontoRapido({ c, itens, onSalvo, onMais, inputRef }: { c: Comanda; itens: Item[]; onSalvo: () => void; onMais: () => void; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const { profile } = useAuth()
  const det = (c as Comanda & { desconto_detalhe?: DescontoDetalhe | null }).desconto_detalhe ?? null
  const [regras, setRegras] = useState<RegraDesconto[]>([])
  const [tipo, setTipo] = useState<'pct' | 'valor'>('valor')
  const [txt, setTxt] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    db.from('pdv_descontos_regras').select('*').eq('ativo', true).then((r: { data: RegraDesconto[] | null }) => setRegras((r.data ?? []).map((x) => ({ ...x, pct: num(x.pct) }))))
  }, [])

  async function aplicar() {
    const v = lerNumero(txt) ?? 0
    if (v <= 0) return setErro('Informe o valor do desconto.')
    if (tipo === 'pct' && v > 100) return setErro('Percentual acima de 100%.')
    if (motivo.trim().length < 3) return setErro('Informe o motivo do desconto.')
    const regra = regras.find((r) => r.id === det?.regra_id) ?? null
    const tiraServico = det?.tira_servico ?? (num(c.taxa_servico_pct) === 0 && !det)
    const k = calcularDesconto(itens, regra, det?.tira_couvert ?? false, tiraServico, tipo, v, num(c.taxa_servico_pct))
    setSalvando(true); setErro('')
    const detalhe: DescontoDetalhe = {
      regra_id: regra?.id ?? null, regra_nome: regra?.nome ?? null, tira_couvert: det?.tira_couvert ?? false, tira_servico: tiraServico,
      manual_tipo: tipo, manual_valor: v, motivo: motivo.trim(), por: profile?.nome ?? null,
    }
    const { error } = await db.from('pdv_comandas').update({ desconto: k.desconto, taxa_servico_pct: k.servicoPct, desconto_detalhe: detalhe }).eq('id', c.id)
    setSalvando(false)
    if (error) return setErro(error.message)
    setTxt(''); setMotivo('')
    onSalvo()
  }

  return (
    <div className="space-y-2 rounded-xl border border-line p-3">
      <div className="flex items-center justify-between text-sm">
        <b>Desconto{num(c.desconto) > 0 ? ` · aplicado ${reais(num(c.desconto))}` : ''}</b>
        <button className="text-brand" onClick={onMais}>mais opções</button>
      </div>
      <div className="flex flex-wrap items-stretch gap-2">
        <div className="flex overflow-hidden rounded-[10px] border border-line text-sm">
          {(['valor', 'pct'] as const).map((t) => (
            <button key={t} type="button" className={`px-3 ${tipo === t ? 'bg-brand text-brand-ink' : 'bg-surface'}`} onClick={() => setTipo(t)}>{t === 'valor' ? 'R$' : '%'}</button>
          ))}
        </div>
        <input ref={inputRef} className={inputCls + ' !w-28'} inputMode="decimal" placeholder={tipo === 'valor' ? '0,00' : '10'} value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') aplicar() }} />
        <input className={inputCls + ' min-w-[8rem] flex-1'} placeholder="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') aplicar() }} />
        <button className={btnCls} disabled={salvando} onClick={aplicar}>Aplicar</button>
      </div>
      {erro && <p className="text-sm text-alert">{erro}</p>}
    </div>
  )
}
