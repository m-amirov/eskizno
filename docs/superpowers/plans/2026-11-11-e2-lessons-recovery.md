# E2A–E2C Lesson Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the approved adult drawing lessons «Ветка с листьями», «Чашка кофе» and «Комнатное растение» on a separate branch and publish a Draft PR without merging.

**Architecture:** Extend the existing React/TypeScript learning workspace with a data-driven lesson registry and common six-step engine, preserving the current `DrawingProject` model and IndexedDB persistence. Render lesson-specific guides as a non-exportable overlay; evaluate actual committed marks rather than aesthetic quality. Preserve the professional workspace and the existing introductory line lesson.

**Tech Stack:** React 19, TypeScript, Canvas 2D, Vitest, Playwright, IndexedDB.

**Spec:** Approved E2 concept from the project discussion on 2026-11-11; existing `AGENTS.md`, `docs/superpowers/specs/2026-11-09-eskizno-adult-learning-product-design.md` and existing E1/R1–R3 design.

## Global Constraints

- Adult audience only; no new children mode, third-party trackers, or monetization.
- Three help modes: «Повтори», «Пойми», «Нарисуй сам»; never silently erase drawing when switching modes.
- Every lesson has six steps and an independent practice prompt: rosemary sprig, pencil cup, cactus in pot, respectively.
- Preserve local progress, Undo/Redo, save-error protections, professional tools and device-aware pointer behavior.
- No `main` merge and no release-ready claim without browser, Huawei hardware and image-rights review.

## Review Focus

- Switching lesson or help mode with unsaved work must not silently discard marks.
- Reload during a partial lesson must restore the correct lesson ID, step and drawing.
- Undo/Redo must affect the student's marks but not guide artwork.
- Imported image and guides must never leak into PNG export unless user explicitly opts into reference export.
- Completion on corrupt or missing saved evidence must fail safely.

---

### Task 1: E2A — botanical lesson engine

**Files:** `apps/web/src/learning/lessons.ts`, `apps/web/src/learning/LearningWorkspace.tsx`, `apps/web/src/studio/useLocalProjects.ts`, `apps/web/src/learning/lessons.test.ts`, `apps/web/src/App.learning.test.tsx`.

**Interfaces:** A typed lesson registry keyed by stable lesson IDs; selected lesson and mode supplied to the workspace; per-step evidence based on committed strokes.

- [ ] Write failing tests for six botanical steps, three modes, local restoration, switching protection, and rosemary independent assignment.
- [ ] Run targeted Vitest and confirm expected failures.
- [ ] Implement the smallest registry/engine/UI/persistence integration; keep original introductory lesson backwards compatible.
- [ ] Run targeted and complete unit suites and verify green.
- [ ] Commit E2A independently.

### Task 2: E2B — coffee cup

**Files:** `apps/web/src/learning/lessons.ts`, learning UI and corresponding unit/E2E tests.

- [ ] Write failing tests for six stages (basic form, ellipse, body, handle, cleanup, self-check) and pencil-cup practice.
- [ ] Confirm red; add lesson data and guided visuals without altering the core editor.
- [ ] Verify green, commit E2B independently.

### Task 3: E2C — houseplant

**Files:** lesson registry, guidance assets or self-contained SVG, learning unit/E2E tests.

- [ ] Write failing tests for six houseplant stages, guide mode isolation and cactus-in-pot practice.
- [ ] Confirm red; implement lesson and accessible visual guidance.
- [ ] Verify green, commit E2C independently.

### Task 4: Integration and Draft PR

- [ ] Run `npm ci`, `npm run typecheck`, `npm run test:unit`, `npm run build` and `npm run test:e2e` from `apps/web`; report exact counts and environment blockers.
- [ ] Validate guide assets and document rights/provenance; inspect generated screenshots at 390×844, tablet and desktop.
- [ ] Review `git diff --check`, branch ancestry and working tree.
- [ ] Publish a branch and open a Draft PR targeting the current appropriate base, **never merge**.
- [ ] Report open release gates explicitly: real Huawei/Yandex browser and stylus, image rights, real-device visual inspection.
