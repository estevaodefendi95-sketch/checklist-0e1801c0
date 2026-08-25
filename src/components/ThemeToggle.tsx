import { useEffect, useState } from 'react'
import { applyTheme, getPreferredTheme, Theme } from '../lib/theme'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    setTheme(getPreferredTheme())
  }, [])

  function alternar() {
    const novo: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(novo)
    applyTheme(novo)
  }

  return (
    <button
      onClick={alternar}
      aria-label={theme === 'dark' ? 'ativar modo claro' : 'ativar modo escuro'}
      title={theme === 'dark' ? 'modo claro' : 'modo escuro'}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line text-ink-soft hover:border-ink hover:text-ink ${className}`}
    >
      {theme === 'dark' ? (
        // sol
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // lua
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
        </svg>
      )}
    </button>
  )
}
