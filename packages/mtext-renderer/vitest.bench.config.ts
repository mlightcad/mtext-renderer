import { createRequire } from 'node:module'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)
const shxParserRoot = path.dirname(
  require.resolve('@mlightcad/shx-parser/package.json')
)

/**
 * Performance suite only (test/perf bench.test.ts files).
 * Invoked via `pnpm bench` — kept separate from the default unit-test run.
 */
export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    include: ['test/perf/**/*.bench.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Stable timings: avoid parallel suite interference.
    fileParallelism: false,
    sequence: {
      concurrent: false
    }
  },
  resolve: {
    alias: {
      '@mlightcad/shx-parser': path.join(shxParserRoot, 'dist/index.es.js')
    }
  }
})
