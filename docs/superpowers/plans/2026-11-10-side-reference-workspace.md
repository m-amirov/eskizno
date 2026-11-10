# Side Reference Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Увеличить боковой референс, добавить разделитель и независимые zoom/pan/pinch для просмотра изображения.

**Architecture:** Раскладка остаётся в `Studio`, взаимодействие с изображением — в `ReferencePanel`, чистая математика масштаба/панорамирования — отдельно от React. Не менять `DrawingProject`, IndexedDB и рендер на холсте: view state просмотра изолирован.

**Tech Stack:** React + TypeScript, CSS Grid, Pointer Events, Vitest, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-11-10-side-reference-workspace-design.md`.

## Global Constraints

- Изолированная работа в существующем Draft PR #14 и его ветке, без merge.
- Не изменять пропорции референса, размеры экспортируемого PNG, кисти и историю рисунка.
- UI доступен с клавиатуры и касанием, поддерживает полноэкранный режим и portrait.
- Прототип v0.4 не менять.

## Review Focus

1. Две касательные точки должны инициировать pinch, а не два конкурирующих pan-жеста.
2. При сильном увеличении preview не покидает viewport целиком; «Вписать» сбрасывает оба параметра.
3. Заблокированный референс можно приближать как *просмотр*, но нельзя менять его содержимое.
4. На узком экране и в fullscreen панель не съедает область рисования и не вызывает горизонтальный overflow.
5. Смена проекта и URL не оставляет старый zoom/pan на другом изображении.

## Task 1: Pure viewport geometry

**Files:** Create `apps/web/src/studio/referenceViewport.ts`, `apps/web/src/studio/referenceViewport.test.ts`.

**Interfaces:** `clampPreviewZoom(number): number` в 0.25…4; `zoomPreviewAt(view, nextZoom, point): View` с сохранением точки; `panPreview(view, dx, dy): View`; `resetPreview(): View`, `View = {zoom:number, panX:number,panY:number}`. Единицы pan — CSS px, не координаты документа.

- [x] RED: unit-тесты границ, якоря zoom, сброса и переноса; зафиксировано ожидаемое падение.
- [x] GREEN: минимальная реализация чистых функций, unit + typecheck PASS.
- [x] Зафиксировать отдельный коммит (`9afbba3`).

## Task 2: Preview zoom and gestures

**Files:** Modify `apps/web/src/studio/ReferencePanel.tsx`, `apps/web/src/styles.css`; test `apps/web/e2e/studio.spec.ts`.

**Interfaces:** view state живёт внутри `ReferencePanel`, сбрасывается при `assetId`; кнопки `Увеличить референс`, `Уменьшить референс`, `Вписать референс`, slider `Масштаб просмотра референса`; preview region `Референс рядом с холстом`.

- [x] RED: E2E проверка кнопки/ползунка/сброса/перемещения/колеса и отсутствие изменения документа; ожидаемый FAIL на [CI #32](https://github.com/m-amirov/eskizno/actions/runs/42765527222). Pinch добавлен в тот же сценарий перед GREEN-прогоном.
- [x] GREEN: zoom preview через CSS transform, pointer capture с Map по pointerId, wheel listener non-passive, панорамирование при zoom>1, reset при смене файла.
- [x] Typecheck и unit PASS (194/194), первый Chromium E2E zoom + pinch PASS на [CI #34](https://github.com/m-amirov/eskizno/actions/runs/42766636082). Коммит `556e643`; общий browser gate требует исправления утверждения в layout-тесте.

## Task 3: Resizable layout and responsive acceptance

**Files:** Modify `apps/web/src/studio/Studio.tsx`, `apps/web/src/styles.css`, `apps/web/e2e/studio.spec.ts`; update `README.md` и этот план.

**Interfaces:** `studio-reference-layout` с переменной шириной панели; `role="separator"` и стрелки клавиатуры; на <=1120 px вертикальная компоновка, ref перед холстом и кнопка `Свернуть референс`.

- [x] RED: E2E размеры на 1280×800 и изменение ширины мышью/клавиатурой; ожидаемый FAIL на CI #32. Портретные проверки дополняют сценарий.
- [x] GREEN: ограниченные доли колонок, preview занимает доступную площадь, портрет использует документную прокрутку.
- [ ] Full run: `npm run typecheck && npm run test:unit && npm run build && npm run test:e2e`, v0.4 regression; CI screenshots desktop/tablet/mobile и визуальная оценка.
- [ ] Документация фактических PASS/NOT TESTED и отдельный Draft-коммит, без merge.
