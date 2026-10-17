import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import jsconfigPaths from 'vite-jsconfig-paths'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// This config is ESM (package.json "type": "module"), so there is no
// CommonJS __dirname; derive it from the module URL instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * BestoDine frontend build config.
 *
 * Everything environment-specific is read from env vars with working
 * defaults, so `npm run dev` needs no setup and a deploy needs no code
 * edit. Nothing here is hardcoded to one machine.
 */

/**
 * Optional local HTTPS.
 *
 * Some browser APIs (and Google Identity Services in certain
 * configurations) behave differently on http://. `localhost` is treated
 * as a secure origin so plain HTTP is fine day to day — this exists for
 * when you need to test over the LAN from a phone, where the origin is
 * an IP and therefore NOT secure.
 *
 * Drop `cert.pem` + `key.pem` into Frontend/certs/ and HTTPS turns
 * itself on. With no certs present this returns undefined and Vite
 * serves HTTP, rather than crashing on a missing file — which is what
 * happens if you reference a cert path that isn't there.
 *
 * Generate a pair with mkcert (trusted, no browser warning):
 *   mkcert -install
 *   mkcert -cert-file certs/cert.pem -key-file certs/key.pem localhost 127.0.0.1 ::1
 */
function resolveHttps() {
  const dir = path.resolve(__dirname, 'certs')
  const cert = path.join(dir, 'cert.pem')
  const key = path.join(dir, 'key.pem')
  try {
    if (fs.existsSync(cert) && fs.existsSync(key)) {
      return { cert: fs.readFileSync(cert), key: fs.readFileSync(key) }
    }
  } catch {
    // An unreadable cert must not stop the dev server booting.
  }
  return undefined
}

/** Split "a,b , c" into ['a','b','c']. */
const list = (value, fallback = []) => {
  if (!value) return fallback
  return String(value).split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * Installable PWA (DESKTOP_AND_PWA_PLAN.md, Part 1).
 *
 * What the service worker does: precache the built app shell (js / css /
 * html / fonts / small images) so "Install app" works on Android Chrome
 * and the shell loads instantly. What it must NEVER do: cache anything
 * live. `/api`, `/socket.io`, `/uploads`, Cloudinary, Razorpay and Google
 * are NetworkOnly — a cached order list or a cached payment page would be
 * a real bug, so those are listed explicitly rather than left to the
 * default. Offline-first is out of scope for this phase.
 *
 * `registerType: 'autoUpdate'` makes a new deploy take over on the next
 * load; src/hooks/useServiceWorkerUpdate.js surfaces an "Update available"
 * toast so a kitchen screen that never reloads can be refreshed by hand.
 */
function pwaPlugin() {
  // Hosts that serve live data or third-party scripts. Never cached.
  const NETWORK_ONLY_ORIGINS = /^https:\/\/([a-z0-9-]+\.)*(cloudinary\.com|razorpay\.com|google\.com|googleapis\.com|gstatic\.com|googleusercontent\.com)(\/|$)/i
  const networkOnly = (pattern) => ({ urlPattern: pattern, handler: 'NetworkOnly' })

  return VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg', 'favicon.ico', 'pwa/apple-touch-icon.png'],
    manifest: {
      name: 'BestoDine',
      short_name: 'BestoDine',
      description: 'Restaurant ordering, billing and kitchen display',
      theme_color: '#FE8301',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      icons: [
        { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
      shortcuts: [
        { name: 'Staff login', url: '/staff-login', icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }] },
        { name: 'Kitchen display', url: '/chef/dashboard', icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }] },
        { name: 'Kiosk', url: '/kiosk', icons: [{ src: '/pwa/icon-192.png', sizes: '192x192' }] },
      ],
    },
    workbox: {
      // Only the app shell: the hashed bundles + index.html + the PWA
      // icons (~5 MB). The loose images in public/ (marketing art,
      // kiosk media — 27 MB+) are served normally but never precached;
      // every install would otherwise download them.
      // (favicons + apple-touch-icon come in via includeAssets above.)
      globPatterns: [
        'index.html',
        'assets/**/*.{js,css,woff2,svg,png}',
        'pwa/icon-*.png',
      ],
      globIgnores: ['**/kiosk/**', '**/node_modules/**'],
      // The plugin fails the build when any matched file exceeds this.
      // 3 MB keeps the largest vendor chunks in and catches a stray
      // large asset landing in assets/.
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      // SPA deep links (/admin/orders, /chef/dashboard) resolve to the
      // shell; backend-served paths never do.
      navigateFallback: '/index.html',
      navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/uploads\//],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      runtimeCaching: [
        // Same-origin live endpoints.
        networkOnly(({ url }) => url.pathname.startsWith('/api/')),
        networkOnly(({ url }) => url.pathname.startsWith('/socket.io/')),
        networkOnly(({ url }) => url.pathname.startsWith('/uploads/')),
        // Third-party live / payment / auth origins (also Cloudinary — the
        // plan keeps menu images uncached so edits show immediately).
        networkOnly(NETWORK_ONLY_ORIGINS),
        // The flaticon icon-font CSS + font files linked from index.html
        // are versioned and immutable, so caching them is safe and makes
        // the installed app's icons render without a network round-trip.
        {
          urlPattern: /^https:\/\/(cdn-uicons\.flaticon\.com|cdn\.jsdelivr\.net\/npm\/@flaticon)\//i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'bestodine-icon-fonts',
            expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
    // Dev server stays plain Vite (no SW): HMR and the API proxy behave
    // exactly as before. Build with `npm run build` + `npm run preview`
    // to exercise the installed experience.
    devOptions: { enabled: false },
  })
}

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_* to client code. loadEnv lets the CONFIG
  // read any var — so ports and hosts can live in .env alongside
  // everything else instead of being baked in here.
  const env = loadEnv(mode, __dirname, '')

  const devPort = Number(env.VITE_DEV_PORT) || 5173
  const previewPort = Number(env.VITE_PREVIEW_PORT) || 4173

  // Where the Express API actually listens. Backend/.env PORT=5000.
  const apiTarget = env.VITE_PROXY_TARGET || 'http://localhost:5000'

  const https = resolveHttps()

  // Proxy rules. These matter only when VITE_API_URL is a RELATIVE path
  // (e.g. `/api/v1`). With the current absolute value
  // (http://localhost:5000/api/v1) the browser talks to the backend
  // directly and these rules are never consulted — see the note in
  // .env.example. Both paths are supported deliberately; the proxy is
  // the better one because it removes cross-origin requests from dev
  // entirely, matching how nginx serves the two in production.
  const proxy = {
    // Backend mounts its router at /api/v1 (see Backend/app.js).
    '/api': {
      target: apiTarget,
      changeOrigin: true,
      // `secure: false` permits a self-signed cert on the TARGET. It
      // does not weaken anything the browser sees, and only applies
      // when apiTarget is https://.
      secure: false,
      ws: true,
    },
    // Backend serves uploaded images from /uploads as static files
    // (Backend/app.js, express.static with maxAge 7d).
    '/uploads': {
      target: apiTarget,
      changeOrigin: true,
      secure: false,
    },
    // socket.io's transport endpoint. Live orders, the kitchen display
    // and notifications all ride this; without the rule they silently
    // fail to connect whenever the app is served over the proxy.
    '/socket.io': {
      target: apiTarget,
      changeOrigin: true,
      secure: false,
      ws: true,
    },
  }

  // Hosts Vite will answer to. Vite blocks unknown Host headers by
  // default (DNS-rebinding protection), which is what makes a tunnel or
  // a staging domain return "Blocked request" until it's listed here.
  const allowedHosts = list(env.VITE_ALLOWED_HOSTS, [
    'localhost',
    '127.0.0.1',
    'bestodine.com',
    'www.bestodine.com',
  ])

  return {
    // tailwindcss() is REQUIRED — Tailwind v4 has no PostCSS step, the
    // Vite plugin IS the compiler. Remove it and every style in the app
    // disappears. jsconfigPaths() resolves the path aliases in
    // jsconfig.json; without it those imports fail to resolve.
    plugins: [react(), tailwindcss(), jsconfigPaths(), pwaPlugin()],

    server: {
      port: devPort,
      // Fail loudly rather than silently shifting to the next free
      // port. A silent shift breaks the Google OAuth origin, the
      // backend's ALLOWED_ORIGINS and FRONTEND_URL all at once, and the
      // only symptom is confusing auth errors.
      strictPort: true,
      // Listen on all interfaces so a phone on the same Wi-Fi can load
      // the app (QR-scan and dine-in flows are hard to test otherwise).
      // Pair with CORS_ALLOW_LAN=true in Backend/.env.
      host: true,
      https,
      proxy,
      allowedHosts,
    },

    // `vite preview` serves the real production build. Use it to verify
    // a build before deploying — the dev server's behaviour differs.
    preview: {
      port: previewPort,
      strictPort: true,
      host: true,
      https,
      proxy,
      allowedHosts,
    },

    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
    },

    build: {
      // Matches the browsers Vite's own default targets; bumped from
      // 'modules' only if you need older Safari.
      target: 'es2020',
      rollupOptions: {
        output: {
          // Hand-split vendors so one dependency bump doesn't
          // invalidate the whole app bundle in every user's cache.
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['framer-motion', 'lucide-react', 'react-hot-toast'],
            'vendor-socket': ['socket.io-client'],
          },
        },
      },
      commonjsOptions: {
        // Some deps (xlsx, file-saver) ship CJS that mixes require and
        // ESM. Without this they break only in the production build,
        // never in dev — the worst failure mode.
        transformMixedEsModules: true,
      },
      chunkSizeWarningLimit: 500,
      // Off by default: source maps published to a public server hand
      // readers your original source. Set VITE_SOURCEMAP=true for a
      // one-off debug build, or 'hidden' to generate maps for an error
      // tracker without referencing them from the shipped bundle.
      sourcemap: env.VITE_SOURCEMAP === 'true'
        ? true
        : env.VITE_SOURCEMAP === 'hidden'
          ? 'hidden'
          : false,
      // Gzip-size reporting walks every asset; skipping it is a
      // measurable build-time win in CI and tells you nothing your
      // server's own compression doesn't.
      reportCompressedSize: false,
    },
  }
})
