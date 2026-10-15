import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'] },
      manifest: {
        id: '/',
        name: 'DayFlow — مخططي الشخصي',
        short_name: 'DayFlow',
        description: 'مخطط شخصي للمهام والمواعيد والإجازات',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#EEF2F6',
        theme_color: '#102A43',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'اليوم', url: '/?view=today' },
          { name: 'إضافة سريعة', url: '/?add=1' },
        ],
      },
    }),
  ],
})
