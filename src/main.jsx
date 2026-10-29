import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Bootstrap i18n BEFORE App renders, so the very first paint already
// uses the user's saved or browser-detected language. The import has
// the side effect of calling i18n.init() in ./i18n/index.js.
import './i18n'
import App from './App.jsx'
import UpdateAvailableToast from './Components/Common/UpdateAvailableToast'
import { migrateLegacyPlatformSession } from './utils/authStorage'
import { initSentry, Sentry } from './utils/sentry'

// Error reporting: no-op unless VITE_SENTRY_DSN is set at build time.
const sentryOn = initSentry()

// One-time move of a Super Admin session from the shared staff_* keys to
// its own platform_* keys (see utils/authStorage). Runs before the first
// render so no request goes out with the old layout.
migrateLegacyPlatformSession()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {sentryOn ? (
      <Sentry.ErrorBoundary fallback={<p style={{ padding: 24 }}>Something went wrong. Please reload the page.</p>}>
        <App />
      </Sentry.ErrorBoundary>
    ) : (
      <App />
    )}
    {/* PWA: "new version ready — Reload" bar. Lives outside App's router
        so it is visible on every screen (see hooks/useServiceWorkerUpdate). */}
    <UpdateAvailableToast />
  </StrictMode>,
)
