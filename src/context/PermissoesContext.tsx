import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { db } from '../lib/supabase'
import { useAuth } from './AuthContext'

export const PERMISSOES = [
  { key: 'ver_custos', label: 'Ver custos' },
  { key: 'editar_fichas', label: 'Editar fichas e cardápios' },
  { key: 'editar_precos', label: 'Alterar preços de insumos' },
  { key: 'lancar_vendas', label: 'Lançar vendas' },
  { key: 'lancar_estoque', label: 'Lançar estoque e compras' },
  { key: 'pdv_operar', label: 'PDV: operar salão e comandas' },
  { key: 'pdv_caixa', label: 'PDV: caixa e pagamentos' },
  { key: 'pdv_gerir', label: 'PDV: configurar (mesas, produtos, impressoras)' },
  { key: 'pdv_fiscal', label: 'PDV: fiscal (NFC-e)' },
  { key: 'pdv_ver_vendas', label: 'Ver relatório de vendas' },
  { key: 'pdv_ver_crm', label: 'Ver clientes e CRM' },
  { key: 'pdv_ver_reservas', label: 'Ver reservas' },
  { key: 'pdv_ver_whatsapp', label: 'Ver WhatsApp' },
  { key: 'pdv_ver_consumo', label: 'Ver consumo de funcionários' },
] as const

export type Permissao = (typeof PERMISSOES)[number]['key']
type Mapa = Record<Permissao, boolean>

const vazio: Mapa = {
  ver_custos: false,
  editar_fichas: false,
  editar_precos: false,
  lancar_vendas: false,
  lancar_estoque: false,
  pdv_operar: false,
  pdv_caixa: false,
  pdv_gerir: false,
  pdv_fiscal: false,
  pdv_ver_vendas: false,
  pdv_ver_crm: false,
  pdv_ver_reservas: false,
  pdv_ver_whatsapp: false,
  pdv_ver_consumo: false,
}

const Ctx = createContext<{ pode: (p: Permissao) => boolean; master: boolean; carregado: boolean }>({
  pode: () => false,
  master: false,
  carregado: false,
})

export function PermissoesProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [mapa, setMapa] = useState<Mapa>(vazio)
  // administrador master: único que gerencia usuários (checklist.eh_master)
  const [master, setMaster] = useState(false)
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    if (!profile) {
      setMapa(vazio)
      setMaster(false)
      setCarregado(false)
      return
    }
    let ativo = true
    Promise.all([
      Promise.all(
        PERMISSOES.map(async ({ key }) => {
          const { data } = await (key.startsWith('pdv_') ? db.rpc('pdv_pode', { p: key }) : db.rpc('tem_permissao', { p: key }))
          return [key, data === true] as const
        })
      ),
      db.rpc('eh_master').then(({ data }: { data: unknown }) => data === true),
    ]).then(([pares, eMaster]) => {
      if (!ativo) return
      setMapa(Object.fromEntries(pares) as Mapa)
      setMaster(eMaster)
      setCarregado(true)
    })
    return () => {
      ativo = false
    }
  }, [profile?.id])

  const pode = (p: Permissao) => profile?.role === 'admin' || mapa[p]
  return <Ctx.Provider value={{ pode, master, carregado }}>{children}</Ctx.Provider>
}

export function usePermissoes() {
  return useContext(Ctx)
}

export function SoComCusto({ children }: { children: ReactNode }) {
  const { pode } = usePermissoes()
  return pode('ver_custos') ? <>{children}</> : null
}
