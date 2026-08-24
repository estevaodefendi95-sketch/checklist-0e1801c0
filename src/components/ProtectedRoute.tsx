import { Navigate } from 'react-router-dom'
import { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { UserRole } from '../lib/types'

export function ProtectedRoute({
  children,
  requireRoles,
}: {
  children: ReactNode
  requireRoles?: UserRole[]
}) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-soft text-sm">
        Carregando…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (requireRoles && profile && !requireRoles.includes(profile.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
