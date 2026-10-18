import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages では https://<ユーザー名>.github.io/yama-map/ で公開する
const base = process.env.GITHUB_PAGES ? '/yama-map/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      workbox: {
        // MapLibre のワーカー（.mjs）もアプリ本体と一緒にキャッシュする
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,ico,webmanifest}'],
        // 一度見た地理院タイルは端末に残し、電波が弱い場所でも表示できるようにする
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gsi-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: '山マップ',
        short_name: '山マップ',
        description: '天気と季節の見どころから、今行くべき山がわかる地図',
        lang: 'ja',
        theme_color: '#1f5f4a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
