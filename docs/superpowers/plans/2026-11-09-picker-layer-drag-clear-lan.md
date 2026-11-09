# Picker, Layer Drag, Clear & Stable LAN Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В Draft PR #10 реализовать HSV-палитру, drag-reorder слоёв, очищение всех штрихов с Undo и стабильный LAN-запуск без dev-client reload.

**Architecture:** Чистые функции HSV преобразуют цвета; `PalettePopover` показывает встроенный редактор. `EditorCanvas` обрабатывает pointer drag над слоями, существующий `reorderLayer` обновляет порядок. `clearDrawing` очищает paint-штрихи, не удаляя слои/референсы; стабильный локальный сервер использует собранную Vite preview-версию без HMR.

**Tech Stack:** React, TypeScript, Vitest, Canvas2D, Vite.

**Spec:** `docs/superpowers/specs/2026-11-09-color-picker-layer-drag-design.md` (дополнено запросом пользователя об очистке и перезагрузках).

## Global Constraints

- Существующий PR #10 остаётся Draft до E2E в браузере, не выполнять merge.
- Сохранение в IndexedDB относится к следующему этапу; не добавлять его скрытно.
- Никаких runtime-зависимостей, не менять рендер слоёв.
- Не путать подтверждённую возможность автоматической перезагрузки Vite dev-client с доказанной причиной конкретного случая пользователя.

## Review Focus

- HSV крайние значения, HEX ввод и подтверждение без изменения цвета до применения.
- Pointer drag работает на touch, не активирует соседние кнопки и сохраняет выбор слоя.
- Точное сопоставление перевёрнутого визуального порядка с model-index, undo/redo.
- Очистка защищена от случайного нажатия, все слои остаются и действие можно отменить.
- LAN preview не содержит Vite HMR и не перезагружает страницу при переподключении dev WebSocket.

---

### Task 1: HSV picker

**Files:** Create `apps/web/src/editor/color.ts` and `color.test.ts`; modify `PalettePopover.tsx`, `PalettePopover.test.tsx`, `styles.css`.

- [x] RED: tests for conversion of key colors, invalid input, opening own-color editor, HSV pointer update, HEX input and Apply/Cancel.
- [x] GREEN: pure HSV math and embedded pointer-driven SV square + hue stripe + previews/HEX; no native-only color path.
- [x] Run targeted Vitest and typecheck.

### Task 2: Drag reordering

**Files:** Create `apps/web/src/editor/LayerList.tsx` and `LayerList.test.tsx`; modify `EditorCanvas.tsx`, `styles.css`.

- [x] RED: tests for touch pointer drag, invalid drops, locked layers, keyboard handle and undo.
- [x] GREEN: pointer-driven drag handle and drop marker, route to `reorderLayer` without changing model.
- [x] Run targeted Vitest and typecheck.

### Task 3: Clear drawing

**Files:** Modify `model.ts`, `model.test.ts`, `history.test.ts`, `EditorCanvas.tsx`, `App.test.tsx`.

- [x] RED: clear removes all paint strokes but preserves layers/refs; undo restores; UI confirmation prevents accidental removal.
- [x] GREEN: `clearDrawing` action and toolbar confirmation control, disabled for blank drawings.
- [x] Run targeted Vitest and typecheck.

### Task 4: Stable LAN and integration

**Files:** Modify `apps/web/package.json`, LAN startup documentation, maybe e2e tests.

- [x] Confirm Vite dev client reload path; provide `npm run lan` as a production preview build bound to LAN, with no HMR.
- [x] Run entire unit suite, production build, prototype core tests, git diff --check; attempt browser E2E, record blockers.
- [ ] Update PR #10 branch and PR body, leave Draft.

## Проверки 2026-11-09

- `npm run test:unit`: **63/63 PASS**, 9 файлов.
- `npm run build`: TypeScript + Vite **PASS**.
- `node --test core.test.mjs` (прототип): **8/8 PASS**.
- `git diff --check`: **PASS**.
- В production `dist` отсутствуют `@vite/client`, `vite-hmr` и `location.reload()`; dev-клиент Vite содержит `vite:ws:disconnect` → `location.reload()` при восстановлении WebSocket.
- `npm run lan`: сборка успешна, запуск preview в данном контейнере заблокирован ОС (`uv_interface_addresses`), поэтому живой LAN smoke-test требует устройства пользователя.
- Playwright: 6 E2E не запускаются — Chromium завершается до открытия страницы (`socket() failed: Operation not permitted`). Проверка на реальном браузере остаётся обязательной.
