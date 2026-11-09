# Immersive Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В PR #10 добавить всплывающую палитру, ввод pinch/wheel и полноэкранную студию с сохранением рисунка и компактных инструментов.

**Architecture:** `PalettePopover` изолирует цветовой интерфейс, `EditorCanvas` соединяет DOM pointer/wheel события с существующими `geometry.ts` и `history.ts`, сам `studio-layout` становится полноэкранным элементом; CSS отвечает за адаптацию. Без сторонних runtime-зависимостей.

**Tech Stack:** React 19, TypeScript, Canvas2D, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-eskizno-immersive-editor-design.md`.

## Global Constraints

- Существующий редактор и сериализованная модель не меняются; нет сервера/сохранения после reload.
- PR #10 остаётся Draft до реального браузерного E2E PASS и отдельного решения о merge.
- Без искусственных заглушек Canvas: проверять реальную DOM-реакцию и существующие пиксельные тесты.

## Review Focus

- Второй палец после начала штриха: отмена текущего штриха, отсутствие коммита после отпускания обоих пальцев.
- Wheel над холстом: увеличение вокруг указателя, `preventDefault`, никаких изменений вне холста.
- `fullscreenchange` после Esc / отказ `requestFullscreen`: восстановление интерфейса и доступной кнопки.
- На узком экране палитра не выходит за границу viewport, холст не деформируется и не исчезает.
- Выбор пользовательского HEX: обновляет цвет следующих штрихов, не ломает палитру/историю.

---

### Task 1: PalettePopover

**Files:** Create `apps/web/src/editor/PalettePopover.tsx`, `apps/web/src/editor/PalettePopover.test.tsx`; modify `apps/web/src/editor/EditorCanvas.tsx`, `apps/web/src/styles.css`.

**Interfaces:** `PalettePopover({ color, colors, onSelect, onSaveColor })`; выбор цветов вызывает `setColor`, добавление цвета — `setPalette` через существующий `ProjectAction`.

- [x] **Step 1:** RED: тесты кнопки Палитра, preset-selection, custom color, закрытия Esc/вне, отсутствие дубликатов/лимит 32.
- [x] **Step 2:** `npm run test:unit -- src/editor/PalettePopover.test.tsx` → FAIL (нет компонента).
- [x] **Step 3:** GREEN: popover с `role=dialog`, цветными swatches, native picker, доступными aria-label; визуальные стили с mobile max-width.
- [x] **Step 4:** `npm run test:unit` → PASS.

### Task 2: Zoom gestures

**Files:** Modify `apps/web/src/editor/geometry.ts`, `apps/web/src/editor/geometry.test.ts`, `apps/web/src/editor/EditorCanvas.tsx`, `apps/web/src/App.test.tsx`, `apps/web/e2e/drawing.spec.ts`.

**Interfaces:** `wheelZoom(view, deltaY, anchor): ViewState`, existing `pinchView`. `EditorCanvas` отслеживает touch pointers отдельно от pending stroke и ставит native wheel listener `{passive:false}`.

- [x] **Step 1:** RED: wheel bounds/anchor (including deltaMode), two touch pointers cancel incomplete stroke, never commit during pinch, zoom count changes; E2E сценарий мышиного wheel.
- [x] **Step 2:** `npm run test:unit -- src/editor/geometry.test.ts src/App.test.tsx` → FAIL до реализации.
- [x] **Step 3:** GREEN: wheel normalization, non-passive listener, pointer map and pinch; single-pointer drawing unchanged.
- [x] **Step 4:** `npm run test:unit` → PASS; E2E attempt документировать отдельно.

### Task 3: Immersive fullscreen

**Files:** Modify `apps/web/src/editor/EditorCanvas.tsx`, `apps/web/src/styles.css`, `apps/web/src/App.test.tsx`, `apps/web/e2e/drawing.spec.ts`.

**Interfaces:** `studio-layout` is fullscreen root; `requestFullscreen` + `fullscreenchange`, fallback CSS focus mode with Escape exit, persistent toolbar.

- [x] **Step 1:** RED: fallback when API unavailable, Esc restores normal mode; fullscreen success and `fullscreenchange`, no canvas intrinsic resize; E2E manual/fullscreen hooks.
- [x] **Step 2:** `npm run test:unit -- src/App.test.tsx` → FAIL.
- [x] **Step 3:** GREEN: toggle button, fullscreen event lifecycle, fallback, CSS `:fullscreen` responsive layout without canvas distortion.
- [x] **Step 4:** `npm run test:unit && npm run build` → PASS. `npm run test:e2e -- e2e/drawing.spec.ts` attempted, log any environment restriction. Run prototype tests and `git diff --check`.
- [ ] **Step 5:** Commit locally and push update to PR #10; confirm remote comparison and leave Draft until browser gate.

## Verification evidence (2026-11-09)

- `npm run test:unit`: 7 files, **51 passed**.
- `npm run build`: TypeScript and Vite build passed.
- `node --test core.test.mjs` in `prototypes/stylus-editor-v1`: **8 passed**.
- `git diff --check`: passed.
- `ESKIZNO_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- e2e/drawing.spec.ts`: **NOT EXECUTED**. Chromium crashes before opening a page (`socket() failed: Operation not permitted`), 4 scenarios reported as failed due to the environment. Real-browser gate remains open.
