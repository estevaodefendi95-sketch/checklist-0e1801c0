import { ler } from './armazenamento'

export const MODO_KEY = 'paggio-modo-mobile'
export const celular = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
/** Tela inicial do atendimento: no celular em modo Atendimento é o "Atendimento rápido" (estilo maquininha); no resto, o Salão. */
export const inicioAtendimento = () => (celular() && ler<string>(MODO_KEY, 'atendimento') === 'atendimento' ? '/atendimento' : '/pdv')
