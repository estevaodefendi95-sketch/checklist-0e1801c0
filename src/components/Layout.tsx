import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ReactNode, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from './ThemeToggle'

const roleLabel: Record<string, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  visualizador: 'Visualizador',
}

export function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuAberto, setMenuAberto] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const links = [
    { to: '/', label: 'áreas' },
    { to: '/historico', label: 'histórico' },
    { to: '/relatorio', label: 'relatório' },
    ...(profile?.role === 'admin'
      ? [
          { to: '/admin/templates', label: 'modelos' },
          { to: '/admin/usuarios', label: 'usuários' },
        ]
      : []),
  ]

  function linkAtivo(to: string) {
    return to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="display shrink-0 text-lg font-medium tracking-tight">
            checklist
          </Link>

          {/* nav desktop */}
          <nav className="hidden flex-1 items-center gap-4 text-sm sm:flex">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={linkAtivo(l.to) ? 'text-ink' : 'text-ink-soft hover:text-ink'}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 text-sm sm:flex">
            <div className="text-right leading-tight">
              <div className="text-ink">{profile?.nome}</div>
              <div className="text-xs text-ink-soft">
                {profile ? roleLabel[profile.role] : ''}
              </div>
            </div>
            <ThemeToggle />
            <button
              onClick={handleSignOut}
              className="rounded border border-line px-2 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink"
            >
              sair
            </button>
          </div>

          {/* botão hamburguer mobile */}
          <div className="flex items-center gap-2 sm:hidden">
            <ThemeToggle />
            <button
              onClick={() => setMenuAberto((v) => !v)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line"
              aria-label="menu"
            >
              <div className="space-y-1">
                <span className="block h-0.5 w-4 bg-ink" />
                <span className="block h-0.5 w-4 bg-ink" />
                <span className="block h-0.5 w-4 bg-ink" />
              </div>
            </button>
          </div>
        </div>

        {/* menu mobile */}
        {menuAberto && (
          <nav className="border-t border-line px-4 py-3 text-sm sm:hidden">
            <div className="mb-3 flex items-center justify-between">
              <div className="leading-tight">
                <div className="text-ink">{profile?.nome}</div>
                <div className="text-xs text-ink-soft">
                  {profile ? roleLabel[profile.role] : ''}
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="rounded border border-line px-3 py-1.5 text-xs text-ink-soft"
              >
                sair
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setMenuAberto(false)}
                  className={`rounded px-2 py-2 ${
                    linkAtivo(l.to) ? 'bg-paper-dim text-ink' : 'text-ink-soft'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  )
}
