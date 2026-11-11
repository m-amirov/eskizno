# R3A Stylus Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pencil, liner and calligraphy strokes respond to real pen pressure/tilt without changing old drawings or mouse/touch behavior.

**Architecture:** Extend the serializable stroke format with optional pen data, migrating v2 projects to v3 on read. Extract pen sampling into a pure module, add an opt-in-by-stroke dynamic rendering path that leaves legacy brush rendering untouched, and expose small session-only controls in the existing editor toolbar.

**Tech Stack:** React 19, TypeScript 5.9, Canvas2D, IndexedDB, Vitest 4, `@napi-rs/canvas`, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-11-10-r3-pen-dynamics-design.md`

## Global Constraints

- Branch from the R2 base (`feat/r2-selection-transform` / Draft PR #17); implement R3A in a separate Draft PR. Do not merge or deploy without approval.
- Preserve learning tool access and professional all-tools access; no changes to fonts, colors, reference import, layout hierarchy, or local-only privacy model.
- Canvas limits remain 4096×4096, 16 layers and `MAX_STAMPS = 2600`; no unmotivated renderer rewrite or new dependencies.
- Dynamics only for pen-authored pencil/liner/calligraphy; the other seven brushes, eraser, figures, mouse and touch keep legacy output.
- Pressure sensitivity starts at `80%`; calligraphy tilt starts enabled. Both are session-only shared controls; each stroke snapshots the settings.
- The hardware gate on Huawei/Yandex Browser is **NOT TESTED** until an actual device and pen are checked; automated tests do not make a public-release gate PASS.

## File Map

| Path | Responsibility |
| --- | --- |
| `apps/web/src/editor/model.ts` | v3 stroke types, migration/validation, copying and R2 transforms |
| `apps/web/src/editor/penInput.ts` (new) | Pure coordinate+pen sample normalization and bounded deduplication |
| `apps/web/src/editor/brushes.ts` | Deterministic dynamic stroke sampling and rasterization, legacy branch unchanged |
| `apps/web/src/editor/EditorCanvas.tsx` | Wire input+settings to stroke construction, keep gesture rules |
| `apps/web/src/styles.css` | Only minimal sizing for small existing control group, if needed |
| `apps/web/src/editor/{model,penInput,render,persistence,EditorCanvas}.test.ts[x]` | Unit, pixel and storage regressions |
| `apps/web/e2e/drawing.spec.ts` | Real browser synthetic pen stream, interaction and responsive checks |
| `.github/workflows/e1-browser-gate.yml` | Enable CI on the new R3A branch and stacked PR base; preserve existing triggers |
| `docs/qa/r3-pen-dynamics.md` (new) | Exact commands, results and physical NOT TESTED matrix |

## Review Focus

1. A v2 project with interleaved fill/shape/stroke operations and a reference layer must migrate without changing operation order (Task 1 regression).
2. Malformed/duplicate coalesced pen samples including `NaN`, pressure-only stationary changes and unrelated `pointerId` must not pollute stored strokes (Task 2 regression).
3. Pressure stream ending with `pointercancel`, a palm touch or `lostpointercapture` must not commit damaged drawings (Task 4 regression).
4. A transformed v3 stroke must preserve pressure/tilt and render identically after undo/redo and reload (Tasks 1, 3 and 5 regressions).
5. A long dynamically sampled stroke near the 2600-stamp bound must remain deterministic, finite and not change legacy brush pixels (Task 3 regression).

---

### Task 1: v3 Document Format and Safe Migration

**Files:**
- Modify: `apps/web/src/editor/model.ts`
- Test: `apps/web/src/editor/model.test.ts`
- Test: `apps/web/src/editor/persistence.test.ts`

**Interfaces:**
- Produces: `export type StrokePoint = Point & { pressure?: number; tiltX?: number; tiltY?: number }`.
- Produces: `Stroke.points: StrokePoint[]` and `Stroke.dynamics?: { pressureSize: number; tiltAngle: boolean }`.
- Produces: `DOCUMENT_SCHEMA_VERSION = 3`; `parseDrawingProject(value: unknown): DrawingProject | null` accepts v2/v3 and returns v3.
- Consumes: current `applyAction`, `saveProject`, `loadProject`, `commitAction`, `undoAction`, `redoAction` contracts unchanged.

- [ ] **Step 1 — Failing tests.** Add `v2 → v3 preserves paint operation order, lesson, palette and references`, `reject invalid v3 pressure/tilt/dynamics`, `transformItems retains pen attributes and undo/redo`, and `IndexedDB save/reload migrated v2 then dynamic v3` with exact `pressure = .1/.9`, `tiltX = -35`, `tiltY = 20` cases. Update tests expecting schema 2 to schema 3 only where new projects are asserted; retain explicit v2 fixture assertions.
- [ ] **Step 2 — RED.** Run `npm run test:unit -- src/editor/model.test.ts src/editor/persistence.test.ts` in `apps/web`; verify failure before code changes.
- [ ] **Step 3 — Implement.** Validate v3 point attributes and snapshot range, migrate v2 on read without changing legacy paint semantics, make `copyStroke` retain optional fields and `transformItems` modify only `x/y`. Keep references to historical v2 operations intact.
- [ ] **Step 4 — GREEN.** Re-run the same focused tests and `npm run typecheck`; require zero failures.
- [ ] **Step 5 — Commit.** `git add apps/web/src/editor/model.ts apps/web/src/editor/model.test.ts apps/web/src/editor/persistence.test.ts && git commit -m "feat(eskizno): migrate drawings to stylus-aware v3"`.

### Task 2: Isolated Pointer Events Sampling

**Files:**
- Create: `apps/web/src/editor/penInput.ts`
- Create: `apps/web/src/editor/penInput.test.ts`

**Interfaces:**
- Consumes: `StrokePoint`, `CanvasRect`, `ViewState`, `clientToNormalized`, `screenToArtboard`.
- Produces: `collectStrokePoints(event: PointerEvent, rect: CanvasRect, view: ViewState): StrokePoint[]`.
- Produces: `appendDistinctStrokePoints(existing: readonly StrokePoint[], incoming: readonly StrokePoint[]): StrokePoint[]`.
- Keeps up to 256 coalesced events per packet plus parent event and a single consistent `pointerId`; unknown pointer types produce coordinate-only points.

- [ ] **Step 1 — Failing tests.** Add tests for ordered coalesced pen samples with `.1/.9` pressure and distinct tilt, mouse/touch returning `{x,y}` only, wrong pointer IDs excluded, `NaN`/`Infinity` sanitized, zoom/pan mapping, duplicate coordinates replacing last attributes, bounded packet size.
- [ ] **Step 2 — RED.** Run `npm run test:unit -- src/editor/penInput.test.ts`; verify failure due to missing exports.
- [ ] **Step 3 — Implement.** Normalize `pen` sensor values to the ranges in the spec and omit invalid optional fields; use the existing artboard geometry functions, preserve coordinates and latest stationary pen properties, and exclude coalesced samples from other pointers.
- [ ] **Step 4 — GREEN.** Run the focused tests and `npm run typecheck`; no failures.
- [ ] **Step 5 — Commit.** `git add apps/web/src/editor/penInput.ts apps/web/src/editor/penInput.test.ts && git commit -m "feat(eskizno): capture bounded stylus samples"`.

### Task 3: Deterministic Pressure/Tilt Rendering

**Files:**
- Modify: `apps/web/src/editor/brushes.ts`
- Test: `apps/web/src/editor/brushes.test.ts`
- Test: `apps/web/src/editor/render.test.ts`

**Interfaces:**
- Consumes: `Stroke` with optional `dynamics` and pen sensor points.
- Produces: `sampleDynamicStrokePoints(points: readonly StrokePoint[], width: number, height: number, spacing: number, maxSamples?: number): Array<{ x: number; y: number; pressure: number; tiltX?: number; tiltY?: number }>` (pixel positions with linearly interpolated sensor values; absent pressure falls back to `.5`).
- Produces: `calligraphyAngle(tiltX?: number, tiltY?: number): number`, fallback `-Math.PI / 4` without meaningful tilt.
- Existing `paintBrushStroke` remains entrypoint for both preview and final/export rendering; no changes to its call sites.

- [ ] **Step 1 — Failing tests.** Create pixel regressions for weak/strong pressure on pencil+liner, changed orientation for calligraphy, identical raster from one repeated render, identical legacy v2 pixel buffer, 2600-sample bound and invalid sensor values not producing invalid canvas geometry.
- [ ] **Step 2 — RED.** Run `npm run test:unit -- src/editor/brushes.test.ts src/editor/render.test.ts`; verify the new assertions fail.
- [ ] **Step 3 — Implement.** Route only three supported ink presets with a valid `dynamics` snapshot through pressure-size sampling, with `baseWidth × (1 + pressureSize × (pressure - 0.5))` clamped above zero; apply tilt angle to calligraphy elliptical dab. Preserve the old switch branch unchanged for everything without `dynamics`, including eraser.
- [ ] **Step 4 — GREEN.** Run focused tests, `npm run typecheck`, and add a bounded 2048² render duration measurement to the QA record (measurement is not a hardware PASS).
- [ ] **Step 5 — Commit.** `git add apps/web/src/editor/brushes.ts apps/web/src/editor/brushes.test.ts apps/web/src/editor/render.test.ts && git commit -m "feat(eskizno): render deterministic pressure strokes"`.

### Task 4: Editor Controls and Gesture Integration

**Files:**
- Modify: `apps/web/src/editor/EditorCanvas.tsx`
- Modify if necessary: `apps/web/src/styles.css`
- Test: `apps/web/src/editor/EditorCanvas.test.tsx`
- Test: `apps/web/e2e/drawing.spec.ts`

**Interfaces:**
- Consumes: `collectStrokePoints`, `appendDistinctStrokePoints`, `Stroke.dynamics`.
- Produces: `pressureSize` React state initially `.8`, `tiltAngle` React state initially `true`; these are snapshotted by `previewStroke` only for `pointerType === 'pen'` and brush `pencil`/`liner`/`calligraphy`.
- UI accessible controls: slider `aria-label="Чувствительность к нажиму"` (0–100), checkbox `aria-label="Наклон пера"` (calligraphy only), visible only for supported selected ink brushes; existing toolbar grouping remains intact.

- [ ] **Step 1 — Failing tests.** Add unit tests for default controls, toggle/slider update, stroke snapshot preservation after settings change, pointercancel/lostcapture no `addStroke`, pen+touch palm suppression, professional/learning policy and mouse/touch absence of dynamic fields. Add Chromium E2E synthetic pen pressure, save/reload/undo/redo, mouse fallback and toolbar checks at 390×844 and 820×1180.
- [ ] **Step 2 — RED.** Run `npm run test:unit -- src/editor/EditorCanvas.test.tsx` and `npm run test:e2e -- e2e/drawing.spec.ts`; verify new cases fail first.
- [ ] **Step 3 — Implement.** Replace coordinate-only stroke collection and deduplication on draw paths; capture pen attributes at pointerdown, long-press fallback and finish; keep tool selection, selection transforms, gestures, reference interaction and R2 shortcuts unchanged. Introduce accessible compact settings without a new permanently visible sidebar.
- [ ] **Step 4 — GREEN.** Run focused unit and E2E tests and `npm run typecheck`; inspect 390×844 and 820×1180 for no horizontal overflow.
- [ ] **Step 5 — Commit.** `git add apps/web/src/editor/EditorCanvas.tsx apps/web/src/editor/EditorCanvas.test.tsx apps/web/e2e/drawing.spec.ts apps/web/src/styles.css && git commit -m "feat(eskizno): expose stylus brush dynamics"` (omit styles.css if unchanged).

### Task 5: Browser Integration and Honest QA Gate

**Files:**
- Modify: `apps/web/e2e/drawing.spec.ts`
- Modify: `.github/workflows/e1-browser-gate.yml`
- Create: `docs/qa/r3-pen-dynamics.md`

**Interfaces:**
- Browser simulation: Chromium CDP `Input.dispatchMouseEvent` with `pointerType: 'pen'` when supported, or page-side `PointerEvent` dispatch for deterministic pressure/tilt fields; label this explicitly **synthetic**, never physical proof.
- QA artifact: environment, tested commit, exact commands, pass/fail counts, pixel artifacts if available, and hardware checklist with `NOT TESTED` when unavailable.

- [ ] **Step 1 — Browser verification.** Run the already added synthetic pen E2E and existing `e2e/studio.spec.ts` import regression; add an explicit tablet viewport PNG/JPEG/WebP upload case only if missing from the baseline suite.
- [ ] **Step 2 — Resolve real failures.** For every observed failure, first add/reproduce the narrow regression, then fix the root cause; do not alter UI design or expand R3A into masks/blend modes.
- [ ] **Step 3 — QA record + CI trigger.** Write `docs/qa/r3-pen-dynamics.md` with hardware steps (Huawei model/browser/pen, palm+pinch, 2048×2048/8 layers/15 min, import and recovery), recording unperformed checks as `NOT TESTED`. Preserve existing `.github/workflows/e1-browser-gate.yml` triggers and add `feat/r3-pen-dynamics` to push branches plus `feat/r2-selection-transform` to PR target branches, so the R3A stacked Draft PR actually exercises browser CI.
- [ ] **Step 4 — Full release gates.** From `apps/web`: `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm run test:e2e`; from repo root: `git diff --check`. Archive exact outputs, counts and SHA. If any check fails, report failure and keep Draft PR blocked.
- [ ] **Step 5 — Commit and Draft PR.** Commit integration test/CI adjustments and QA doc as `test(eskizno): record R3A stylus gates`; hand the reviewed branch to the controller for push and opening a **Draft PR** stacked on R2, explicitly distinguishing automatic PASS from hardware `NOT TESTED`. Do **not** merge or deploy.

## Self-Review Summary

- Full R3A spec is covered; masks, blend modes and all other brush presets remain separate future PRs.
- Only new data and supported brush branches get new rendering. Existing v2 data, eraser, mouse/touch and references retain prior semantics.
- Version-2 hardcoded unit assertions must be updated for new v3 projects while at least one raw v2 migration fixture remains.
- Physical stylus testing, including compatibility and latency thresholds, remains an explicit unpassed gate until actual hardware evidence exists.
