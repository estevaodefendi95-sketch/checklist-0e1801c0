import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// versão exibida no rodapé: commit curto (quando o build tem git) + data/hora do build
function commitAtual() {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  define: {
    __APP_COMMIT__: JSON.stringify(commitAtual()),
    __APP_BUILD__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": o service worker novo espera; o app decide quando trocar
      // (sozinho se não houver alterações não salvas, senão pelo aviso no topo)
      registerType: 'prompt',
      // o registro é feito em src/lib/atualizacao.ts (virtual:pwa-register)
      injectRegister: false,
      // já temos manifest.webmanifest e ícones prontos em /public
      manifest: false,
      includeAssets: [
        'favicon.ico',
        'favicon-16.png',
        'favicon-32.png',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
      ],
      workbox: {
        // arquivos do build (com hash) ficam no precache; dados do Supabase exigem conexão
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // sem navigateFallback: a navegação vai primeiro para a rede (regra abaixo)
        navigateFallback: null,
        runtimeCaching: [
          {
            // index.html: rede primeiro, para cada abertura buscar a versão publicada;
            // offline (ou rede lenta), usa a cópia do cache ou o index.html do precache
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'paginas',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 20 },
              precacheFallback: { fallbackURL: 'index.html' },
            },
          },
        ],
      },
    }),
  ],
})
