import { defineConfig } from 'vite'
import { resolve } from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      // Use package source in dev so worker lazy-loading changes apply without rebuilding dist.
      '@mlightcad/mtext-renderer': resolve(
        __dirname,
        '../mtext-renderer/src/index.ts'
      ),
      // iconv-lite (used by SHX bigfont encoding) probes stream.Transform at init.
      stream: resolve(__dirname, 'src/shims/stream.ts')
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html')
      },
      output: {
        format: 'es'
      }
    }
  },
  optimizeDeps: {
    include: ['three']
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: '../mtext-renderer/dist/mtext-renderer-worker.js',
          dest: 'assets'
        }
      ]
    })
  ]
})
