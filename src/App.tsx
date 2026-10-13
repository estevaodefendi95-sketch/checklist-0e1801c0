import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { PermissoesProvider } from './context/PermissoesContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { ChecklistExecucao } from './pages/ChecklistExecucao'
import { Historico } from './pages/Historico'
import { Relatorio } from './pages/Relatorio'
import { AdminTemplates } from './pages/AdminTemplates'
import { AdminUsuarios } from './pages/AdminUsuarios'
import { Insumos } from './pages/Insumos'
import { Fornecedores } from './pages/Fornecedores'
import { Cardapios } from './pages/Cardapios'
import { Fichas } from './pages/Fichas'
import { FichaDetalhe } from './pages/FichaDetalhe'
import { FichaEditor } from './pages/FichaEditor'
import { FichaCozinha } from './pages/FichaCozinha'

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
  { path: '/insumos', element: <Protected><Insumos /></Protected> },
  { path: '/fornecedores', element: <Protected><Fornecedores /></Protected> },
  { path: '/cardapios', element: <Protected><Cardapios /></Protected> },
  { path: '/fichas', element: <Protected><Fichas /></Protected> },
  { path: '/fichas/nova', element: <Protected><FichaEditor /></Protected> },
  { path: '/fichas/:id', element: <Protected><FichaDetalhe /></Protected> },
  { path: '/fichas/:id/editar', element: <Protected><FichaEditor /></Protected> },
  // modo cozinha: tela cheia, sem menu
  { path: '/fichas/:id/cozinha', element: <ProtectedRoute><FichaCozinha /></ProtectedRoute> },
  { path: '/admin/templates', element: <Protected admin><AdminTemplates /></Protected> },
  { path: '/admin/usuarios', element: <Protected admin><AdminUsuarios /></Protected> },
])

export default function App() {
  return (
    <AuthProvider>
      <PermissoesProvider>
        <RouterProvider router={router} />
      </PermissoesProvider>
    </AuthProvider>
  )
}
