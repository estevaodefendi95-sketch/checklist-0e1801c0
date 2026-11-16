import { Link } from 'react-router-dom'
import { inicioAtendimento } from '../../lib/modo'
import { AvisoBateriaTablets } from './BateriaTablets'
import { Cabecalho } from '../../components/Cabecalho'
import { btnCls } from '../../components/Estado'
import { ResumoDia } from './ResumoDia'
import { MapaSalaoAgora } from './MapaSalaoAgora'

/** Tela inicial: faturamento e comandas do dia. Só consulta (nada aqui edita). Para operar, o garçom vai ao Salão e informa o PIN. */
export function DashboardSalao() {
  return (
    <div>
      <Cabecalho
        titulo="Salão agora"
        subtitulo="Resultado do dia, mapa do salão e pedidos de cada cliente · atualiza sozinho"
        acoes={<Link to={inicioAtendimento()} className={btnCls}>Ir para o Salão e mesas</Link>}
      />
      <AvisoBateriaTablets />
      <ResumoDia mapa={<MapaSalaoAgora />} />
    </div>
  )
}
