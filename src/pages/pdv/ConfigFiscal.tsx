import { useCallback, useEffect, useState } from 'react'
import { db, supabase } from '../../lib/supabase'
import { Carregando, Vazio, btnCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { Avisos, Campo, useSalvarMsg } from './PdvConfig'

interface Fisc { ambiente: string; razao_social: string | null; nome_fantasia: string | null; cnpj: string | null; inscricao_estadual: string | null; inscricao_municipal: string | null; regime_tributario: string | null; cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; municipio: string | null; uf: string | null; codigo_municipio_ibge: string | null; telefone: string | null; csc_id: string | null; serie_nfce: number; emitir_automatico: boolean; ativo: boolean; item_lista_servico: string | null; codigo_tributario_municipio: string | null; aliquota_iss: number | null }
interface Nota { id: string; referencia: string; status: string; numero: number | null; mensagem: string | null; danfe_url: string | null; criado_em: string }

export function Fiscal() {
  const [f, setF] = useState<Fisc | null>(null)
  const [notas, setNotas] = useState<Nota[]>([])
  const s = useSalvarMsg()
  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([db.from('pdv_fiscal_config').select('*').single(), db.from('pdv_notas').select('*').order('criado_em', { ascending: false }).limit(30)])
    setF(a.data as Fisc); setNotas((b.data ?? []) as Nota[])
  }, [])
  useEffect(() => { carregar() }, [carregar])
  async function salvar() {
    if (!f) return
    const { error } = await db.from('pdv_fiscal_config').update({ ...f, atualizado_em: new Date().toISOString() }).eq('id', 1)
    if (error) s.falha(error.message); else s.ok()
  }
  async function testar() {
    const { data, error } = await supabase.functions.invoke('pdv-fiscal', { body: { acao: 'status' } })
    if (error) s.falha('Função pdv-fiscal indisponível: ' + error.message); else s.ok(data?.mensagem ?? 'Resposta recebida.')
  }
  async function acao(n: Nota, a: 'consultar' | 'cancelar') {
    let justificativa
    if (a === 'cancelar') { justificativa = window.prompt('Justificativa do cancelamento (mín. 15 caracteres):'); if (!justificativa) return }
    const { data, error } = await supabase.functions.invoke('pdv-fiscal', { body: { acao: a, referencia: n.referencia, justificativa } })
    if (error) s.falha(error.message); else s.ok(data?.mensagem ?? 'OK')
    carregar()
  }
  if (!f) return <Carregando />
  const set = (p: Partial<Fisc>) => setF({ ...f, ...p })
  const T = (k: keyof Fisc, r: string, ph?: string) => <Campo r={r}><input className={inputCls} placeholder={ph} value={String(f[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<Fisc>)} /></Campo>
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <p className="rounded-xl bg-brand-soft p-3 text-sm">
        Emissão de NFC-e via <b>Focus NFe</b>. O <b>token da Focus</b> NÃO fica nesta tela: é um secret da função de servidor (<code>FOCUSNFE_TOKEN</code>), e o
        <b> certificado A1</b> e o <b>CSC</b> você envia direto no painel da Focus NFe. Aqui ficam só os dados cadastrais e as regras de emissão.
      </p>
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <h2 className="font-semibold">Emitente</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {T('razao_social', 'Razão social')}{T('nome_fantasia', 'Nome fantasia')}{T('cnpj', 'CNPJ (só números)')}{T('inscricao_estadual', 'Inscrição estadual')}
          {T('inscricao_municipal', 'Inscrição municipal')}{T('telefone', 'Telefone')}
          <Campo r="Regime tributário"><select className={inputCls} value={f.regime_tributario ?? ''} onChange={(e) => set({ regime_tributario: e.target.value || null })}><option value="">—</option><option value="simples_nacional">Simples Nacional</option><option value="mei">MEI</option><option value="simples_excesso">Simples (excesso sublimite)</option><option value="regime_normal">Regime normal (Lucro Presumido/Real)</option></select></Campo>
          {T('csc_id', 'ID do CSC (token NFC-e)', 'ex.: 000001')}
          {T('cep', 'CEP')}{T('logradouro', 'Logradouro')}{T('numero', 'Número')}{T('complemento', 'Complemento')}{T('bairro', 'Bairro')}{T('municipio', 'Município')}{T('uf', 'UF')}{T('codigo_municipio_ibge', 'Código IBGE do município')}
        </div>
        <h2 className="pt-2 font-semibold">Emissão</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Campo r="Ambiente"><select className={inputCls} value={f.ambiente} onChange={(e) => set({ ambiente: e.target.value })}><option value="homologacao">Homologação (testes)</option><option value="producao">Produção</option></select></Campo>
          <Campo r="Série da NFC-e"><input className={inputCls} value={f.serie_nfce} onChange={(e) => set({ serie_nfce: Number(e.target.value) || 1 })} /></Campo>
        </div>
        <p className="text-sm text-ink-soft">Ao fechar a comanda o sistema abre a emissão rápida do cupom (CPF/CNPJ do cliente ou sem identificação).</p>
        <h2 className="pt-2 font-semibold">Serviços (NFS-e de eventos)</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {T('item_lista_servico', 'Item da lista de serviço', 'ex.: 17.11')}{T('codigo_tributario_municipio', 'Cód. tributário do município')}
          <Campo r="Alíquota de ISS (%)"><input className={inputCls} inputMode="decimal" value={String(f.aliquota_iss ?? 0)} onChange={(e) => set({ aliquota_iss: Number(e.target.value.replace(',', '.')) || 0 })} /></Campo>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ativo} onChange={(e) => set({ ativo: e.target.checked })} />Módulo fiscal ativo</label>
        <div className="flex gap-2"><button className={btnCls} onClick={salvar}>Salvar</button><button className={btnSecCls} onClick={testar}>Testar conexão</button></div>
      </section>
      <section className={`${cartaoCls} p-4`}>
        <h2 className="mb-2 font-semibold">Últimas notas</h2>
        {!notas.length ? <Vazio texto="Nenhuma nota emitida." /> : (
          <ul className="divide-y divide-line text-sm">
            {notas.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{n.numero ? `Nº ${n.numero} · ` : ''}{n.status}{n.mensagem ? ` — ${n.mensagem}` : ''}</span>
                <span className="flex gap-2">
                  {n.danfe_url && <a className="text-brand" href={n.danfe_url} target="_blank" rel="noreferrer">DANFE</a>}
                  <button className="text-brand" onClick={() => acao(n, 'consultar')}>consultar</button>
                  {n.status === 'autorizada' && <button className="text-alert" onClick={() => acao(n, 'cancelar')}>cancelar</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function Tef() {
  const [t, setT] = useState<{ provedor: string; modelo_maquininha: string | null; ativo: boolean } | null>(null)
  const [param, setParam] = useState('{}')
  const s = useSalvarMsg()
  useEffect(() => { db.from('pdv_tef_config').select('*').single().then(({ data }: { data: unknown }) => { setT(data as never); setParam(JSON.stringify((data as { parametros: unknown })?.parametros ?? {}, null, 2)) }) }, [])
  async function salvar() {
    if (!t) return
    let parametros = {}
    try { parametros = JSON.parse(param || '{}') } catch { return s.falha('Parâmetros: JSON inválido.') }
    const { error } = await db.from('pdv_tef_config').update({ provedor: t.provedor, modelo_maquininha: t.modelo_maquininha, parametros, ativo: t.ativo, atualizado_em: new Date().toISOString() }).eq('id', 1)
    if (error) s.falha(error.message); else s.ok()
  }
  if (!t) return <Carregando />
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <p className="rounded-xl bg-brand-soft p-3 text-sm">
        Hoje o cartão é registrado no PDV com o <b>NSU</b> do comprovante da maquininha (modo manual, já funcional). A integração TEF automática (valor enviado do PDV para a maquininha)
        depende do provedor e do modelo: informe aqui para ligar o adaptador correto. Chaves secretas nunca entram neste campo; vão como secrets da função de servidor.
      </p>
      <section className={`${cartaoCls} space-y-3 p-4`}>
        <Campo r="Provedor"><select className={inputCls} value={t.provedor} onChange={(e) => setT({ ...t, provedor: e.target.value })}>
          <option value="nenhum">Nenhum (manual com NSU)</option><option value="sipag_rede">Sipag e Rede (as duas maquininhas da casa)</option><option value="sipag">Sipag</option><option value="rede">Rede</option><option value="outro">Outro</option>
        </select></Campo>
        <Campo r="Modelo da maquininha"><input className={inputCls} value={t.modelo_maquininha ?? ''} onChange={(e) => setT({ ...t, modelo_maquininha: e.target.value })} /></Campo>
        <Campo r="Parâmetros não secretos (JSON: terminal, loja, etc.)"><textarea className={inputCls + ' min-h-[100px] py-2 font-mono'} value={param} onChange={(e) => setParam(e.target.value)} /></Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={t.ativo} onChange={(e) => setT({ ...t, ativo: e.target.checked })} />Integração automática ativa (quando o adaptador estiver pronto)</label>
        <button className={btnCls} onClick={salvar}>Salvar</button>
      </section>
    </div>
  )
}
