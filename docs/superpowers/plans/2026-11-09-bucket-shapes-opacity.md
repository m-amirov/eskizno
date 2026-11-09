# Plan: bucket fill, editable geometry, brush opacity

Spec: `docs/superpowers/specs/2026-11-09-bucket-shapes-opacity.md`

## Task 1 — Document model & history

Files: `apps/web/src/editor/model.ts`, `model.test.ts`, `history.test.ts`.

1. Add failing tests for ordered operations, shape updates, invalid geometry, locked-layer rejection, clear semantics and undo/redo.
2. Add `Shape`, `BucketFill`, `PaintOperation`, corresponding actions and validation. Preserve legacy strokes-only documents.
3. Run `npm run test:unit` — all green.

## Task 2 — Geometry & flood-fill renderer

Files: `render.ts`, `render.test.ts`, `shapeGeometry.ts`, `shapeGeometry.test.ts`.

1. Add failing pixel tests for bucket containment and command ordering; fill styles, coordinate-dependent shapes and eraser ordering; move/resize math and hit testing.
2. Implement replay of ordered paint operations with cached immutable layers, flood fill with bounded memory, editable shape preview, selection handles.
3. Run unit tests — all green.

## Task 3 — Editor UI

Files: `EditorCanvas.tsx`, `EditorCanvas.test.tsx`, `paletteHistory.ts`, `styles.css`.

1. Add failing tests for emitted actions on bucket, shape creation/move/resize, opacity and touch cancellation.
2. Implement controls and unified pointer gestures while keeping pinch/zoom and existing drawing behavior.
3. Run unit, typecheck and build; attempt E2E and record any environment blocker.

## Task 4 — Integration & PR

Review complete change; fix important regressions with RED→GREEN tests; keep Draft PR #10, sync repository branch, document actual verification and manual QA gates.
