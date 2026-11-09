# Icon Toolbar & Long Press Shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compact icon-only toolbar and 500 ms shape move gesture without a dedicated select button.

**Architecture:** Keep Canvas pointer handling in `EditorCanvas.tsx`; add a deferred gesture when the pointer starts on a shape. A timer promotes this into a shape edit, while travel beyond an 8px dead zone before timeout starts the current drawing tool. Use small inline SVG icon component shared by toolbar controls and the existing pickers.

**Tech Stack:** React, TypeScript, Canvas 2D, Vitest, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-11-09-icon-toolbar-long-press-shapes.md`

## Global Constraints

- Draft PR #10 only; no merge; no dependencies, refactors or external asset downloads.
- Reference Excalidraw icon-first toolbar, retain Eskizno design; aria-label/title and active states required.
- 500ms hold, 8 CSS-pixel dead zone, one history action for moving, drawing on quick strokes.
- Pinch/cancel/tool/project/unmount abort pending gesture.

## Review Focus

- Rapid pen strokes beginning on filled shapes: no lost start segment, no accidental move.
- Two touches during pending long press: pending timer cannot mutate shape.
- Pointer cancellation just before timeout: no latent selection/move.
- Changed project during long press: no stale shape update.
- Zoomed canvas and tiny shape handles: proper hit detection and resize behavior.

---

### Task 1: Icon toolbar

**Files:**
- Create: `apps/web/src/editor/ToolIcon.tsx`
- Modify: `apps/web/src/editor/EditorCanvas.tsx`, `apps/web/src/editor/BrushPicker.tsx`, `apps/web/src/editor/PalettePopover.tsx`, `apps/web/src/styles.css`
- Test: `apps/web/src/editor/EditorCanvas.test.tsx`, picker tests if needed

**Interfaces:** Produce `ToolIcon({name}: {name: ToolIconName})` with SVG path data and `aria-hidden`, no external dependencies.

- [x] Write React test: toolbar controls have known accessible names but no visible text; select button absent; preserve disabled and active states.
- [x] Run `npm run test:unit -- src/editor/EditorCanvas.test.tsx` and observe failure.
- [x] Add SVG pictograms for brush, eraser, bucket, shapes, palette, undo, redo, clear, fullscreen, plus/minus/reset and keep non-toolbar destructive confirmations textual.
- [x] Adjust CSS to compact 40px+ icon targets and tooltips (`title`) and update dynamic picker triggers.
- [x] Run focused tests (12/12), commit with gesture functionality.

### Task 2: Deferred long-press shape editing

**Files:**
- Modify: `apps/web/src/editor/EditorCanvas.tsx`, `apps/web/src/editor/EditorCanvas.test.tsx`, `apps/web/src/editor/shapeGeometry.ts` only if hit-test lacks support

**Interfaces:** Internal `PendingGesture` stores pointer id, starting normalized artboard point, canvas pixel start, target shape and timer; timer promotes to existing `EditGesture`; `moveStroke` resolves quick movement as the active tool; finish resolves quick tap per tool.

- [x] Add fake-timer tests for long hold then drag, quick brush/eraser over shape, fill quick tap, pointer cancel, two-touch pinch, project change, selection handles and no select button.
- [x] Run focused tests and verify failures (3 old editing tests failed without new gesture).
- [x] Implement pending state, timer cleanup, promotion, gesture fallback and selection drawing; keep existing `updateShape` semantics and Undo history.
- [x] Run focused tests (17/17), commit with toolbar functionality. Independent review found and verified two regressions in rounding/point buffering; RED→GREEN regression tests added.

### Task 3: Integration verification and documentation

**Files:** `README.md`, relevant UI or E2E tests and this plan checkbox state.

- [x] Update user guidance from explicit select tool to hold-and-drag.
- [x] Run tests (122/122), TypeScript/build (PASS), diff check. Browser E2E attempted but blocked by absent Chromium executable; browser panel also could not connect to the executor's `127.0.0.1:5173`. Real pen/multitouch QA pending.
- [ ] Verify no accidental changes outside PR scope; commit and push to existing PR #10; leave it Draft.
