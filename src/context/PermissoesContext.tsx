import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { db } from '../lib/supabase'
import { useAuth } from './AuthContext'

export const PERMISSOES = [
  { key: 'ver_custos', label: 'Ver custos' },
  { key: 'editar_fichas', label: 'Editar fichas e cardápios' },
  { key: 'editar_precos', label: 'Alterar preços de insumos' },
  { key: 'lancar_vendas', label: 'Lançar vendas' },
  { key: 'lancar_estoque', label: 'Lançar estoque e compras' },
] as const

export type Permissao = (typeof PERMISSOES)[number]['key']
type Mapa = Record<Permissao, boolean>

const vazio: Mapa = {
  ver_custos: false,
  editar_fichas: false,
  editar_precos: false,
  lancar_vendas: false,
  lancar_estoque: false,
}

const Ctx = createContext<{ pode: (p: Permissao) => boolean; carregado: boolean }>({
  pode: () => false,
  carregado: false,
})

export function PermissoesProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [mapa, setMapa] = useState<Mapa>(vazio)
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    if (!profile) {
      setMapa(vazio)
      setCarregado(false)
      return
    }
    let ativo = true
    Promise.all(
      PERMISSOES.map(async ({ key }) => {
        const { data } = await db.rpc('tem_permissao', { p: key })
        return [key, data === true] as const
      })
    ).then((pares) => {
      if (!ativo) return
      setMapa(Object.fromEntries(pares) as Mapa)
      setCarregado(true)
    })
    return () => {
      ativo = false
    }
  }, [profile?.id])

  const pode = (p: Permissao) => profile?.role === 'admin' || mapa[p]
  return <Ctx.Provider value={{ pode, carregado }}>{children}</Ctx.Provider>
}

export function usePermissoes() {
  return useContext(Ctx)
}

export function SoComCusto({ children }: { children: ReactNode }) {
  const { pode } = usePermissoes()
  return pode('ver_custos') ? <>{children}</> : null
}
