# R1 Dual Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Оставить один редактор документов, открыть все реально реализованные инструменты в свободной студии и дать начинающему художнику первый короткий урок с постоянной разблокировкой ластика и безопасным продолжением рисунка.

**Architecture:** Реестр инструментов и чистая политика доступа живут рядом с ядром, но не изменяют версию DrawingProject 2. UI урока является отдельной оболочкой для существующего EditorCanvas; стор проекта проверяет tool policy перед commit. Прогресс курса сохраняется отдельной записью в существующем IndexedDB `progress`, копия в студию получает новый ID и сохраняется перед переключением.

**Tech Stack:** React 19, TypeScript, Canvas2D, IndexedDB v2, Vitest, Playwright.

**Spec:** `https://github.com/m-amirov/eskizno/blob/docs/professional-editor-design/docs/superpowers/specs/2026-11-10-professional-editor-dual-workspaces-design.md` and audit `docs/qa/r0-editor-technical-audit.md` in Draft PR #15.

## Global Constraints

- Base `feat/e1-7-finish` @ `54ab90b9c8917dcc065587d6ca405c64157e1508`; R1 is stacked; preserve Draft PR #14 and `main`.
- Document v2 (render, persistence, brush algorithms, references 27–45% with zoom 25–400%) remains backward-compatible.
- No server, accounts, AI APIs, payments, new drawing engine or new library.
- Only one real 3-step adult lesson; do not claim objective quality scoring; no child mode.
- Keep professional tools and all ten existing brushes always available without progress checks.
- Progress is monotonic and independent of projects; saving failure cannot show false completion or destroy an attempt.
- Browser and physical stylus release gates stay distinct; failed local Chromium launch is not a product test result.

## Review Focus

1. Fast tool switch mid-gesture: blocked learning tool cannot commit, existing pending stroke cancelled (Task 1/3).
2. Persisted progress record of older schema or unrecognized tool IDs must not grant inaccessible tool (Task 2).
3. Failed IndexedDB save during lesson completion or copy must not falsely unlock or overwrite current project (Task 2/3).
4. Existing v1/v2 projects and local reference Blob must survive switch and copy (Task 2/4).
5. Responsive lesson panel must leave real canvas reachable on narrow viewports; keyboard and touch controls must expose disabled reason (Task 3/4).

---

### Task 1: Registry and centralized tool policy

**Files:** Create `apps/web/src/editor/toolAccess.ts`, `apps/web/src/editor/toolAccess.test.ts`; modify `apps/web/src/studio/useLocalProjects.ts` at action dispatch.

**Interfaces:** `EditorToolId`, `WorkspaceMode`, `ToolAvailabilityContext`; `implementedTools`, `isToolAvailable`, `canApplyToolAction(action, context)`, `guardedCommitAction(history, action, context)`; old `apply(action)` defaults professional.

- [ ] Write failing tests: professional exposes all five tools; learning offers introduced plus permanently unlocked, intersects lesson allowlist, unknown IDs ignored; `addStroke(erase)` blocked until unlocked; utility commands and Undo remain allowed.
- [ ] Run `npm run test:unit -- src/editor/toolAccess.test.ts` → expected RED for missing module.
- [ ] Implement registry + pure policy, ensure action gate at store dispatch (not just disabled UI).
- [ ] Run targeted test → PASS, run full unit suite → PASS; commit `feat(eskizno): introduce shared tool access policy`.

### Task 2: Independent learning progress and safe project transitions

**Files:** Create `apps/web/src/learning/progress.ts`, `apps/web/src/learning/progress.test.ts`, `apps/web/src/learning/lessons.ts`; modify `apps/web/src/editor/persistence.ts`, `apps/web/src/editor/persistence.test.ts`, `apps/web/src/studio/useLocalProjects.ts`, `apps/web/src/editor/model.ts`, `apps/web/src/editor/model.test.ts`.

**Interfaces:** `LearningProgress` with `completedLessonIds` and `unlockedToolIds`; `saveLearningProgress/loadLearningProgress`; `completeLesson`, `startLesson`, `openProfessionalWorkspace`, `copyLessonToStudio`; `setLessonStep` in v2 `ProjectAction`; `duplicateLessonProject` preserving layers/assets.

- [ ] Write failing pure tests: idempotent/monotonic unlock; malformed/legacy records normalize safely; duplicate model preserves layer contents but gets a new project id; advancing lesson step remains reversible and valid v2.
- [ ] Run targeted tests → expected RED; implement pure functions; run tests → PASS.
- [ ] Write failing persistence test with memoryDb for separate learning record, unchanged v1 `progress`, failure atomicity; run RED; implement storage routines; run GREEN.
- [ ] Wire transitions into `useLocalProjects` with `flush()` + revision guard + save-before-switch; run full suite, commit `feat(eskizno): persist lesson unlocks and preserve source drawings`.

### Task 3: Learning Workspace and common canvas

**Files:** Create `apps/web/src/learning/LearningWorkspace.tsx`; modify `apps/web/src/editor/EditorCanvas.tsx`, `apps/web/src/App.tsx`, `apps/web/src/index.css` (or existing stylesheet), and targeted tests.

**Interfaces:** 3-step `line-confidence-v1` lesson, predicate over accepted `Stroke.step` in project; explicit next-step button, completion unlock of `ink` + `erase`, subsequent practice; `toolAccess` prop on EditorCanvas; Studio explicitly passes professional tool policy.

- [ ] Write failing unit tests for lesson evidence: no stroke/no proper step cannot complete; one/two legitimate strokes pass corresponding requirements; undo removes evidence.
- [ ] Run targeted tests → RED; implement `lessons.ts` criteria → GREEN.
- [ ] Add UI wiring: separate learning intro/lesson, progress state, disabled tools with explanations, escape/back navigation, copy CTA, responsive panel while preserving existing studio toolbar and reference.
- [ ] Typecheck + full unit suite → PASS; commit `feat(eskizno): add first guided learning workspace`.

### Task 4: Browser regression and review gates

**Files:** Create `apps/web/e2e/learning.spec.ts`; edit relevant UI/tests only if newly asserted public behavior requires it; update R1 notes.

- [ ] Write E2E path: begin lesson, draw at each step, unlock eraser, reload, continue in next practice, make independent studio copy, verify old lesson record and all professional tools.
- [ ] Run `npm run typecheck`, `npm run test:unit`, `npm run build` → PASS or record failures.
- [ ] Run `npm run test:e2e` with bundled Chromium or `ESKIZNO_CHROMIUM_PATH`; if blocked before launch, report `NOT TESTED`, request GitHub Actions remote gate before readiness.
- [ ] Review full diff against spec and R0, code hygiene and docs; record unresolved hardware acceptance; commit test/docs, push isolated branch and open Draft PR with `feat/e1-7-finish` as base. **Do not merge or publish.**

## R1 Acceptance Gate

R1 is software-ready only after validated policy unit tests, persisted unlock migration/round-trip tests, end-to-end lesson/reload/copy/professional path **actually passing in CI**, and no regression in the existing 29 browser tests. Real physical stylus and 2048²+ perf remain explicit `NOT TESTED` and block claims about professional-grade release readiness.
