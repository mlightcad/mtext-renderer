import { createRequire } from 'node:module'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)
const shxParserRoot = path.dirname(
  require.resolve('@mlightcad/shx-parser/package.json')
)

export default defineConfig({
  test: {
    testTimeout: 30_000
  },
  resolve: {
    alias: {
      // Vitest loads this package as ESM; point at the ESM build instead of index.cjs.js.
      '@mlightcad/shx-parser': path.join(shxParserRoot, 'dist/index.es.js')
    }
  }
})
