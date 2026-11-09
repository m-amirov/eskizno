# Меню слоя и последние цвета — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать глазок, меню блокировки/удаления слоя и полноразмерную палитру с комбинированным списком недавних цветов.

**Architecture:** `LayerList` использует существующие `ProjectAction`, локальное состояние меню и диалога удаления; `PalettePopover` всегда монтирует `HsvColorEditor`. `EditorCanvas` хранит MRU без изменения схемы проекта; чистая функция объединяет MRU с цветами paint-штрихов.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Vite.

**Spec:** `docs/superpowers/specs/2026-11-09-layer-menu-palette-recent-design.md`.

## Global Constraints

- Только Draft PR #10, не переводить в Ready и не делать merge.
- Не менять сериализуемую схему документа, Canvas2D и систему Undo/Redo.
- Сохранить drag-and-drop и действия существующих слоёв.
- Не добавлять runtime dependencies.

## Review Focus

- Меню на маленьком экране и при fullscreen не обрезается контейнером.
- Выход по Escape, вне меню, отмена удаления, возврат фокуса.
- Последний paint-слой/locked не могут быть удалены даже через обход интерфейса.
- Цвет из HSV меняется только после применения, выбор недавнего синхронизирует HEX/HSV без закрытия.
- Удаление штриха/слоя или Undo обновляет палитру цветов холста без устаревших записей, MRU остаётся лишь в сессии.

---

### Task 1: Меню слоёв

**Files:** `apps/web/src/editor/LayerList.tsx`, `LayerList.test.tsx`, `styles.css`.

- [x] RED: тесты глазка, всплывающего меню, блокировки, удаления пустого и непустого слоёв, отмены удаления, Undo, Escape и outside click.
- [x] GREEN: SVG-иконка глаза, меню с позиционированием и подтверждением; использовать `setLayerVisibility`, `setLayerLock`, `removeLayer`.
- [x] Проверить targeted Vitest.

### Task 2: Недавние и использованные цвета

**Files:** `apps/web/src/editor/paletteHistory.ts` (new), `paletteHistory.test.ts` (new), `EditorCanvas.tsx`, `PalettePopover.tsx`, `PalettePopover.test.tsx`.

- [x] RED: чистая функция выдаёт максимум 8 последних неповторяющихся цветов по MRU + видимым ink strokes; тесты перестановки и пустого рисунка.
- [x] GREEN: локальная MRU-история выбора цвета в `EditorCanvas`, комбинирование с проектом.
- [x] RED: PalettePopover сразу показывает HSV, редактирует цвет, верхняя строка не закрывается и обновляет HEX; сохранённые цвета доступны.
- [x] GREEN: убрать отдельный триггер редактора, поставить HSV под верхнюю строку; сохранить Apply, Cancel и Save.
- [x] Проверить targeted Vitest.

### Task 3: Интеграция и PR

**Files:** `apps/web/e2e/drawing.spec.ts`, документация, PR #10.

- [x] Добавить E2E сценарии для меню слоя и постоянной HSV-палитры.
- [x] Полный `npm run test:unit`, `npm run build`, `node --test core.test.mjs`, `git diff --check`; E2E попытка с фиксацией реальных ограничений.
- [x] Commit + обновление head PR #10 и описания, оставить Draft.

## Verification (2026-11-09)

- `npm run test:unit`: **69/69 PASS** (10 test files); добавлен регрессионный тест портала/focus для полноэкранного режима и возврата фокуса после отмены удаления.
- `npm run build`: TypeScript + Vite **PASS**.
- `node --test core.test.mjs`: **8/8 PASS**.
- `git diff --check`: **PASS**.
- Playwright: 7 E2E были запрошены, все 7 не стартовали из-за ограничения запуска Chromium `socket() failed: Operation not permitted` до загрузки страницы, **не** являются доказательством дефекта приложения. Проверить в реальном браузере до снятия Draft.
