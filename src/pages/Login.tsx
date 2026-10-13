import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from '../components/ThemeToggle'
import { inputCls, btnCls } from '../components/Estado'

export function Login() {
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) setError('E-mail ou senha incorretos.')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <h1 className="font-display text-5xl font-semibold leading-none text-brand">Paggio</h1>
        <div className="mb-2 mt-1 text-xs uppercase tracking-[0.08em] text-ink-soft">Operação</div>
        <p className="mb-8 text-sm text-ink-soft">
          checklists, fichas técnicas e cardápios
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-ink-soft">e-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="voce@restaurante.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-ink-soft">senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-[10px] bg-alert-soft px-3 py-2 text-sm text-alert" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`${btnCls} w-full`}
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-xs text-ink-soft">
          Contas são criadas pelo administrador. Fale com quem gerencia o sistema
          se você ainda não tem acesso.
        </p>
      </div>
    </div>
  )
}
