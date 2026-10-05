/**
 * Vitest config — reuses the app's Vite config (react-swc, tailwind and the
 * vite-jsconfig-paths aliases from jsconfig.json) so tests resolve imports
 * exactly like the app does. Only the `test` block is added here; the dev
 * server / build settings in vite.config.js are left untouched.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default defineConfig((env) => mergeConfig(
  typeof viteConfig === 'function' ? viteConfig(env) : viteConfig,
  {
    test: {
      environment: 'jsdom',
      environmentOptions: { jsdom: { url: 'http://localhost:5173/' } },
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.{test,spec}.{js,jsx}'],
      restoreMocks: true,
      unstubGlobals: true,
      unstubEnvs: true,
      coverage: {
        provider: 'v8',
        // Known-bug tests (named "BUG: ...") fail on purpose; still report.
        reportOnFailure: true,
        reporter: ['text', 'html', 'json-summary'],
        reportsDirectory: './coverage',
        include: ['src/**/*.{js,jsx}'],
        exclude: ['src/**/*.{test,spec}.{js,jsx}', 'src/test/**', 'src/__tests__/**'],
      },
    },
  },
))
