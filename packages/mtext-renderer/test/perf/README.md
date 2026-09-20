# Performance benchmarks (`pnpm bench`)

Measures glyph geometry and `MText.syncDraw` cost for mesh (CJK/TTF) and SHX
paths. Results are printed as tables and saved under `.bench-results/` so the
next run can show `%` deltas.

## Run

```bash
cd packages/mtext-renderer
pnpm bench
```

First run downloads fonts into `.font-cache/` (gitignored). Later runs reuse
the cache so timings are not dominated by CDN latency.

## Suites

| File | What it measures |
|------|------------------|
| `meshGlyph.bench.test.ts` | CJK `toGeometry` first height vs extra heights; MText draw (long text, mixed heights, many entities) |
| `shxGlyph.bench.test.ts` | ASCII SHX cold/warm/multi-size; MText draw |

## Reading the mesh multi-size metrics

| Metric | Meaning |
|--------|---------|
| `first_height_unique_cjk_toGeometry` | Cold triangulation for unique CJK at one height |
| `extra_heights_unique_cjk_toGeometry` | Same glyphs at the other heights (should be cheap with unit-size cache) |
| `multi_size_vs_naive_speedup` | `first × heightCount / allHeights` — target near the height count (~8×) |
| `cache_entries_after_multi_size` | Should stay ≈ unique char count, not `chars × sizes` |

Absolute ms numbers jitter between runs (GC / CPU). Prefer **speedup** and
**cache_entries** when judging a change; use ms deltas only as a secondary signal.

## Comparing changes

1. `pnpm bench` on baseline — writes `.bench-results/*.json`
2. Apply your change (rebuild package if consumers need `dist`)
3. `pnpm bench` again — comparison table shows `%` vs the previous run
