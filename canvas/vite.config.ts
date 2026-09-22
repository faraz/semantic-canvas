import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Single-file build: the Shell bundles exactly one index.html.
// Forced development NODE_ENV: tldraw needs no license key in dev builds, and
// the Shell's file:// origin would fail its production license check.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
  },
})
