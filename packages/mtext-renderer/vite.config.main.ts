import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MTextRenderer',
      fileName: 'index',
      formats: ['es', 'umd']
    },
    rollupOptions: {
      // Keep parser as a shared peer so host apps (and other libs like
      // pdf-renderer) can dedupe a single @mlightcad/mtext-parser copy.
      // The worker build still inlines it for a self-contained worker file.
      external: ['three', '@mlightcad/mtext-parser'],
      output: {
        globals: {
          three: 'THREE',
          '@mlightcad/mtext-parser': 'MTextParser'
        }
      }
    }
  },
  plugins: [
    dts({
      outDir: 'lib',
      insertTypesEntry: true
    })
  ]
})
