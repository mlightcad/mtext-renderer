# Text Render Performance Guide

This document explains the performance work we did for **mesh (TTF/OTF) MText** — from opening a drawing to putting glyphs on screen. It covers two packages:

| Package | What it owns |
|---------|----------------|
| `@mlightcad/mtext-renderer` | Glyphs, fonts, per-entity merge, and profiling |
| `@mlightcad/cad-simple-viewer` | Open pipeline, scene batching, visibility, and highlight |

**Typical test drawings:** dense Chinese mesh text (beam / slab / stair DWGs). Lots of characters, many font sizes, heavy font load.

**What profiling actually showed:** triangulating outlines is *not* the main bottleneck. The expensive parts are:

1. **Too many tiny merge batches inside each entity** (lots of small geometries and draw work)
2. **Wasted time on the font request / wait path** (awaiting fonts that will never arrive, or waiting when nothing needs to load)

In other words: we were spending time on “glue” and waiting, not on the math of turning curves into triangles.

---

## 1. Goals and measured results

| Goal | Why it matters |
|------|----------------|
| Shorter time-to-interactive | Users care about wall-clock for convert / draw / merge / scene build |
| Less GPU/CPU pressure on the mesh path | Fewer draw calls, less duplicate geometry, fewer pointless font awaits |
| Measurable regressions | Compare before/after with `TextRenderProfiler` + OPENPROF / CLI logs |

**Ballpark numbers** (same text-heavy drawing, main thread, mesh glyph instancing on):

| Stage | Before (approx.) | After (approx.) |
|-------|------------------|-----------------|
| convert (including font wait) | ~26s | ~11–14s |
| open + idle (including scene batching) | ~43s | ~24s |
| `mergeMesh` | Dominated by tiny per-entity batches | **0** (scene `InstancedMesh` takes over) |
| placement / bucket | — | ~258k placements / ~2310 buckets |

Numbers move with machine speed and whether fonts are already cached. Always compare with the **same** CLI / OPENPROF setup.

---

## 2. Optimizations (from simple ideas to the big win)

Think of mesh text as three steps:

1. **Get the font** (download / parse / cache)
2. **Turn each character into geometry** (triangulate outlines)
3. **Put many characters into the scene** (merge or instance)

Most of the wins below attack (1) and (3). Step (2) was already “good enough” once we cached unit-size glyphs.

### 2.1 Unit-size glyph cache

**Idea in plain terms:** triangulate each character once at size “1”, then scale it when you place it. If the same Chinese character appears at 2.5 and at 5.0, you do **not** triangulate twice.

| Setting | Value | Role |
|---------|-------|------|
| `MESH_GLYPH_CACHE_SIZE` | `1` | Cache only the unit-size outline mesh |
| Placement scale | `geometryScale` ≈ requested height | Apply size at draw time |
| `MESH_GLYPH_CURVE_SEGMENTS` | `4` | Curve sampling quality; fine for open time |

**Details:**

- Fill and stroke use **different cache variants** so they do not overwrite each other.
- Profiling said: lowering `curveSegments` further is **not** where open time goes. Do not prioritize it.

**Code:** `meshGlyphGeometry.ts`, `meshTextShape.ts`, `CharGeometryCache`.

### 2.2 Font-level caching

Getting a font ready is often slower than drawing one glyph. So we cache at two layers:

1. **In memory** — reuse an already-parsed font object in the same session
2. **IndexedDB** (`enableFontCache`, default `true`) — keep parse results across reloads so a second open is much faster

For benches / CLI, CDN or self-hosted fonts plus a local `.font-cache` folder also cut download wait.

### 2.3 Font request fast path (`requestFonts` / NotFound)

**Problem:** During a concurrent open, many code paths `await requestFonts(...)`. If a font is missing (`NotFound`), we used to keep trying / waiting. That inflated `requestFontsMs` even when there was nothing useful to wait for.

**What we do** (`FontManager` + `MText` / `Shape`):

| Mechanism | Behavior |
|-----------|----------|
| `needsFontLoad` | Only enter the await path when a load is actually required |
| `fontRequestAbsent` (sticky) | After the resolver says NotFound, remember it and short-circuit later requests |
| Open-path cleanup | Drop pointless `await requestFonts(...)` on the hot path |

**Analogy:** do not keep knocking on a door you already know is empty.

**Code:** `packages/mtext-renderer/src/font/fontManager.ts`, `renderer/mtext.ts`, `renderer/shape.ts`.

### 2.4 Layout and per-entity overhead

Small costs add up when you have tens of thousands of entities:

- Reuse / cache `getFonts` results so we do not re-parse the font set repeatedly
- On the open path, skip expand / side work that is not needed for drawing
- `collectCharBoxes` is off by default during open draw (turn on only when you need boxes)

### 2.5 SHX and materials

- SHX stroke geometry also goes through the character geometry cache
- Styles / materials are reused so we do not create a new material per character (see style manager and the draw path)

### 2.6 Worker and render modes

| Option | Notes |
|--------|--------|
| `meshFontRenderMode`: `mesh` \| `line` | Line mode can skip triangulation; looks different |
| Unified / WebWorker render | Can move work off the main thread |

**Important:** placement + scene `InstancedMesh` run on the **main thread only**. Under a worker, we automatically fall back to merge (see §2.9).

### 2.7 Measurable profiling (`TextRenderProfiler`)

You cannot optimize what you cannot see.

- `TextRenderProfiler` accumulates time by stage (fonts, layout, triangulation, merge, …)
- `mergeMeshDist` shows merge batch size distribution — this is how we saw “~5.3 characters per batch” fragmentation
- Hooks into cad-viewer OPENPROF / CLI logs for before/after comparisons

**Code:** `packages/mtext-renderer/src/memory/textRenderProfiler.ts`. Package bench: `pnpm bench` (see `test/perf/README.md`).

### 2.8 Per-entity merge: affine merge

**Problem:** Classic `clone → applyMatrix4 → mergeGeometries` is expensive when batches are tiny (lots of clones and temporary geometries).

**Fix:** `TextGeometryBuilder` applies an affine transform on the **unit cached glyph** and writes straight into the destination buffer — fewer clones, less intermediate geometry.

- Still useful when scene instancing is **off** (worker path, or instancing disabled)
- Use together with merge-size histograms to confirm “tiny batch” pain

**Code:** `packages/mtext-renderer/src/font/textGeometryBuilder.ts`.

### 2.9 Placement output + scene-level mesh glyph instancing

This is the largest architectural change.

**Problem:** Each MText entity used to merge its own glyphs into small meshes. Those batches were often tiny → many small `BufferGeometry` / `Mesh` objects → high draw-call and CPU merge cost. The same glyph (e.g. “梁”) across thousands of entities could not share one GPU geometry.

**Approach:**

1. **mtext-renderer** — `meshGlyphOutputMode: 'placement' | 'merge'`
   - `placement`: do **not** build a per-entity mesh; emit `MeshGlyphPlacement` records (geometry ref + transform + material / layer metadata)
   - `merge`: keep the old combine path (worker, or when instancing is off)
2. **cad-simple-viewer** — `AcTrMeshGlyphWorldBatch`
   - Bucket by `(geometry × material × layer)`
   - Build **world-space** `InstancedMesh` per bucket
   - Coalesce flush during open (~16ms) so we do not interrupt the pipeline with too many flushes
   - After parent transforms are ready, bake the world matrix so positions stay correct
3. **Default on main thread**; workers cannot carry `BufferGeometry` placements → **auto fallback to merge**
4. CLI: `--no-mesh-glyph-instancing` for A/B tests

**Analogy:** instead of welding each street sign into its own tiny sculpture, print one letter stencil and stamp it many times with different positions.

**Code:**

- `mtextProcessor.ts` / `types.ts` (placement userdata)
- `AcTrMTextRenderer` (`_meshGlyphInstancing`, default `true`, main thread only)
- `AcTrMeshGlyphWorldBatch`, `AcTrGlyphEntity`, `AcTrView2d` flush, `AcTrScene` hooks

### 2.10 Visibility and highlight after instancing

After instancing, geometry is no longer “one Mesh per entity”. We need an explicit mapping:

| Capability | Approach |
|------------|----------|
| Entity / layer show-hide | Scale instances to 0 or update the bucket — do not destroy the whole mesh |
| Select / hover highlight | Maintain overlays keyed by `objectId`; Scene select/hover hooks into the batch API |
| Entity remove | Clear matching instances and highlight overlays |

If a new interaction bypasses the Scene hooks, visibility/highlight can silently go stale.

### 2.11 Viewer open path and shared scene batching

| Mechanism | Role |
|-----------|------|
| `DEFERRED_GEOMETRY_CONCURRENCY = 8` | Caps concurrent geometry builds during open |
| Progressive render / batching | Feed the scene in chunks so the UI does not freeze for one long stretch |
| `AcTrSharedGeometryBatch` etc. | Shared batching for INSERT / linetypes (same idea as mesh glyph batching) |
| Content share keys | Identical linetypes can share geometry and avoid rebuilds |

---

## 3. How the open path fits together

```
DWG entities
  → MText / Shape draw
       ├─ FontManager.requestFonts (fast path / sticky NotFound)
       ├─ Layout + unit-cache toGeometry
       └─ meshGlyphOutputMode
            ├─ merge  → TextGeometryBuilder (affine merge) → entity Mesh
            └─ placement → MeshGlyphPlacement[]
                              → AcTrMeshGlyphWorldBatch
                                   → InstancedMesh (geom × mat × layer)
                                   → visibility / highlight overlays
```

**Suggested order when debugging or optimizing:**

1. Profile first — know where the time goes
2. Fix font wait + per-entity waste
3. Then look at merge / instancing
4. **Do not** start by tweaking `curveSegments` or wireframe LOD — the data does not support that as a first lever

More decision notes (if present locally): cad-viewer `.bench-out/TEXT_RENDER_PROFILE_DECISION.md`.

---

## 4. How to verify and regress

### 4.1 mtext-renderer micro-benchmarks

```bash
cd packages/mtext-renderer
pnpm bench
```

Watch multi-size speedup and cache entry counts (see `test/perf/README.md`). Absolute milliseconds alone are noisy across machines.

### 4.2 Open profiling (cad-viewer / simple-viewer CLI)

- Enable OPENPROF / text profile logs; compare `requestFontsMs`, `mergeMesh`, placement count, bucket count
- Main thread defaults to instancing; add `--no-mesh-glyph-instancing` for a fair A/B
- When filtering CLI logs, watch for prefixes such as `[cad-simple-viewer-cli]`

### 4.3 Functional regression checklist

- [ ] Main-thread open: mesh Chinese text position and height look correct
- [ ] Worker open: auto merge, no placement crash
- [ ] Layer on/off and entity visibility
- [ ] Select / hover highlight and clear
- [ ] With instancing off, open still works and looks the same (performance may drop)

---

## 5. Switches and constants cheat sheet

| Switch / API | Where | Default | Meaning |
|--------------|-------|---------|---------|
| `meshGlyphOutputMode` | mtext draw options | Set by viewer | `placement` / `merge` |
| `_meshGlyphInstancing` | `AcTrMTextRenderer` | `true` (main thread only) | Scene-level `InstancedMesh` |
| `--no-mesh-glyph-instancing` | simple-viewer CLI | Turns above off | A/B comparison |
| `enableFontCache` | `FontManager` | `true` | IndexedDB font cache |
| `MESH_GLYPH_CACHE_SIZE` | constant | `1` | Unit cache size |
| `MESH_GLYPH_CURVE_SEGMENTS` | constant | `4` | Curve sampling |
| `meshFontRenderMode` | render options | `mesh` | `mesh` / `line` |
| `DEFERRED_GEOMETRY_CONCURRENCY` | `AcTrView2d` | `8` | Deferred geometry concurrency |

---

## 6. Export paths (HTML / PDF)

Mesh-glyph `InstancedMesh` and exporters need explicit wiring:

| Path | Strategy |
|------|----------|
| Browser HTML | After idle, `ensureEntitiesConvertedForExport` **synchronously** `flushMeshGlyphWorldBatch`, then snapshot |
| Headless HTML (`cad-html-exporter`) | `setupExportTextRendering` **disables** instancing (merge stays on entities); defensive flush as backup |
| PDF vector glyphs | `asyncRenderMText` forces `meshGlyphOutputMode: 'merge'` (extraction needs Mesh children) |
| SVG | Does not use Three / `InstancedMesh`; no change needed |

Callers may pass `meshGlyphOutputMode: 'merge'` explicitly. `AcTrMTextRenderer` only defaults to `placement` when the mode is unspecified.

---

## 7. Known limits and follow-ups

| Topic | Status |
|-------|--------|
| **Worker** | Cannot transfer `BufferGeometry` placements → stay on merge. True worker+instancing needs a transferable geometry description |
| **Instancing semantics** | Visibility/highlight depend on `objectId` mapping; new UI that skips Scene hooks will miss updates |
| **Bucket fragmentation** | Bucket count still tracks the product of geometry × material × layer; very style-diverse drawings gain less |
| **Same layer name across layouts** | Mesh-glyph buckets key by `layerName`; multi-layout export prefers active / model-space parents |
| **Not prioritized** | Further lowering `curveSegments`, mesh wireframe LOD, blindly raising deferred concurrency |

---

## 8. Related file index

**mtext-renderer**

- `src/font/fontManager.ts` — fast path, sticky NotFound, `needsFontLoad`
- `src/font/meshGlyphGeometry.ts` / `meshTextShape.ts` — unit cache
- `src/font/textGeometryBuilder.ts` — affine merge
- `src/font/charGeometryCache.ts` — character geometry LRU
- `src/renderer/mtextProcessor.ts` / `types.ts` — placement output
- `src/memory/textRenderProfiler.ts` — profiling and merge distribution
- `test/perf/README.md` — bench notes

**cad-viewer (cad-simple-viewer)**

- `AcTrMTextRenderer` — instancing switch and placement wiring
- `AcTrMeshGlyphWorldBatch` — `InstancedMesh` buckets and highlight
- `AcTrGlyphEntity` — enqueue / bbox
- `AcTrView2d` — coalesce flush, deferred concurrency
- `AcTrScene` — visibility / select-hover hooks

---

*This doc tracks the implementation. If behavior and this page disagree, trust the source and the current OPENPROF conventions.*
