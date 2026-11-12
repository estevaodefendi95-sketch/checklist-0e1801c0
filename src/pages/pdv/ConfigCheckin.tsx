import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/supabase'
import { Carregando, Vazio, btnCls, btnPerigoCls, btnSecCls, cartaoCls, inputCls } from '../../components/Estado'
import { reais, lerNumero } from '../../lib/formato'
import { Modal } from './PdvCaixa'
import { Avisos, Campo, useSalvarMsg } from './PdvConfig'
import { Cobranca, Perfil, rotuloDias } from './PerfisCheckin'

type CobrancaFull = Cobranca & { ncm: string | null; cfop: string | null; csosn: string | null; origem: number | null; unidade: string | null }
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function Checkin() {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [cobs, setCobs] = useState<CobrancaFull[]>([])
  const [exige, setExige] = useState(true)
  const [pronto, setPronto] = useState(false)
  const [edC, setEdC] = useState<Partial<CobrancaFull> | null>(null)
  const [edP, setEdP] = useState<Partial<Perfil> | null>(null)
  const s = useSalvarMsg()
  const carregar = useCallback(async () => {
    const [p, c, cfg] = await Promise.all([
      db.from('pdv_perfis').select('*').order('ordem'), db.from('pdv_cobrancas').select('*').order('ordem'),
      db.from('pdv_config').select('checkin_exige_perfil').eq('id', 1).single(),
    ])
    setPerfis((p.data ?? []) as Perfil[]); setCobs((c.data ?? []) as CobrancaFull[]); setExige(cfg.data?.checkin_exige_perfil ?? true); setPronto(true)
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function salvarPerfil() {
    if (!edP?.nome?.trim()) return s.falha('Informe o nome.')
    const { id, ...r } = edP
    const dados = { ...r, nome: edP.nome.trim(), percentual: Math.min(100, Math.max(0, Number(edP.percentual ?? 100))) }
    const { error } = id ? await db.from('pdv_perfis').update(dados).eq('id', id) : await db.from('pdv_perfis').insert({ ...dados, ordem: perfis.length + 1 })
    if (error) return s.falha(error.code === '23505' ? 'Já existe um perfil com esse nome.' : error.message)
    setEdP(null); s.ok(); carregar()
  }
  async function salvarCobranca() {
    if (!edC?.nome?.trim() || !edC.tipo) return s.falha('Informe nome e tipo.')
    if (edC.ativo && !(Number(edC.valor) > 0)) return s.falha('Para ativar, informe o valor por pessoa.')
    if (!edC.dias_semana?.length) return s.falha('Marque ao menos um dia.')
    const { id, ...r } = edC
    const dados = { ...r, nome: edC.nome.trim(), valor: Number(edC.valor ?? 0) }
    const { error } = id ? await db.from('pdv_cobrancas').update(dados).eq('id', id) : await db.from('pdv_cobrancas').insert({ ...dados, ordem: cobs.length + 1 })
    if (error) return s.falha(error.message)
    setEdC(null); s.ok(); carregar()
  }
  async function exigir(v: boolean) {
    setExige(v)
    await db.from('pdv_config').update({ checkin_exige_perfil: v }).eq('id', 1)
  }
  if (!pronto) return <Carregando />
  return (
    <div className="space-y-4">
      <Avisos s={s} />
      <p className="rounded-xl bg-brand-soft p-3 text-sm">
        No check-in a recepção informa quantas pessoas de cada <b>perfil</b> chegaram. O sistema lança sozinho, na comanda, o <b>couvert artístico</b> e o <b>rodízio</b>
        dos dias em que estiverem valendo, multiplicando o valor pelo percentual do perfil (criança paga menos, aniversariante pode ser isento).
      </p>
      <section className={`${cartaoCls} p-4`}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Cobranças por pessoa</h2>
          <button className={btnCls} onClick={() => setEdC({ tipo: 'couvert', valor: 0, dias_semana: [0, 1, 2, 3, 4, 5, 6], ativo: false, cfop: '5102', unidade: 'UN', origem: 0 })}>Nova cobrança</button>
        </div>
        {!cobs.length ? <Vazio texto="Nenhuma cobrança." /> : (
          <ul className="divide-y divide-line text-sm">
            {cobs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <button className="text-left" onClick={() => setEdC(c)}>
                  <b>{c.nome}</b> · {c.tipo === 'couvert' ? 'couvert' : 'rodízio'} · {reais(c.valor)} por pessoa
                  <span className="block text-xs text-ink-soft">{rotuloDias(c.dias_semana)}{!c.ativo && ' · INATIVA (defina o valor e ative)'}</span>
                </button>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={c.ativo} onChange={async (e) => {
                  if (e.target.checked && !(c.valor > 0)) return s.falha('Informe o valor antes de ativar (clique na cobrança).')
                  await db.from('pdv_cobrancas').update({ ativo: e.target.checked }).eq('id', c.id); carregar() }} />ativa</label>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={`${cartaoCls} p-4`}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Perfis de cliente</h2>
          <button className={btnCls} onClick={() => setEdP({ percentual: 100, ativo: true })}>Novo perfil</button>
        </div>
        <ul className="divide-y divide-line text-sm">
          {perfis.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <button className="text-left" onClick={() => setEdP(p)}><b>{p.nome}</b> · {p.percentual === 0 ? 'não paga' : `paga ${p.percentual}%`}{!p.ativo && ' · inativo'}</button>
            </li>
          ))}
        </ul>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={exige} onChange={(e) => exigir(e.target.checked)} />Exigir informar as pessoas por perfil ao abrir a comanda</label>
      </section>
      {edP && (
        <Modal titulo={edP.id ? 'Editar perfil' : 'Novo perfil'} fechar={() => setEdP(null)}>
          <Campo r="Nome"><input className={inputCls} value={edP.nome ?? ''} onChange={(e) => setEdP({ ...edP, nome: e.target.value })} /></Campo>
          <Campo r="Percentual do valor que paga (0 a 100)"><input className={inputCls} inputMode="numeric" value={edP.percentual ?? 100} onChange={(e) => setEdP({ ...edP, percentual: lerNumero(e.target.value) ?? 0 })} /></Campo>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edP.ativo ?? true} onChange={(e) => setEdP({ ...edP, ativo: e.target.checked })} />Ativo</label>
          <button className={btnCls} onClick={salvarPerfil}>Salvar</button>
        </Modal>
      )}
      {edC && (
        <Modal titulo={edC.id ? 'Editar cobrança' : 'Nova cobrança'} fechar={() => setEdC(null)}>
          <Campo r="Nome (aparece na conta)"><input className={inputCls} value={edC.nome ?? ''} onChange={(e) => setEdC({ ...edC, nome: e.target.value })} /></Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo r="Tipo"><select className={inputCls} value={edC.tipo} onChange={(e) => setEdC({ ...edC, tipo: e.target.value as Cobranca['tipo'] })}><option value="couvert">Couvert artístico</option><option value="rodizio">Rodízio</option></select></Campo>
            <Campo r="Valor por pessoa (R$)"><input className={inputCls} inputMode="decimal" defaultValue={edC.valor ?? ''} onChange={(e) => setEdC({ ...edC, valor: lerNumero(e.target.value) ?? 0 })} /></Campo>
          </div>
          <div>
            <div className="mb-1 text-sm">Dias em que vale</div>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d, i) => {
                const on = edC.dias_semana?.includes(i)
                return <button key={d} type="button" className={on ? btnCls + ' !min-h-[40px] !px-3' : btnSecCls + ' !min-h-[40px] !px-3'}
                  onClick={() => setEdC({ ...edC, dias_semana: on ? edC.dias_semana!.filter((x) => x !== i) : [...(edC.dias_semana ?? []), i].sort() })}>{d}</button>
              })}
            </div>
          </div>
          <h4 className="pt-1 text-sm font-semibold">Dados fiscais (para sair na NFC-e)</h4>
          <div className="grid grid-cols-2 gap-2">
            <Campo r="NCM / código do serviço"><input className={inputCls} value={edC.ncm ?? ''} onChange={(e) => setEdC({ ...edC, ncm: e.target.value })} /></Campo>
            <Campo r="CFOP"><input className={inputCls} value={edC.cfop ?? ''} onChange={(e) => setEdC({ ...edC, cfop: e.target.value })} /></Campo>
            <Campo r="CSOSN"><input className={inputCls} value={edC.csosn ?? ''} onChange={(e) => setEdC({ ...edC, csosn: e.target.value })} /></Campo>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edC.ativo ?? false} onChange={(e) => setEdC({ ...edC, ativo: e.target.checked })} />Ativa</label>
          <div className="flex gap-2">
            <button className={btnCls} onClick={salvarCobranca}>Salvar</button>
            {edC.id && <button className={btnPerigoCls} onClick={async () => { if (window.confirm('Excluir cobrança? Comandas antigas mantêm o lançamento.')) { await db.from('pdv_cobrancas').delete().eq('id', edC.id); setEdC(null); carregar() } }}>Excluir</button>}
          </div>
        </Modal>
      )}
    </div>
  )
}
