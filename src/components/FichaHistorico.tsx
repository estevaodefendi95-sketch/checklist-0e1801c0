import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePermissoes } from '../context/PermissoesContext'
import { numero } from '../lib/formato'
import { Carregando, Erro, btnSecCls } from './Estado'
import { Ficha, FichaItem } from '../lib/fichas'

interface Versao {
  id: number
  versao: number
  conteudo: { ficha: Ficha; itens: FichaItem[] }
  autor: string | null
  criado_em: string
}

// campos que entram na comparação e na restauração (nunca id, versão ou datas)
const CAMPOS: { k: keyof Ficha; label: string; custo?: boolean }[] = [
  { k: 'nome', label: 'nome' },
  { k: 'tipo', label: 'tipo' },
  { k: 'rendimento', label: 'rendimento' },
  { k: 'rendimento_unidade', label: 'unidade do rendimento' },
  { k: 'porcoes', label: 'porções' },
  { k: 'perda_pct', label: 'perda %' },
  { k: 'preco_venda', label: 'preço de venda', custo: true },
  { k: 'meta_cmv', label: 'meta de CMV', custo: true },
  { k: 'tempo_preparo_min', label: 'tempo de preparo' },
  { k: 'modo_preparo', label: 'modo de preparo' },
  { k: 'montagem', label: 'montagem' },
  { k: 'conservacao', label: 'conservação' },
  { k: 'utensilios', label: 'utensílios' },
  { k: 'foto_url', label: 'foto' },
  { k: 'precisa_revisao', label: 'precisa revisão' },
  { k: 'observacao_revisao', label: 'observação de revisão' },
  { k: 'ativo', label: 'ativa' },
]

function mostrar(v: unknown) {
  if (v == null || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'sim' : 'não'
  const s = String(v)
  return s.length > 60 ? s.slice(0, 60) + '…' : s
}

export function FichaHistorico({
  ficha,
  itensAtuais,
  onRestaurado,
}: {
  ficha: Ficha
  itensAtuais: FichaItem[]
  onRestaurado: () => void
}) {
  const { profile } = useAuth()
  const { pode } = usePermissoes()
  const admin = profile?.role === 'admin'
  const verCusto = pode('ver_custos')
  const [aberto, setAberto] = useState(false)
  const [versoes, setVersoes] = useState<Versao[] | null>(null)
  const [nomes, setNomes] = useState<Map<string, string>>(new Map())
  const [erro, setErro] = useState<string | null>(null)
  const [restaurando, setRestaurando] = useState<number | null>(null)

  useEffect(() => {
    if (!aberto) return
    ;(async () => {
      setVersoes(null)
      const [v, p, i, f] = await Promise.all([
        db.from('ficha_versoes').select('*').eq('ficha_id', ficha.id).order('versao', { ascending: false }),
        db.from('profiles').select('id,nome'),
        db.from('insumos').select('id,nome'),
        db.from('fichas').select('id,nome').eq('tipo', 'preparacao'),
      ])
      if (v.error) return setErro(v.error.message)
      const m = new Map<string, string>()
      for (const r of [...(p.data ?? []), ...(i.data ?? []), ...(f.data ?? [])] as { id: string; nome: string }[])
        m.set(r.id, r.nome)
      setNomes(m)
      setVersoes(v.data ?? [])
    })()
  }, [aberto, ficha.versao])

  function descrever(i: FichaItem) {
    const n = nomes.get(i.insumo_id ?? i.sub_ficha_id ?? '') ?? '(item)'
    return `${n}: ${numero(i.quantidade)} ${i.unidade}${i.grupo_escolha ? ` [${i.grupo_escolha}]` : ''}`
  }

  /** o que mudou de `antes` (versão salva) para `depois` (versão seguinte ou atual) */
  function diferencas(antes: Versao['conteudo'], depois: Versao['conteudo']) {
    const linhas: string[] = []
    for (const c of CAMPOS) {
      if (c.custo && !verCusto) continue
      const a = antes.ficha[c.k]
      const d = depois.ficha[c.k]
      if (String(a ?? '') !== String(d ?? '')) linhas.push(`${c.label}: ${mostrar(a)} → ${mostrar(d)}`)
    }
    const ia = new Set(antes.itens.map(descrever))
    const id = new Set(depois.itens.map(descrever))
    for (const x of ia) if (!id.has(x)) linhas.push(`− ${x}`)
    for (const x of id) if (!ia.has(x)) linhas.push(`+ ${x}`)
    return linhas
  }

  async function restaurar(v: Versao) {
    if (!confirm(`Restaurar a versão ${v.versao}? A versão atual fica guardada no histórico.`)) return
    setRestaurando(v.id)
    const campos = Object.fromEntries(CAMPOS.map((c) => [c.k, v.conteudo.ficha[c.k]]))
    // atualizar a ficha primeiro: o gatilho guarda a versão atual (com os itens atuais)
    const up = await db.from('fichas').update(campos).eq('id', ficha.id)
    if (up.error) {
      setRestaurando(null)
      return alert('Não foi possível restaurar: ' + up.error.message)
    }
    const del = await db.from('ficha_itens').delete().eq('ficha_id', ficha.id)
    const ins = del.error
      ? del
      : v.conteudo.itens.length
        ? await db.from('ficha_itens').insert(
            v.conteudo.itens.map((i) => ({
              ficha_id: ficha.id,
              insumo_id: i.insumo_id,
              sub_ficha_id: i.sub_ficha_id,
              quantidade: i.quantidade,
              unidade: i.unidade,
              grupo_escolha: i.grupo_escolha,
              observacao: i.observacao,
              ordem: i.ordem,
            }))
          )
        : { error: null }
    setRestaurando(null)
    if (ins.error) return alert('A ficha foi restaurada, mas os ingredientes não: ' + ins.error.message)
    onRestaurado()
  }

  return (
    <section className="rounded border border-line">
      <button onClick={() => setAberto((v) => !v)} className="flex min-h-[44px] w-full items-center justify-between px-3 text-left text-sm">
        <span className="font-medium">histórico de versões</span>
        <span className="text-xs text-ink-soft">{aberto ? 'fechar' : 'abrir'}</span>
      </button>
      {aberto && (
        <div className="border-t border-line p-3">
          {erro && <Erro texto={erro} />}
          {!versoes ? (
            !erro && <Carregando />
          ) : versoes.length === 0 ? (
            <p className="text-sm text-ink-soft">Esta ficha ainda não foi editada.</p>
          ) : (
            <ul className="space-y-3">
              {versoes.map((v, n) => {
                const depois = n === 0 ? { ficha, itens: itensAtuais } : versoes[n - 1].conteudo
                const dif = diferencas(v.conteudo, depois)
                return (
                  <li key={v.id} className="rounded border border-line p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <b className="font-medium">versão {v.versao}</b>
                        <span className="ml-2 text-xs text-ink-soft">
                          {new Date(v.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                          {' · '}
                          {nomes.get(v.autor ?? '') ?? 'importação'}
                        </span>
                      </span>
                      {admin && (
                        <button onClick={() => restaurar(v)} disabled={restaurando != null} className={btnSecCls}>
                          {restaurando === v.id ? 'restaurando…' : 'restaurar'}
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-ink-soft">
                      mudanças para a versão {n === 0 ? `atual (${ficha.versao})` : versoes[n - 1].versao}:
                    </p>
                    {dif.length === 0 ? (
                      <p className="text-xs text-ink-soft">nenhuma diferença visível</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {dif.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
