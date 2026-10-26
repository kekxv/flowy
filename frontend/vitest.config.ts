import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    environmentOptions: {
      happyDOM: {
        // Happy DOM 21 disables iframe loading by default; print previews use
        // an about:blank iframe populated by the application.
        settings: { enableIframePageLoading: true },
      },
    },
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/test/**'],
    },
  },
})
