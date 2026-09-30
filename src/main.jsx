import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Bootstrap i18n BEFORE App renders, so the very first paint already
// uses the user's saved or browser-detected language. The import has
// the side effect of calling i18n.init() in ./i18n/index.js.
import './i18n'
import App from './App.jsx'
import { migrateLegacyPlatformSession } from './utils/authStorage'

// One-time move of a Super Admin session from the shared staff_* keys to
// its own platform_* keys (see utils/authStorage). Runs before the first
// render so no request goes out with the old layout.
migrateLegacyPlatformSession()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
