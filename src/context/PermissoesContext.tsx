import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { db } from '../lib/supabase'
import { useAuth } from './AuthContext'

export const PERMISSOES = [
  { key: 'pdv_operar', grupo: 'salao', label: 'Operar o Salão e as comandas', desc: 'Abrir comanda, lançar pedidos, pedir a conta.' },
  { key: 'pdv_caixa', grupo: 'caixa', label: 'Receber pagamentos', desc: 'Registrar pagamento, encerrar a conta, a receber.' },
  { key: 'pdv_desconto', grupo: 'caixa', label: 'Lançar desconto', desc: 'Desconto em R$ ou %, regras automáticas (ex.: familiar).' },
  { key: 'pdv_tirar_servico', grupo: 'caixa', label: 'Tirar os 10% (taxa de serviço)', desc: 'Marcar "não cobrar taxa de serviço" na conta.' },
  { key: 'pdv_tirar_couvert', grupo: 'caixa', label: 'Tirar o couvert', desc: 'Retirar o couvert da conta.' },
  { key: 'pdv_caixa_abrir', grupo: 'caixa', label: 'Abrir e fechar o caixa', desc: 'Abertura e fechamento do caixa do dia e a agenda automática.' },
  { key: 'pdv_fiscal', grupo: 'config', label: 'Fiscal (NFC-e)', desc: 'Emitir e reimprimir cupom fiscal.' },
  { key: 'pdv_gerir', grupo: 'config', label: 'Configurar o PDV', desc: 'Mesas, produtos, impressoras, PINs, tablets.' },
  { key: 'ver_custos', grupo: 'cozinha', label: 'Ver custos', desc: '' },
  { key: 'editar_fichas', grupo: 'cozinha', label: 'Editar fichas e cardápios', desc: '' },
  { key: 'editar_precos', grupo: 'cozinha', label: 'Alterar preços de insumos', desc: '' },
  { key: 'lancar_vendas', grupo: 'cozinha', label: 'Lançar vendas', desc: '' },
  { key: 'lancar_estoque', grupo: 'cozinha', label: 'Lançar estoque e compras', desc: '' },
  { key: 'pdv_ver_vendas', grupo: 'telas', label: 'Relatório de vendas', desc: '' },
  { key: 'pdv_ver_crm', grupo: 'telas', label: 'Clientes e CRM', desc: '' },
  { key: 'pdv_ver_reservas', grupo: 'telas', label: 'Reservas', desc: '' },
  { key: 'pdv_ver_whatsapp', grupo: 'telas', label: 'WhatsApp', desc: '' },
  { key: 'pdv_ver_consumo', grupo: 'telas', label: 'Consumo de funcionários', desc: '' },
  { key: 'pdv_ver_gestao', grupo: 'telas', label: 'Modo Gestão no celular', desc: 'Checklists, estoque, fichas…' },
] as const

/** Blocos da tela de usuários, na ordem em que aparecem. */
export const GRUPOS_PERMISSOES = [
  { id: 'salao', titulo: 'Salão e atendimento' },
  { id: 'caixa', titulo: 'Caixa, descontos e pagamentos' },
  { id: 'config', titulo: 'Configuração e fiscal' },
  { id: 'cozinha', titulo: 'Cozinha, estoque e fichas' },
  { id: 'telas', titulo: 'Telas que a pessoa enxerga' },
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
  pdv_caixa_abrir: false,
  pdv_desconto: false,
  pdv_tirar_servico: false,
  pdv_tirar_couvert: false,
  pdv_gerir: false,
  pdv_fiscal: false,
  pdv_ver_vendas: false,
  pdv_ver_crm: false,
  pdv_ver_reservas: false,
  pdv_ver_whatsapp: false,
  pdv_ver_consumo: false,
  pdv_ver_gestao: false,
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
