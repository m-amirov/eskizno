# Studio Artboard Viewport Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В обычной свободной студии весь холст, панель инструментов и строка состояния помещаются в доступную высоту экрана без вертикальной прокрутки страницы.

**Architecture:** Использовать существующий ResizeObserver и расчёт размера холста из режима Fullscreen также в обычном режиме. В CSS студия становится ограниченной высотой viewport flex/grid-областью; Stage вписывает пропорциональный холст, а не растягивает его. На узком экране панель слоёв остаётся свёрнутой под холстом.

**Tech Stack:** React 19, CSS, TypeScript, Vitest, Playwright.

**Spec:** Утверждённый визуальный аудит 09.11.2026, пункт P0 «Холст не помещается на экране»; также `docs/superpowers/specs/2026-11-09-eskizno-immersive-editor-design.md` (сохранить геометрию и fullscreen).

## Global Constraints

- Сохраняем существующие цвета, типографику, инструменты, жесты, модель документа и визуальные элементы остальных разделов.
- Исправляем только обычное размещение холста; отдельная адаптивная перестройка панели инструментов — следующий этап.
- PR #10 остаётся Draft, пока браузерные и реальные сенсорные проверки не подтверждены.

## Review Focus

- Широкий монитор 1440×900: холст и footer целиком в viewport, документ не прокручивается.
- Планшет 820×1180: холст и свёрнутая панель слоёв целиком в viewport.
- Телефон 390×844: нет горизонтального/вертикального переполнения; малый экран не ломает toolbar.
- Низкий экран 390×568 и увеличение масштаба браузера: включается доступная прокрутка вместо скрытия/сжатия инструментов.
- Canvas 1024×768 остаётся пиксельно тем же и пропорциональным 4:3; координаты pointer остаются корректными.
- Полный экран, zoom и pinch сохраняют прежнее поведение.

---

### Task 1: Fit расчёт и layout обычной студии

**Files:** Create `apps/web/src/editor/canvasFit.ts`, `apps/web/src/editor/canvasFit.test.ts`; modify `apps/web/src/editor/EditorCanvas.tsx`, `apps/web/src/styles.css`, `apps/web/e2e/drawing.spec.ts`.

**Interfaces:** `fitCanvasWidth(availableWidth: number, availableHeight: number, artboardWidth: number, artboardHeight: number): number | null` возвращает отображаемую ширину canvas без растяжения; `EditorCanvas` применяет её при изменении stage.

- [x] **Step 1:** RED: unit для ограничения по высоте, по ширине, нулевой/невалидной области. E2E для canvas/footer в пределах viewport на 1440×900, 820×1180, 390×844 и scroll-fallback 390×568.
- [x] **Step 2:** Unit с отсутствующей реализацией завершился FAIL; интеграционный тест на старом fullscreen-only условии завершился FAIL (`''` вместо `768px`).
- [x] **Step 3:** GREEN: адаптированы ResizeObserver, inline width и CSS высот/overflow, добавлен scroll-fallback до 700px по высоте. Пиксельный размер и input geometry не менялись.
- [x] **Step 4:** Unit suite, build, diff check; Playwright E2E запущен, но Chromium падает до открытия страницы (`socket() failed: Operation not permitted`) — browser gate остаётся открытым.
- [ ] **Step 5:** Зафиксировать и отправить изменения в `feat/e1-3-canvas-render` для Draft PR #10 (без merge).

## Verification evidence

- `npm run test:unit` — 126/126 PASS (14 файлов) после внесения регрессионного теста (до low-height fallback).
- `npm run build` — TypeScript и Vite PASS (до low-height fallback; CSS не меняет TS/JS).
- `git diff --check` — PASS (до low-height fallback).
- `ESKIZNO_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e -- -g 'обычная студия вмещает|при очень низком viewport'` — 2/2 blocked at Chromium launch, не приравнивать к проверке UI.
- Независимый read-only review отметил риск недоступности при низкой высоте; добавлен fallback с документной прокруткой и отдельным E2E-сценарием. Визуально не подтверждено до работоспособного Chromium.
