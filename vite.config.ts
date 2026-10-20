import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * 公開版のページに Content-Security-Policy を付ける（GitHub Pages ではヘッダーを付けられないので meta で指定する）。
 * スクリプトはこのサイトのものだけ、通信先はこのアプリが使うサービスだけに限ることで、
 * 万一スクリプトが紛れ込んでも API キーなどを外へ送れないようにする。
 * 開発サーバーはインラインのスクリプトを使うので、ビルドしたときだけ付ける
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "worker-src 'self' blob:",
    // React のインラインの style 属性と MapLibre の要素スタイルのため
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://cyberjapandata.gsi.go.jp",
    'connect-src ' +
      [
        "'self'",
        'data:',
        'blob:',
        'https://cyberjapandata.gsi.go.jp',
        'https://demotiles.maplibre.org',
        'https://api.open-meteo.com',
        'https://api.anthropic.com',
      ].join(' '),
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  }
}

// GitHub Pages では https://<ユーザー名>.github.io/yama-map/ で公開する
const base = process.env.GITHUB_PAGES ? '/yama-map/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  // 設定画面の「このアプリについて」に出すビルド日時
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
      workbox: {
        // MapLibre のワーカー（.mjs）もアプリ本体と一緒にキャッシュする
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,ico,webmanifest}'],
        // 一度見た地理院タイルは端末に残し、電波が弱い場所でも表示できるようにする
        runtimeCaching: [
          {
            // 天気予報。電波があれば最新を取り、なければ前に見た予報を出す
            urlPattern: /^https:\/\/api\.open-meteo\.com\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'forecast',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 山のデータ・アクセス情報。手元の版をすぐ使い、裏で新しい版を取り直す
            urlPattern: /\/data\/(.*\.geojson|access\.json)$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'app-data' },
          },
          {
            // 毎朝のおすすめデータ。新しいものを優先し、電波がなければ前回の分を使う
            urlPattern: /\/data\/recommendations\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'recommendations', networkTimeoutSeconds: 8 },
          },
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
