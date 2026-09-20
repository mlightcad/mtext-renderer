import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
)

export const BENCH_RESULTS_DIR = path.join(packageRoot, '.bench-results')

export interface TimingStats {
  /** Median sample in milliseconds. */
  medianMs: number
  /** Arithmetic mean in milliseconds. */
  meanMs: number
  /** Fastest sample in milliseconds. */
  minMs: number
  /** Slowest sample in milliseconds. */
  maxMs: number
  /** Individual run durations. */
  samplesMs: number[]
}

export interface BenchMetric {
  name: string
  /** Primary number used for before/after comparison (usually medianMs). */
  value: number
  unit?: string
  note?: string
}

/**
 * Runs `fn` for `warmup` discarded iterations, then records `runs` timed samples.
 */
export function measureMs(
  fn: () => void,
  options: { warmup?: number; runs?: number } = {}
): TimingStats {
  const warmup = options.warmup ?? 1
  const runs = options.runs ?? 5

  for (let i = 0; i < warmup; i++) {
    fn()
  }

  const samplesMs: number[] = []
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    fn()
    samplesMs.push(performance.now() - start)
  }

  const sorted = [...samplesMs].sort((a, b) => a - b)
  const sum = samplesMs.reduce((acc, value) => acc + value, 0)
  return {
    medianMs: sorted[Math.floor(sorted.length / 2)]!,
    meanMs: sum / samplesMs.length,
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
    samplesMs
  }
}

/**
 * Formats a millisecond value for console tables.
 */
export function formatMs(value: number): string {
  if (value < 1) {
    return `${(value * 1000).toFixed(0)}µs`
  }
  if (value < 10) {
    return `${value.toFixed(2)}ms`
  }
  return `${value.toFixed(1)}ms`
}

/**
 * Formats a metric value for console tables.
 */
export function formatMetricValue(metric: BenchMetric): string {
  if (metric.unit === '×') {
    return `${metric.value.toFixed(2)}×`
  }
  if (metric.unit === 'entries') {
    return `${Math.round(metric.value)} entries`
  }
  return formatMs(metric.value)
}

/**
 * Prints a titled console.table and returns the same rows for chaining.
 */
export function printReport(
  title: string,
  rows: Array<Record<string, string | number>>
): void {
  // eslint-disable-next-line no-console
  console.log(`\n[bench] ${title}`)
  // eslint-disable-next-line no-console
  console.table(rows)
}

/**
 * Persists metrics under `.bench-results/` and prints deltas vs the previous run.
 */
export async function saveAndCompare(
  suiteName: string,
  metrics: BenchMetric[]
): Promise<void> {
  await mkdir(BENCH_RESULTS_DIR, { recursive: true })
  const filePath = path.join(BENCH_RESULTS_DIR, `${suiteName}.json`)

  let previous: { metrics: BenchMetric[]; at: string } | undefined
  try {
    previous = JSON.parse(await readFile(filePath, 'utf8')) as {
      metrics: BenchMetric[]
      at: string
    }
  } catch {
    previous = undefined
  }

  const payload = {
    at: new Date().toISOString(),
    metrics
  }
  await writeFile(filePath, JSON.stringify(payload, null, 2))

  const prevByName = new Map(
    (previous?.metrics ?? []).map(metric => [metric.name, metric])
  )

  const comparison = metrics.map(metric => {
    const prior = prevByName.get(metric.name)
    const delta =
      prior && prior.value > 0
        ? ((metric.value - prior.value) / prior.value) * 100
        : undefined
    return {
      metric: metric.name,
      now: formatMetricValue(metric),
      previous: prior ? formatMetricValue(prior) : '—',
      delta:
        delta === undefined
          ? '—'
          : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`,
      note: metric.note ?? ''
    }
  })

  printReport(
    `${suiteName} (vs previous run${previous ? ` @ ${previous.at}` : ''})`,
    comparison
  )
}
