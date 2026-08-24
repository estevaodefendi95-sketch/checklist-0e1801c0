import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <h1 className="display mb-1 text-2xl font-medium">checklist</h1>
        <p className="mb-8 text-sm text-ink-soft">
          conferência diária de cozinha, bar e salão
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-ink-soft">e-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
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
              className="w-full rounded border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded border border-alert-soft bg-alert-soft px-3 py-2 text-xs text-alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-ink py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'entrando…' : 'entrar'}
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
