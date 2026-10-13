import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { PERMISSOES, Permissao } from '../context/PermissoesContext'

type Linha = Record<Permissao, boolean>

export function PermissoesUsuario({ userId, admin }: { userId: string; admin: boolean }) {
  const [linha, setLinha] = useState<Linha | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    db.from('permissoes')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }: { data: Linha | null }) =>
        setLinha(
          data ?? {
            ver_custos: false,
            editar_fichas: false,
            editar_precos: false,
            lancar_vendas: false,
            lancar_estoque: false,
          }
        )
      )
  }, [userId])

  async function alternar(k: Permissao) {
    if (!linha || admin) return
    const nova = { ...linha, [k]: !linha[k] }
    setSalvando(true)
    const { error } = await db
      .from('permissoes')
      .upsert({ user_id: userId, ...pick(nova) }, { onConflict: 'user_id' })
    setSalvando(false)
    if (error) return alert('Não foi possível salvar: ' + error.message)
    setLinha(nova)
  }

  return (
    <div className="flex w-full flex-wrap gap-1">
      {PERMISSOES.map(({ key, label }) => {
        const on = admin || !!linha?.[key]
        return (
          <button
            key={key}
            disabled={admin || salvando || !linha}
            onClick={() => alternar(key)}
            className={`min-h-[36px] rounded border px-2 text-xs ${
              on ? 'border-ok bg-ok-soft text-ok' : 'border-line text-ink-soft'
            } ${admin ? 'cursor-not-allowed opacity-80' : ''}`}
          >
            {on ? '● ' : '○ '}
            {label}
          </button>
        )
      })}
    </div>
  )
}

function pick(l: Linha) {
  const { ver_custos, editar_fichas, editar_precos, lancar_vendas, lancar_estoque } = l
  return { ver_custos, editar_fichas, editar_precos, lancar_vendas, lancar_estoque }
}
