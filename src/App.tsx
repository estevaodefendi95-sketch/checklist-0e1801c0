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
import { MesaPublica } from './pages/pdv/MesaPublica'
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
  { path: '/', element: <Protected><Dashboard modo="hoje" /></Protected> },
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
  { path: '/mesa/:token', element: <MesaPublica /> },
  { path: '/cardapio', element: <CardapioPublico /> },
  { path: '/reservar', element: <ReservarPublico /> },
  { path: '/pdv', element: <Protected><PdvSalao /></Protected> },
  { path: '/pdv/comanda/:id', element: <Protected><Comanda /></Protected> },
  { path: '/pdv/comandas', element: <Protected><Comandas /></Protected> },
  { path: '/pdv/crm', element: <Protected><Crm /></Protected> },
  { path: '/pdv/consumo', element: <Protected><ConsumoFuncionarios /></Protected> },
  { path: '/estoque/alertas', element: <Protected><EstoqueAlertas /></Protected> },
  { path: '/pdv/reservas', element: <Protected><Reservas /></Protected> },
  { path: '/whatsapp', element: <Protected><WhatsApp /></Protected> },
  { path: '/pdv/caixa', element: <Protected><PdvCaixa /></Protected> },
  { path: '/pdv/relatorios', element: <Protected><PdvRelatorios /></Protected> },
  { path: '/compras', element: <Protected><Compras /></Protected> },
  { path: '/pdv/eventos', element: <Protected><Eventos /></Protected> },
  { path: '/pdv/config', element: <Protected><PdvConfig /></Protected> },
  { path: '/admin/templates', element: <Protected admin><AdminTemplates /></Protected> },
  // só o administrador master (a própria tela confere eh_master e volta ao início se não for)
  { path: '/usuarios', element: <Protected><Usuarios /></Protected> },
  { path: '/admin/usuarios', element: <Navigate to="/usuarios" replace /> },
])

export default function App() {
  return (
    <AuthProvider>
      <PermissoesProvider>
        <AvisoAtualizacao />
        <RouterProvider router={router} />
      </PermissoesProvider>
    </AuthProvider>
  )
}
