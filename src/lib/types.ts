export type UserRole = 'admin' | 'editor' | 'visualizador'
export type ChecklistTipo = 'abertura' | 'fechamento'
export type CampoTipo = 'checkbox' | 'quantidade' | 'sim_nao' | 'texto'

export interface Area {
  id: string
  nome: string
}

export interface Profile {
  id: string
  nome: string
  role: UserRole
  areas_permitidas: string[]
}

export interface ChecklistTemplate {
  id: string
  area_id: string
  tipo: ChecklistTipo
  nome: string
  ativo: boolean
}

export interface ChecklistItem {
  id: string
  template_id: string
  nome_campo: string
  tipo_campo: CampoTipo
  ordem: number
  obrigatorio: boolean
}

export interface ChecklistExecucao {
  id: string
  template_id: string
  area_id: string
  tipo: ChecklistTipo
  data: string
  preenchido_por: string
  horario_inicio: string
  horario_fim: string | null
  status: 'em_andamento' | 'concluido'
}

export interface ChecklistResposta {
  id: string
  execucao_id: string
  item_id: string
  valor: string | null
  observacao: string | null
  atualizado_por?: string | null
  updated_at?: string
}

export interface Aprovacao {
  id: string
  execucao_id: string
  aprovado_por: string
  role_no_momento: UserRole
  horario_aprovacao: string
}
