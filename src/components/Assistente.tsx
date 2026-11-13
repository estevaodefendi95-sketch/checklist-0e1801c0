import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { db, supabase } from '../lib/supabase'
import { usePermissoes } from '../context/PermissoesContext'
import { reais, lerNumero } from '../lib/formato'
import { idsConsumoInterno, noHorarios, num, type Faixa } from '../lib/pdv'
import { Icone } from './Icone'

interface Msg { de: 'eu' | 'bot'; texto: string; links?: { to: string; rotulo: string }[]; acao?: { rotulo: string; fazer: () => Promise<string> } }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const inicioDoDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }
const SUG = ['Resumo de hoje', 'Avisos e erros', 'Comandas abertas', 'Impressoras', 'Notas fiscais de hoje', 'Cardápio agora']

/** Chat lateral: entende perguntas sobre o que acontece no sistema, mostra dados e leva à tela certa. */
export function Assistente() {
  const { pode } = usePermissoes()
  const { pathname } = useLocation()
  const [aberto, setAberto] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([{ de: 'bot', texto: 'Oi! Pergunte sobre vendas, mesas, impressoras, notas fiscais, estoque ou preços. Também altero preço e pauso produtos (com sua confirmação).' }])
  const [txt, setTxt] = useState('')
  const [pensando, setPensando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, aberto])
  if (!pode('pdv_operar')) return null

  const add = (m: Msg) => setMsgs((x) => [...x, m])

  async function resumo(): Promise<Msg> {
    const { data: cs0 } = await db.from('pdv_comandas').select('id,pessoas,funcionario_id,desconto_detalhe').eq('status', 'fechada').gte('fechada_em', inicioDoDia())
    const internos = await idsConsumoInterno(db, (cs0 ?? []) as { id: string }[])   // funcionário/família: fora do faturamento
    const cs = (cs0 ?? []).filter((c: { id: string; funcionario_id: string | null }) => !c.funcionario_id && !internos.has(c.id))
    const ids = cs.map((c: { id: string }) => c.id)
    const { data: tt } = ids.length ? await db.from('pdv_comanda_totais').select('total').in('comanda_id', ids) : { data: [] }
    const total = (tt ?? []).reduce((s: number, t: { total: number }) => s + num(t.total), 0)
    const pessoas = (cs ?? []).reduce((s: number, c: { pessoas: number }) => s + num(c.pessoas), 0)
    const { count: abertas } = await db.from('pdv_comandas').select('id', { count: 'exact', head: true }).in('status', ['aberta', 'pedindo_conta'])
    if (!ids.length) return { de: 'bot', texto: `Nenhuma comanda fechada hoje ainda. ${abertas ?? 0} aberta(s) agora.`, links: [{ to: '/pdv', rotulo: 'Ver salão' }] }
    return { de: 'bot', texto: `Hoje: ${ids.length} comanda(s) fechada(s), ${reais(total)} vendidos. Ticket médio ${reais(total / ids.length)}${pessoas ? ` · ${reais(total / pessoas)} por pessoa (${pessoas} pessoas)` : ''}. ${abertas ?? 0} comanda(s) aberta(s) agora.`, links: [{ to: '/pdv/relatorios', rotulo: 'Relatórios do PDV' }] }
  }

  async function responder(pergunta: string): Promise<Msg> {
    const q = norm(pergunta)
    const tem = (...p: string[]) => p.some((x) => q.includes(x))
    // --- ações (pedem confirmação) ---
    const mPreco = q.match(/(?:alter\w*|mud\w*|troc\w*|atualiz\w*|coloc\w*)\s+(?:o\s+)?preco\s+(?:d[oae]s?\s+)?(.+?)\s+(?:para|pra|por|->)\s+(?:r\$\s*)?([\d.,]+)/)
    if (mPreco) {
      if (!pode('pdv_gerir')) return { de: 'bot', texto: 'Você não tem permissão para alterar preços (PDV: configurar).' }
      const { data } = await db.from('pdv_produtos').select('id,nome,preco').ilike('nome', `%${mPreco[1].trim()}%`).limit(5)
      const novo = lerNumero(mPreco[2])
      if (!data?.length || novo == null) return { de: 'bot', texto: `Não achei produto "${mPreco[1]}" ou o valor é inválido.` }
      if (data.length > 1) return { de: 'bot', texto: `Achei vários: ${data.map((p: { nome: string }) => p.nome).join(', ')}. Diga o nome completo.` }
      const p = data[0]
      return { de: 'bot', texto: `${p.nome}: ${reais(num(p.preco))} → ${reais(novo)}. Vale na hora no PDV e no tablet.`, acao: { rotulo: 'Confirmar novo preço', fazer: async () => { const { error } = await db.from('pdv_produtos').update({ preco: novo }).eq('id', p.id); return error ? `Erro: ${error.message}` : `Pronto. ${p.nome} agora custa ${reais(novo)}.` } } }
    }
    const mPausa = q.match(/(pausar|esgotou|acabou|tirar|desativar|ativar|voltou|reativar|liberar)\s+(?:o\s+|a\s+)?(.+)/)
    if (mPausa && !tem('impressora', 'mesa')) {
      if (!pode('pdv_gerir')) return { de: 'bot', texto: 'Você não tem permissão para alterar disponibilidade de produtos.' }
      const liga = /^(ativar|voltou|reativar|liberar)/.test(mPausa[1])
      const { data } = await db.from('pdv_produtos').select('id,nome').ilike('nome', `%${mPausa[2].trim()}%`).limit(5)
      if (!data?.length) return { de: 'bot', texto: `Não achei produto "${mPausa[2]}".` }
      if (data.length > 1) return { de: 'bot', texto: `Achei vários: ${data.map((p: { nome: string }) => p.nome).join(', ')}. Diga o nome completo.` }
      const p = data[0]
      return { de: 'bot', texto: `${liga ? 'Voltar a vender' : 'Marcar como esgotado'}: ${p.nome}?`, acao: { rotulo: 'Confirmar', fazer: async () => { const { error } = await db.from('pdv_produtos').update({ disponivel: liga }).eq('id', p.id); return error ? `Erro: ${error.message}` : `${p.nome} ${liga ? 'disponível' : 'esgotado'} (some do PDV e do tablet).` } } }
    }
    // --- consultas ---
    const mPrecoQ = q.match(/(?:preco|valor|quanto custa|quanto e)\s+(?:d[oae]s?\s+)?(.+)/)
    if (mPrecoQ && !tem('cancel')) {
      const { data } = await db.from('pdv_produtos').select('nome,preco,disponivel,visivel_tablet').ilike('nome', `%${mPrecoQ[1].replace(/\?/g, '').trim()}%`).limit(6)
      if (data?.length) return { de: 'bot', texto: data.map((p: { nome: string; preco: number; disponivel: boolean }) => `${p.nome}: ${reais(num(p.preco))}${p.disponivel ? '' : ' (esgotado)'}`).join('\n') }
    }
    const mMesa = q.match(/mesa\s+(\w+)/)
    if (mMesa) {
      const { data: m } = await db.from('pdv_mesas').select('id,numero').eq('numero', mMesa[1]).maybeSingle()
      if (!m) return { de: 'bot', texto: `Mesa ${mMesa[1]} não encontrada.` }
      const { data: c } = await db.from('pdv_comandas').select('id,numero,pessoas,nome_cliente,status,aberta_em').eq('mesa_id', m.id).in('status', ['aberta', 'pedindo_conta']).maybeSingle()
      if (!c) return { de: 'bot', texto: `Mesa ${m.numero} está livre.`, links: [{ to: '/pdv', rotulo: 'Abrir no salão' }] }
      const { data: t } = await db.from('pdv_comanda_totais').select('total,pago').eq('comanda_id', c.id).single()
      return { de: 'bot', texto: `Mesa ${m.numero} · comanda #${c.numero}${c.nome_cliente ? ` (${c.nome_cliente})` : ''} · ${c.pessoas} pessoa(s) · total ${reais(num(t?.total))}, pago ${reais(num(t?.pago))}${c.status === 'pedindo_conta' ? ' · pediu a conta' : ''}.`, links: [{ to: `/pdv/comanda/${c.id}`, rotulo: 'Abrir comanda' }] }
    }
    if (tem('ajuda', 'o que voce faz', 'help', 'comandos')) return { de: 'bot', texto: 'Posso: resumo de vendas/ticket médio, comandas abertas, "mesa 12", avisos e erros, impressoras e fila, notas fiscais, cancelamentos de hoje, couvert/rodízio, estoque e fichas com pendência, cardápio no tablet agora, "preço do chopp", "alterar preço do chopp para 18,90", "pausar picanha" e levar você às telas (notas de compra, eventos, opções).' }
    if (tem('resumo', 'vendas', 'faturamento', 'ticket', 'vendi', 'hoje') && !tem('nota', 'fiscal', 'cancel')) return resumo()
    if (tem('aviso', 'erro', 'problema', 'notific', 'alerta')) {
      const { data } = await db.from('pdv_notificacoes').select('titulo,mensagem,criado_em').eq('lida', false).order('criado_em', { ascending: false }).limit(6)
      if (!data?.length) return { de: 'bot', texto: 'Nenhum aviso não lido. Tudo tranquilo.' }
      return { de: 'bot', texto: `${data.length} aviso(s) não lido(s):\n` + data.map((a: { titulo: string; mensagem: string | null }) => `• ${a.titulo}${a.mensagem ? ` — ${a.mensagem}` : ''}`).join('\n') }
    }
    if (tem('impress')) {
      const [f, i] = await Promise.all([db.from('pdv_fila_impressao').select('status'), db.from('pdv_impressoras').select('nome,funcao,ultimo_ok,ativo')])
      const cont: Record<string, number> = {}
      ;(f.data ?? []).filter((x: { status: string }) => x.status !== 'ok').forEach((x: { status: string }) => (cont[x.status] = (cont[x.status] ?? 0) + 1))
      const imp = (i.data ?? []).map((p: { nome: string; ultimo_ok: string | null; ativo: boolean }) => `• ${p.nome}: ${p.ativo ? (p.ultimo_ok ? `última impressão ${new Date(p.ultimo_ok).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'nunca imprimiu') : 'inativa'}`).join('\n')
      return { de: 'bot', texto: `Fila: ${Object.keys(cont).length ? Object.entries(cont).map(([k, v]) => `${v} ${k}`).join(', ') : 'vazia'}.\n${imp || 'Nenhuma impressora cadastrada.'}${cont.erro ? '\nHá impressões com erro: use "reenfileirar erros".' : ''}`, links: [{ to: '/pdv/config', rotulo: 'Impressoras · reimprimir cupom' }] }
    }
    if (tem('comandas', 'abertas', 'salao', 'mesas ocupadas')) {
      const { data } = await db.from('pdv_comandas').select('id,numero,pessoas,nome_cliente,status,mesa:pdv_mesas(numero)').in('status', ['aberta', 'pedindo_conta']).order('aberta_em').limit(15)
      if (!data?.length) return { de: 'bot', texto: 'Nenhuma comanda aberta.' }
      return { de: 'bot', texto: `${data.length} comanda(s) aberta(s):\n` + data.map((c: { numero: number; pessoas: number; status: string; mesa: { numero: string } | null; nome_cliente: string | null }) => `• ${c.mesa ? `Mesa ${c.mesa.numero}` : 'Balcão'} #${c.numero} · ${c.pessoas} pes.${c.status === 'pedindo_conta' ? ' · pediu a conta' : ''}`).join('\n'), links: [{ to: '/pdv', rotulo: 'Ir ao salão' }] }
    }
    if (tem('cancel')) {
      const { data } = await db.from('pdv_notificacoes').select('titulo,mensagem').eq('tipo', 'cancelamento').gte('criado_em', inicioDoDia()).order('criado_em', { ascending: false }).limit(8)
      return { de: 'bot', texto: data?.length ? `${data.length} cancelamento(s) hoje:\n` + data.map((a: { titulo: string; mensagem: string | null }) => `• ${a.titulo}: ${a.mensagem ?? ''}`).join('\n') : 'Nenhum cancelamento hoje.' }
    }
    if (tem('nota', 'fiscal', 'nfc', 'cupom')) {
      const { data } = await db.from('pdv_notas').select('status,mensagem').gte('criado_em', inicioDoDia())
      const cont: Record<string, number> = {}
      ;(data ?? []).forEach((n: { status: string }) => (cont[n.status] = (cont[n.status] ?? 0) + 1))
      const erro = (data ?? []).find((n: { status: string }) => n.status === 'erro' || n.status === 'rejeitada') as { mensagem?: string } | undefined
      return { de: 'bot', texto: `Notas hoje: ${Object.keys(cont).length ? Object.entries(cont).map(([k, v]) => `${v} ${k}`).join(', ') : 'nenhuma'}.${erro ? `\nÚltimo problema: ${erro.mensagem ?? 'veja o detalhe'}` : ''}\nPara emitir ao CPF/CNPJ, use "Conta e pagamento" na comanda; para 2ª via, Configurações › Impressoras.`, links: [{ to: '/pdv/config', rotulo: 'Fiscal e reimpressão' }, { to: '/pdv/eventos', rotulo: 'NF de eventos' }] }
    }
    if (tem('couvert', 'rodizio')) {
      const { data } = await db.from('pdv_pedido_itens').select('tipo,qtd,preco_unit').in('tipo', ['couvert', 'rodizio']).neq('status', 'cancelado').gte('criado_em', inicioDoDia())
      const por: Record<string, { q: number; v: number }> = {}
      ;(data ?? []).forEach((i: { tipo: string; qtd: number; preco_unit: number }) => { por[i.tipo] ??= { q: 0, v: 0 }; por[i.tipo].q += num(i.qtd); por[i.tipo].v += num(i.qtd) * num(i.preco_unit) })
      return { de: 'bot', texto: Object.keys(por).length ? Object.entries(por).map(([k, v]) => `${k}: ${v.q} cobrança(s), ${reais(v.v)}`).join('\n') : 'Nenhum couvert/rodízio cobrado hoje.', links: [{ to: '/pdv/config', rotulo: 'Configurar valores' }] }
    }
    if (tem('estoque', 'falta', 'baixo', 'insumo', 'ficha', 'cmv')) {
      const [a, b] = await Promise.all([db.from('insumos').select('id', { count: 'exact', head: true }).is('preco', null).eq('ativo', true), db.from('v_fichas_custo').select('nome,cmv_pct,meta_cmv').not('cmv_pct', 'is', null)])
      const alto = (b.data ?? []).filter((f: { cmv_pct: number; meta_cmv: number | null }) => f.meta_cmv && num(f.cmv_pct) > num(f.meta_cmv)).slice(0, 5)
      return { de: 'bot', texto: `${a.count ?? 0} insumo(s) sem preço. ${alto.length ? 'Fichas acima da meta de CMV: ' + alto.map((f: { nome: string }) => f.nome).join(', ') + '.' : 'Nenhuma ficha acima da meta de CMV.'}`, links: [{ to: '/relatorio/estoque', rotulo: 'Estoque' }, { to: '/insumos', rotulo: 'Insumos' }, { to: '/compras', rotulo: 'Lançar NF de compra' }] }
    }
    if (tem('cardapio', 'tablet', 'qr', 'horario')) {
      const [c, p] = await Promise.all([db.from('pdv_categorias').select('id,nome,visivel_tablet,horarios').eq('ativo', true), db.from('pdv_produtos').select('categoria_id,visivel_tablet,disponivel,horarios').eq('ativo', true)])
      const catOk = new Map((c.data ?? []).filter((x: { visivel_tablet: boolean; horarios: Faixa[] | null }) => x.visivel_tablet && noHorarios(x.horarios)).map((x: { id: string; nome: string }) => [x.id, x.nome]))
      const vis = (p.data ?? []).filter((x: { categoria_id: string | null; visivel_tablet: boolean; disponivel: boolean; horarios: Faixa[] | null }) => x.visivel_tablet && x.disponivel && (!x.categoria_id || catOk.has(x.categoria_id)) && noHorarios(x.horarios))
      const fora = [...(c.data ?? [])].filter((x: { id: string }) => !catOk.has(x.id)).map((x: { nome: string }) => x.nome)
      return { de: 'bot', texto: `Agora o tablet mostra ${vis.length} produto(s) em ${catOk.size} categoria(s).${fora.length ? ` Fora do ar neste horário: ${fora.join(', ')}.` : ''}`, links: [{ to: '/pdv/config', rotulo: 'Cardápio, horários e preços' }] }
    }
    if (tem('compra', 'fornecedor', 'reajust')) return { de: 'bot', texto: 'Lance a nota de compra (ou importe o XML da NF-e): os preços dos insumos vinculados são atualizados e o custo das fichas se recalcula sozinho.', links: [{ to: '/compras', rotulo: 'Notas de compra' }, { to: '/fornecedores', rotulo: 'Fornecedores' }] }
    if (tem('evento')) return { de: 'bot', texto: 'Notas de eventos (NFS-e) ficam em uma área própria: cadastre o tomador, o serviço e o valor e emita.', links: [{ to: '/pdv/eventos', rotulo: 'Notas de eventos' }] }
    if (tem('caixa')) {
      const { data } = await db.from('pdv_caixa_sessoes').select('caixa,aberto_em,fundo_inicial').eq('status', 'aberto').limit(1)
      return { de: 'bot', texto: data?.length ? `Caixa "${data[0].caixa}" aberto desde ${new Date(data[0].aberto_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}, fundo ${reais(num(data[0].fundo_inicial))}.` : 'Nenhum caixa aberto.', links: [{ to: '/pdv/caixa', rotulo: 'Ir ao caixa' }] }
    }
    // --- livre: tenta o modelo (se configurado no servidor) ---
    const { data, error } = await supabase.functions.invoke('pdv-assistente', { body: { pergunta, tela: pathname } })
    if (!error && data?.texto) return { de: 'bot', texto: data.texto as string }
    return { de: 'bot', texto: 'Não entendi bem. Tente: "resumo de hoje", "avisos", "mesa 12", "impressoras", "notas fiscais", "preço do chopp" ou "ajuda".' }
  }

  async function enviar(t: string) {
    const v = t.trim()
    if (!v || pensando) return
    setTxt(''); add({ de: 'eu', texto: v }); setPensando(true)
    try { add(await responder(v)) } catch (e) { add({ de: 'bot', texto: 'Algo deu errado: ' + (e as Error).message }) }
    setPensando(false)
  }

  return (
    <>
      <button onClick={() => setAberto(true)} aria-label="Abrir assistente" title="Assistente" className="fixed bottom-[calc(78px+env(safe-area-inset-bottom))] right-3 z-40 grid h-11 w-11 place-items-center rounded-full bg-brand text-brand-ink opacity-90 shadow-lg lg:bottom-6 lg:right-6 lg:h-14 lg:w-14 lg:opacity-100">
        <Icone nome="chat" tamanho={26} />
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50" role="dialog" aria-label="Assistente">
          <button className="absolute inset-0 bg-ink/30 lg:bg-transparent" onClick={() => setAberto(false)} aria-label="Fechar" />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-2xl">
            <header className="flex items-center justify-between border-b border-line p-4"><b>Assistente Paggio</b><button onClick={() => setAberto(false)} aria-label="Fechar"><Icone nome="fechar" /></button></header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
              {msgs.map((m, i) => (
                <div key={i} className={m.de === 'eu' ? 'text-right' : ''}>
                  <div className={`inline-block max-w-[90%] whitespace-pre-line rounded-2xl px-3 py-2 text-left ${m.de === 'eu' ? 'bg-brand text-brand-ink' : 'bg-brand-soft'}`}>{m.texto}</div>
                  {m.links && <div className="mt-1 flex flex-wrap gap-2">{m.links.map((l) => <Link key={l.to} to={l.to} onClick={() => setAberto(false)} className="rounded-full border border-brand/40 px-3 py-1 text-xs text-brand">{l.rotulo} →</Link>)}</div>}
                  {m.acao && i === msgs.length - 1 && <button className="mt-1 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink" onClick={async () => { const a = m.acao!; setMsgs((x) => x.map((k, j) => (j === i ? { ...k, acao: undefined } : k))); add({ de: 'bot', texto: await a.fazer() }) }}>{m.acao.rotulo}</button>}
                </div>
              ))}
              {pensando && <p className="text-xs text-ink-soft">pensando…</p>}
              <div ref={fim} />
            </div>
            <div className="space-y-2 border-t border-line p-3">
              <div className="flex gap-1.5 overflow-x-auto pb-1">{SUG.map((s) => <button key={s} onClick={() => enviar(s)} className="shrink-0 rounded-full border border-line px-3 py-1 text-xs">{s}</button>)}</div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); enviar(txt) }}>
                <input className="min-h-[44px] flex-1 rounded-[10px] border border-line bg-surface px-3 text-sm outline-none focus:border-brand" placeholder="Pergunte ou peça algo…" value={txt} onChange={(e) => setTxt(e.target.value)} />
                <button className="min-h-[44px] rounded-[10px] bg-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-50" disabled={pensando}>Enviar</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
