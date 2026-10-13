import { BrowserRouter, Routes, Route } from 'react-router-dom'
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

function Protected({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  return (
    <ProtectedRoute requireRoles={admin ? ['admin'] : undefined}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <PermissoesProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route
              path="/checklist/:templateId"
              element={<Protected><ChecklistExecucao /></Protected>}
            />
            <Route path="/historico" element={<Protected><Historico /></Protected>} />
            <Route path="/relatorio" element={<Protected><Relatorio /></Protected>} />
            <Route path="/insumos" element={<Protected><Insumos /></Protected>} />
            <Route path="/fornecedores" element={<Protected><Fornecedores /></Protected>} />
            <Route path="/cardapios" element={<Protected><Cardapios /></Protected>} />
            <Route
              path="/admin/templates"
              element={<Protected admin><AdminTemplates /></Protected>}
            />
            <Route
              path="/admin/usuarios"
              element={<Protected admin><AdminUsuarios /></Protected>}
            />
          </Routes>
        </BrowserRouter>
      </PermissoesProvider>
    </AuthProvider>
  )
}
