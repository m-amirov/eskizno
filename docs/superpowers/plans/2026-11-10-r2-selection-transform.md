# R2 Selection Transform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рамочное и точечное выделение векторных операций на активном слое, перенос и масштабирование одним историческим действием.

**Architecture:** Чистая геометрия для hit-test и расчёта группового преобразования; атомарное действие `transformItems` в существующей v2-модели. `EditorCanvas` управляет transient selection и превью через общий renderer, Registry и guarded dispatch запрещают действие в обучении.

**Tech Stack:** React 19, TypeScript, Canvas2D, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-r2-selection-transform-design.md`

## Global Constraints

- R2 stacked on `feat/r1-dual-workspaces` @ `c3abb6197f8f60222f2082985744c5b40b5b7367`, без merge и публикации.
- `DrawingProject.schemaVersion === 2`, IndexedDB и экспорт без изменения схемы.
- Сохранить текущие цвета, форму компактного toolbar и long-press редактора фигур.
- Только активный видимый незаблокированный paint-слой; заливки и референсы не выбираются.
- В обучении `select` закрыт; прямой dispatch проходит через tool policy.
- Hardware stylus и большие документы — отдельные release gates.

## Review Focus

1. Смешанный набор stroke+shape; порядок операций после трансформации неизменен (Task 1).
2. Атомарный отказ при неизвестном ID, некорректных координатах или выходе за холст (Task 1).
3. Переключение слоя/документа и pointercancel во время drag не коммитят (Task 2).
4. Два пальца, existing long-press фигуры и drawing gestures не регрессируют (Task 2).
5. Недоступное в уроке действие нельзя инициировать прямой командой (Task 1/2).

---

### Task 1: Чистая геометрия и атомарное действие

**Files:** Create `apps/web/src/editor/selection.ts`, `apps/web/src/editor/selection.test.ts`; modify `model.ts`, `model.test.ts`, `toolAccess.ts`, `toolAccess.test.ts`.

**Interfaces:** `SelectionItemId`, `SelectionBounds`, `itemBounds`, `hitTestItem`, `itemsInMarquee`, `selectionBounds`, `transformationForFrame`; `ProjectAction.transformItems` with `layerId`, `ids`, `origin`, `scaleX/Y`, `translateX/Y`.

- [x] RED: тесты click hit-test по штрихам/фигурам в порядке операций; рамка; ограничение frame; трансформация набора, Undo/Redo, отказ при locked/unknown/invalid, learning guard.
- [x] Run focused Vitest and confirm expected missing feature failures.
- [x] GREEN: реализация чистой геометрии и одного атомарного действия с инвариантами v2; обновить registry/guard.
- [x] Run focused and full Vitest → 219/219; commit deferred until final branch package.

### Task 2: Доступный инструмент и предварительный просмотр

**Files:** Modify `EditorCanvas.tsx`, `ToolIcon.tsx`, `render.ts`, targeted component tests, browser test.

**Interfaces:** `select` tool; selection/marquee/transform gesture state; `renderProject` receives optional selection bounds and marquee; single commit on pointer-up.

- [x] RED: компонентные тесты кнопки, запрета в уроке, рамки, перетаскивания, маркера, pointercancel и сохранённого long-press.
- [x] Run focused Vitest and confirm failure for missing behavior.
- [x] GREEN: wire selection gestures and transient render overlay; no independent history writes mid-drag.
- [x] Add browser journey for selection and Undo; TS, full Vitest and build PASS; local Playwright blocked before scenario, CI pending.
- [ ] Commit with documentation of actual gates, push feature branch and open Draft PR against R1; do not merge.
