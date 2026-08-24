import { Link, useNavigate } from 'react-router-dom'
import { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

const roleLabel: Record<string, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  visualizador: 'Visualizador',
}

export function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/" className="display text-lg font-medium tracking-tight">
            checklist
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-ink-soft hover:text-ink">
              áreas
            </Link>
            <Link to="/historico" className="text-ink-soft hover:text-ink">
              histórico
            </Link>
            <Link to="/relatorio" className="text-ink-soft hover:text-ink">
              relatório
            </Link>
            {profile?.role === 'admin' && (
              <>
                <Link to="/admin/templates" className="text-ink-soft hover:text-ink">
                  modelos
                </Link>
                <Link to="/admin/usuarios" className="text-ink-soft hover:text-ink">
                  usuários
                </Link>
              </>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right leading-tight">
              <div className="text-ink">{profile?.nome}</div>
              <div className="text-xs text-ink-soft">
                {profile ? roleLabel[profile.role] : ''}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded border border-line px-2 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink"
            >
              sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  )
}
