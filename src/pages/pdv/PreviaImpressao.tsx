import { useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/supabase'
import { btnCls, cartaoCls, inputCls } from '../../components/Estado'
import { Impressora } from '../../lib/pdv'

type Linha = { t: string; grande?: boolean; negrito?: boolean; centro?: boolean; par?: [string, string] }
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

interface Amostra { funcao: string; mesa: string; comanda: string; cliente: string; hora: string; origem: string; qtd: string; produto: string; obs: string }

/** Mesmo desenho que o agente de impressão (agente-impressao/agente.mjs) faz para o pedido da cozinha/bar. */
function viaPedido(a: Amostra): Linha[] {
  return [
    { t: a.funcao.toUpperCase(), grande: true, negrito: true, centro: true },
    { t: `MESA ${a.mesa || '-'}`, grande: true, negrito: true, centro: true },
    ...(a.comanda ? [{ t: `Comanda #${a.comanda}${a.cliente ? ' - ' + a.cliente : ''}`, negrito: true, centro: true }] : []),
    { t: `${a.hora} (${a.origem})`, centro: true },
    { t: '-', par: ['-', '-'] },
    { t: `${a.qtd || 1}x ${a.produto}`, grande: true, negrito: true },
    ...(a.obs ? [{ t: 'OBS: ' + a.obs }] : []),
    { t: '-', par: ['-', '-'] },
  ]
}
function viaConta(a: Amostra): Linha[] {
  const itens = [{ q: 2, n: a.produto || 'Item', p: 32 }, { q: 1, n: 'Refrigerante lata', p: 8 }]
  const sub = itens.reduce((s, i) => s + i.q * i.p, 0)
  const serv = Math.round(sub * 10) / 100
  return [
    { t: 'PRE-CONTA (sem valor fiscal)', negrito: true, centro: true },
    { t: `Mesa ${a.mesa || '-'}  Comanda #${a.comanda || '-'}`, centro: true },
    ...(a.cliente ? [{ t: a.cliente, centro: true }] : []),
    { t: '-', par: ['-', '-'] },
    ...itens.map((i) => ({ t: '', par: [`${i.q}x ${i.n}`, brl(i.q * i.p)] as [string, string] })),
    { t: '-', par: ['-', '-'] },
    { t: '', par: ['Subtotal', brl(sub)] },
    { t: '', par: ['Servico 10%', brl(serv)] },
    { t: '', par: ['TOTAL', brl(sub + serv)], grande: true, negrito: true },
  ]
}

function Papel({ linhas, cols }: { linhas: Linha[]; cols: number }) {
  return (
    <div className="mx-auto overflow-x-auto rounded-md border border-line bg-white p-3 text-black shadow-inner" style={{ maxWidth: '100%' }}>
      <div className="mx-auto font-mono leading-tight" style={{ width: `${cols}ch`, fontSize: 13 }}>
        {linhas.map((l, i) => {
          if (l.par && l.par[0] === '-') return <div key={i} className="overflow-hidden whitespace-nowrap">{'-'.repeat(cols)}</div>
          const dobro = !!l.grande
          const largura = dobro ? Math.floor(cols / 2) : cols
          let texto = l.t
          if (l.par) {
            const [e, d] = l.par
            texto = e.slice(0, largura - d.length - 1) + ' '.repeat(Math.max(1, largura - e.length - d.length)) + d
          }
          return (
            <div key={i} className={`whitespace-pre ${l.negrito ? 'font-bold' : ''}`} style={{ textAlign: l.centro ? 'center' : 'left', fontSize: dobro ? '2em' : undefined, lineHeight: dobro ? 1.1 : undefined }}>
              {texto.slice(0, largura) || ' '}
            </div>
          )
        })}
        <div className="pt-2 text-center text-[10px] text-neutral-400">— corte —</div>
      </div>
    </div>
  )
}

/** Mostra como sai o papel de cada impressora (cliente, mesa, produto e hora) antes de imprimir de verdade. */
export function PreviaImpressao() {
  const [imps, setImps] = useState<Impressora[]>([])
  const [modelo, setModelo] = useState<'pedido' | 'conta'>('pedido')
  const [impId, setImpId] = useState('')
  const [a, setA] = useState<Amostra>({ funcao: 'cozinha', mesa: '12', comanda: '34', cliente: 'Maria Souza', hora: hora(), origem: 'sistema', qtd: '2', produto: 'Hambúrguer artesanal', obs: 'sem cebola | ponto médio' })
  const [msg, setMsg] = useState('')
  useEffect(() => { db.from('pdv_impressoras').select('*').order('funcao').then((r: { data: Impressora[] | null }) => { const l = r.data ?? []; setImps(l); if (l[0]) { setImpId(l[0].id); setA((x) => ({ ...x, funcao: l[0].funcao })) } }) }, [])
  const imp = imps.find((i) => i.id === impId)
  const cols = imp?.colunas || 48
  const linhas = useMemo(() => (modelo === 'pedido' ? viaPedido(a) : viaConta(a)), [modelo, a])
  const set = (p: Partial<Amostra>) => setA((x) => ({ ...x, ...p }))

  async function imprimir() {
    if (!imp) return setMsg('Cadastre uma impressora primeiro.')
    const conteudo = modelo === 'pedido'
      ? { mesa: a.mesa, comanda: Number(a.comanda) || null, cliente: a.cliente, nome: a.produto, qtd: Number(a.qtd) || 1, obs: a.obs || null, origem: a.origem, hora: a.hora }
      : { mesa: a.mesa, comanda: Number(a.comanda) || 0, subtotal: 80, taxa_servico_pct: 10, servico: 8, desconto: 0, total: 88, itens: [{ qtd: 2, nome: a.produto, preco: 32 }, { qtd: 1, nome: 'Refrigerante lata', preco: 8 }] }
    const { error } = await db.from('pdv_fila_impressao').insert({ impressora_id: imp.id, tipo: modelo === 'pedido' ? 'pedido' : 'conta', conteudo })
    setMsg(error ? error.message : `Enviado para a impressora ${imp.nome}. O agente imprime em poucos segundos.`)
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-brand-soft p-3 text-sm">
        Veja como fica o papel antes de imprimir. O desenho é o mesmo do agente de impressão: <b>função, mesa, comanda e nome do cliente, hora e origem, e o produto em letra grande</b>.
        Edite os campos para testar nomes longos; o botão manda uma impressão de verdade para conferir no papel.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${cartaoCls} space-y-3 p-4`}>
          <div className="flex gap-2">
            {(['pedido', 'conta'] as const).map((m) => (
              <button key={m} className={modelo === m ? btnCls : inputCls + ' !w-auto'} onClick={() => setModelo(m)}>{m === 'pedido' ? 'Pedido (cozinha / bar)' : 'Pré-conta (caixa)'}</button>
            ))}
          </div>
          <label className="block text-sm">Impressora
            <select className={inputCls} value={impId} onChange={(e) => { setImpId(e.target.value); const i = imps.find((x) => x.id === e.target.value); if (i) set({ funcao: i.funcao }) }}>
              {!imps.length && <option value="">Nenhuma cadastrada</option>}
              {imps.map((i) => <option key={i.id} value={i.id}>{i.nome} · {i.funcao} · {i.colunas} colunas</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>Mesa<input className={inputCls} value={a.mesa} onChange={(e) => set({ mesa: e.target.value })} /></label>
            <label>Comanda<input className={inputCls} inputMode="numeric" value={a.comanda} onChange={(e) => set({ comanda: e.target.value.replace(/\D/g, '') })} /></label>
            <label className="col-span-2">Nome do cliente<input className={inputCls} maxLength={24} value={a.cliente} onChange={(e) => set({ cliente: e.target.value })} /></label>
            <label>Hora<input className={inputCls} value={a.hora} onChange={(e) => set({ hora: e.target.value })} /></label>
            <label>Origem
              <select className={inputCls} value={a.origem} onChange={(e) => set({ origem: e.target.value })}>
                <option value="sistema">sistema (garçom)</option><option value="tablet">tablet</option>
              </select>
            </label>
            <label>Qtd<input className={inputCls} inputMode="numeric" value={a.qtd} onChange={(e) => set({ qtd: e.target.value.replace(/\D/g, '') })} /></label>
            <label>Produto<input className={inputCls} value={a.produto} onChange={(e) => set({ produto: e.target.value })} /></label>
            <label className="col-span-2">Observações / opções<input className={inputCls} value={a.obs} onChange={(e) => set({ obs: e.target.value })} /></label>
          </div>
          <button className={btnCls + ' w-full'} onClick={imprimir} disabled={!imp}>Imprimir esta prévia no papel</button>
          {msg && <p className="text-sm text-ink-soft">{msg}</p>}
        </section>
        <section className={`${cartaoCls} p-4`}>
          <h3 className="subtitulo mb-3">Como sai no papel ({cols} colunas)</h3>
          <Papel linhas={linhas} cols={cols} />
          <p className="mt-3 text-xs text-ink-soft">A impressora é térmica: a letra real é preta no papel branco e o corte é automático. Letras grandes ocupam metade das colunas, por isso nomes longos quebram.</p>
        </section>
      </div>
    </div>
  )
}
