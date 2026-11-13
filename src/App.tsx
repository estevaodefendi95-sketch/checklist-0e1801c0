import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { PermissoesProvider } from './context/PermissoesContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { ChecklistExecucao } from './pages/ChecklistExecucao'
import { Historico } from './pages/Historico'
import { Relatorio } from './pages/Relatorio'
import { RelatorioEstoque } from './pages/RelatorioEstoque'
import { AdminTemplates } from './pages/AdminTemplates'
import { Usuarios } from './pages/Usuarios'
import { Insumos } from './pages/Insumos'
import { Fornecedores } from './pages/Fornecedores'
import { Cardapios } from './pages/Cardapios'
import { Fichas } from './pages/Fichas'
import { FichaDetalhe } from './pages/FichaDetalhe'
import { FichaEditor } from './pages/FichaEditor'
import { FichaCozinha } from './pages/FichaCozinha'
import { PdvSalao } from './pages/pdv/PdvSalao'
import { Comanda } from './pages/pdv/Comanda'
import { PdvCaixa } from './pages/pdv/PdvCaixa'
import { PdvRelatorios } from './pages/pdv/PdvRelatorios'
import { PdvConfig } from './pages/pdv/PdvConfig'
import { AReceber } from './pages/pdv/AReceber'
import { AtendimentoRapido } from './pages/pdv/AtendimentoRapido'
import { GestaoTablet } from './pages/pdv/GestaoTablet'
import { MesaPublica } from './pages/pdv/MesaPublica'
import { DashboardSalao } from './pages/pdv/DashboardSalao'
import { MesaEscolher } from './components/TabletAcesso'
import { Compras } from './pages/Compras'
import { Eventos } from './pages/pdv/Eventos'
import { Comandas } from './pages/pdv/Comandas'
import { Crm } from './pages/pdv/Crm'
import { Reservas } from './pages/pdv/Reservas'
import { ConsumoFuncionarios } from './pages/pdv/ConsumoFuncionarios'
import { EstoqueAlertas } from './pages/EstoqueAlertas'
import { WhatsApp } from './pages/pdv/WhatsApp'
import { CardapioPublico, ReservarPublico } from './pages/pdv/PaginasPublicas'
import { AvisoAtualizacao } from './components/AvisoAtualizacao'
import { Permissao, usePermissoes } from './context/PermissoesContext'
import { ler } from './lib/armazenamento'
import { AvisoOffline } from './components/AvisoOffline'
import { AprovacoesAdmin } from './components/AprovacoesAdmin'
import { ExigeOperador, OperadorProvider } from './context/OperadorContext'

/** Ao abrir o app no celular em modo Atendimento, a primeira tela é o Salão (e não o painel de gestão). */
function Abertura() {
  const { pode, carregado } = usePermissoes()
  if (!carregado) return null
  let jaAbriu = true
  try { jaAbriu = sessionStorage.getItem('paggio-abriu') === '1'; sessionStorage.setItem('paggio-abriu', '1') } catch { /* sem armazenamento */ }
  const celular = window.matchMedia('(max-width: 1023px)').matches
  const soAtendimento = pode('pdv_operar') && !pode('pdv_ver_gestao')
  if (soAtendimento && celular) return <Navigate to="/atendimento" replace />
  if (!celular && pode('pdv_operar')) return <DashboardSalao />
  if (!jaAbriu && celular && pode('pdv_operar') && ler<string>('paggio-modo-mobile', 'atendimento') === 'atendimento') return <Navigate to="/atendimento" replace />
  return <Dashboard modo="hoje" />
}

function SemAcesso() {
  return <div className="p-8 text-center text-ink-soft">Você não tem acesso a esta tela. Peça ao administrador.</div>
}
function Gate({ p, children }: { p: Permissao; children: React.ReactNode }) {
  const { pode, carregado } = usePermissoes()
  if (!carregado) return null
  return pode(p) ? <>{children}</> : <SemAcesso />
}

function Protected({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  return (
    <ProtectedRoute requireRoles={admin ? ['admin'] : undefined}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

// Roteador "de dados" (createBrowserRouter): é o que permite o aviso de
// alterações não salvas antes de trocar de tela (useBlocker).
const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: <Protected><Abertura /></Protected> },
  { path: '/checklists', element: <Protected><Dashboard modo="hoje" /></Protected> },
  { path: '/areas', element: <Protected><Dashboard modo="areas" /></Protected> },
  { path: '/checklist/:templateId', element: <Protected><ChecklistExecucao /></Protected> },
  { path: '/historico', element: <Protected><Historico /></Protected> },
  { path: '/relatorio', element: <Protected><Relatorio /></Protected> },
  { path: '/relatorio/estoque', element: <Protected><RelatorioEstoque /></Protected> },
  { path: '/insumos', element: <Protected><Insumos /></Protected> },
  { path: '/fornecedores', element: <Protected><Fornecedores /></Protected> },
  { path: '/cardapios', element: <Protected><Cardapios /></Protected> },
  { path: '/fichas', element: <Protected><Fichas /></Protected> },
  { path: '/fichas/nova', element: <Protected><FichaEditor /></Protected> },
  { path: '/fichas/:id', element: <Protected><FichaDetalhe /></Protected> },
  { path: '/fichas/:id/editar', element: <Protected><FichaEditor /></Protected> },
  // modo cozinha: tela cheia, sem menu
  { path: '/fichas/:id/cozinha', element: <ProtectedRoute><FichaCozinha /></ProtectedRoute> },
  { path: '/mesa', element: <MesaEscolher /> },
  { path: '/mesa/:token', element: <MesaPublica /> },
  { path: '/cardapio', element: <CardapioPublico /> },
  { path: '/reservar', element: <ReservarPublico /> },
  { path: '/pdv', element: <Protected><ExigeOperador><PdvSalao /></ExigeOperador></Protected> },
  { path: '/atendimento', element: <Protected><ExigeOperador><AtendimentoRapido /></ExigeOperador></Protected> },
  { path: '/pdv/comanda/:id', element: <Protected><ExigeOperador><Comanda /></ExigeOperador></Protected> },
  { path: '/pdv/comandas', element: <Protected><ExigeOperador><Comandas /></ExigeOperador></Protected> },
  { path: '/pdv/crm', element: <Protected><Gate p="pdv_ver_crm"><Crm /></Gate></Protected> },
  { path: '/pdv/consumo', element: <Protected><Gate p="pdv_ver_consumo"><ConsumoFuncionarios /></Gate></Protected> },
  { path: '/estoque/alertas', element: <Protected><EstoqueAlertas /></Protected> },
  { path: '/pdv/reservas', element: <Protected><Gate p="pdv_ver_reservas"><Reservas /></Gate></Protected> },
  { path: '/whatsapp', element: <Protected><Gate p="pdv_ver_whatsapp"><WhatsApp /></Gate></Protected> },
  { path: '/pdv/caixa', element: <Protected><ExigeOperador><PdvCaixa /></ExigeOperador></Protected> },
  { path: '/pdv/a-receber', element: <Protected><AReceber /></Protected> },
  { path: '/pdv/relatorios', element: <Protected><Gate p="pdv_ver_vendas"><PdvRelatorios /></Gate></Protected> },
  { path: '/compras', element: <Protected><Compras /></Protected> },
  { path: '/pdv/eventos', element: <Protected><Eventos /></Protected> },
  { path: '/pdv/config', element: <Protected><PdvConfig /></Protected> },
  { path: '/pdv/tablet', element: <Protected><GestaoTablet /></Protected> },
  { path: '/admin/templates', element: <Protected admin><AdminTemplates /></Protected> },
  // só o administrador master (a própria tela confere eh_master e volta ao início se não for)
  { path: '/usuarios', element: <Protected><Usuarios /></Protected> },
  { path: '/admin/usuarios', element: <Navigate to="/usuarios" replace /> },
])

export default function App() {
  return (
    <AuthProvider>
      <PermissoesProvider>
        <OperadorProvider>
        <AvisoAtualizacao />
        <AvisoOffline />
        <AprovacoesAdmin />
        <RouterProvider router={router} />
        </OperadorProvider>
      </PermissoesProvider>
    </AuthProvider>
  )
}
