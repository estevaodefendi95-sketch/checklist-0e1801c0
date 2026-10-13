import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { iniciarAtualizacao } from './lib/atualizacao'

// registra o service worker e cuida das atualizações do app instalado
iniciarAtualizacao()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
