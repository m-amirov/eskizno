# Layer renaming and extended brush library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make layer names editable and provide ten visually distinct drawing brushes in PR #10.

**Architecture:** Keep existing project actions and stroke schema; use an isolated brush renderer driven by a typed brush registry and reuse it for preview and committed strokes. Layer inline editing is local UI state and commits a single `renameLayer` action.

**Tech Stack:** React 19, TypeScript, Canvas2D, Vitest, Testing Library, @napi-rs/canvas.

**Spec:** `docs/superpowers/specs/2026-11-09-layer-rename-brush-library.md`

## Global Constraints

- Extend four existing brush IDs with six; don't migrate or alter old strokes.
- Deterministic rendering, capped sampling, clean eraser, no new dependencies.
- Fit existing toolbar and layer menu; keep existing history and mobile input behavior.

## Review Focus

- Locked layers should be renameable without becoming drawable (Task 1 test).
- Blank names should not silently overwrite an existing name (Task 1 test).
- Preview must use the selected brush ID even after toggling eraser (Task 3 test).
- Single-point strokes must render correctly for every brush (Task 2 test).
- Large/dense input strokes should not lead to unbounded stamps (Task 2 test).

---

### Task 1: Inline layer renaming

**Files:** Modify `apps/web/src/editor/LayerList.tsx`, `apps/web/src/styles.css`; test `apps/web/src/editor/LayerList.test.tsx`.

**Interfaces:** Produces `onAction({type:'renameLayer',layerId,name})` using existing model action.

- [x] Add failing RTL tests: menu click starts focused preselected row edit, Enter commits trimmed name, Undo restores old name, Esc cancels, blank refused, locked layer allowed.
- [x] Run `npm run test:unit -- src/editor/LayerList.test.tsx` and inspect expected failures.
- [x] Implement controlled inline input with focus and keyboard cancellation, use existing action; style input consistently.
- [x] Run `npm run test:unit -- src/editor/LayerList.test.tsx` and confirm passing.
- [x] Commit layer feature.

### Task 2: Deterministic brush renderer and document enum

**Files:** Modify `apps/web/src/editor/model.ts`, `apps/web/src/editor/render.ts`; create `apps/web/src/editor/brushes.ts`; test `apps/web/src/editor/render.test.ts`, `apps/web/src/editor/model.test.ts`.

**Interfaces:** Export `BRUSH_PRESETS` and `BrushId` from model/brush registry; `paintBrushStroke(ctx,stroke,width,height)` from `brushes.ts` consumed by `render.ts`.

- [x] Add failing tests: all 10 brush IDs accepted, visibly different raster output, eraser independent, dots rendered, re-render pixel deterministic, large point paths bounded.
- [x] Run `npm run test:unit -- src/editor/render.test.ts src/editor/model.test.ts` and inspect expected failures.
- [x] Implement brush stroke rasterizer with ten clear profiles (solid, diffuse, textured, nibbed) and bounded deterministic sampling, integrate with layer renderer.
- [x] Run `npm run test:unit -- src/editor/render.test.ts src/editor/model.test.ts` and confirm passing.
- [x] Commit render feature.

### Task 3: Brush selection UX and stroke integration

**Files:** Create `apps/web/src/editor/BrushPicker.tsx`, `apps/web/src/editor/BrushPicker.test.tsx`; modify `apps/web/src/editor/EditorCanvas.tsx`, `apps/web/src/styles.css` and any relevant integration test.

**Interfaces:** `<BrushPicker value: BrushId, onChange: (brush: BrushId) => void />` selecting preset. `EditorCanvas.previewStroke` emits `brushId` from component state for ink, preserves eraser semantics.

- [x] Add failing picker UI tests covering accessible ten presets and change callback; EditorCanvas brush selection integration test for stroke IDs, eraser toggle.
- [x] Run corresponding Vitest tests and inspect expected failures.
- [x] Implement picker with compact popover, accessible labels and active state, then wire selected brush and preview into canvas.
- [x] Run focused unit tests and full `npm run test:unit`, `npm run build`, `git diff --check`.
- [x] Commit picker and integration.

### Task 4: Final verification and PR update

**Files:** PR #10 and documentation evidence.

- [x] Confirm branch diff scope, actual renderer traits, all existing feature regressions, and no accidental style changes.
- [x] Attempt browser E2E in available environment; clearly name environment-specific failures.
- [ ] Update the existing Draft PR #10, verify its remote HEAD and report tests/limitations without claiming unexecuted PASS.

**Verification (2026-11-09):** 86/86 unit tests passed, TypeScript and Vite build passed. Browser E2E attempted; `/usr/bin/chromium` failed to create a system socket (`Operation not permitted`), and bundled Chromium was absent. Remote PR must remain Draft until a real browser check passes.

**Review-driven fixes:** focused keyboard return after renaming, anchored texture samples for stable preview, continuous fine-stroke core, and paint-layer raster cache to avoid re-rendering old textured strokes per pointer event. Regression tests cover these contracts.
