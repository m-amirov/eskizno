# R0 — Technical Audit of the Eskizno Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Установить фактические технические ограничения редактора E1 до реализации общего Professional/Learning Core, не изменяя поведение продукта.

**Architecture:** R0 — воспроизводимый read-only аудит актуального исходного дерева `feat/e1-7-finish`. Отдельный отчёт фиксирует доказательства по контракту документа, рендеру, вводу, сохранению, производительности, двум UI и prior gates; новый код функций не создаётся.

**Tech Stack:** React, TypeScript, Canvas 2D, IndexedDB, Vitest, Playwright Chromium, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-10-professional-editor-dual-workspaces-design.md`.

## Global Constraints

- Не изменять `main`, существующий Draft PR #14 и прототип v0.4.
- Исходная точка — точный SHA ветки `feat/e1-7-finish`, не старый локальный checkout.
- Новых функций, зависимостей, облака, аналитики и авторизации не вводить.
- Не смешивать результаты CI Chromium с физической проверкой stylus/touch.
- Не объявлять release-ready по статическому аудиту или тестам без аппаратного gate.
- Результаты сохранить в `docs/qa/r0-editor-technical-audit.md`; промежуточные замеры в изолированном временном каталоге, без правок продукта.

## Review Focus

1. Старые проекты v1/v2: миграции не должны терять рисунки и вложенные референсы.
2. 2048×2048+ и множество операций: выявить задержки и рост памяти; не гадать по маленькому фикстурному тесту.
3. `pointercancel`, pen+touch, pinch: срыв жеста не должен коммитить неполный штрих.
4. Маски/группы/трансформации будущих слоёв: текущие команды и экспорт могут иметь скрытые предположения о двух типах слоёв.
5. Урок и свободная студия: UI-проверки и политика инструментов должны быть отделены от сериализованного документа, иначе существующий рисунок потеряет совместимость.

---

### Task 1: Исходная версия и baseline

**Files:** Inspect `apps/web/package.json`, `.github/workflows/e1-browser-gate.yml`, `README.md`, `apps/web/e2e/**`.

**Interfaces:** Produces `R0Baseline`: exact SHA, environment, test commands, counts and outcomes.

- [ ] Проверить актуальный SHA через `git ls-remote origin refs/heads/feat/e1-7-finish` и создать изолированный snapshot `git archive`.
- [ ] Проверить `package.json` и workflow на фактические команды запуска, зафиксировать версии окружения.
- [ ] Запустить `npm run typecheck`, `npm run test:unit`, `npm run build` и `npm run test:e2e` при наличии браузера; сохранить выходные коды и блокеры.
- [ ] Сверить результаты с E1 browser gate #38, не копируя число PASS без проверки.
- [ ] Записать доказательства в отчёт, пометить ограниченные проверки NOT TESTED.

### Task 2: Модель, история, сохранение и экспорт

**Files:** Inspect `apps/web/src/editor/{model,events,history,persistence,export,import-image}.ts`, `apps/web/src/studio/useLocalProjects.ts` and their tests.

**Interfaces:** Produces `DocumentRisks`: current invariants, migration boundaries, reversible actions, recovery and data-loss risks.

- [ ] Выписать schema version, максимумы, поддерживаемые операции, соглашения об ID/координатах/ссылках на ассеты.
- [ ] Проследить путь `ProjectAction → history → IndexedDB → reload` и ошибочное сохранение/восстановление; указать фактические тесты.
- [ ] Проследить side/overlay references, PNG and non-destructive operation constraints; найти предположения для будущих масок/групп/выделения.
- [ ] Записать риски с severity, причиной и минимальным дальнейшим spike/тестом (в R0 не исправлять).

### Task 3: Рендер, кисти, ввод и performance

**Files:** Inspect `apps/web/src/editor/{render,brushes,geometry,EditorCanvas}.ts(x)` and relevant tests.

**Interfaces:** Produces `RenderInputRisks`: cache invalidation, replay costs, pressure/tilt readiness, gesture safety, measured/unknown metrics.

- [ ] Построить карту canvas draw pipeline, dirty boundaries, caches and data copies; указать недостатки для больших документов.
- [ ] Проверить использование `PointerEvent` и сохранение pressure/tilt; разделить desktop Chromium coverage и реальные pen tests.
- [ ] Если Playwright доступен, измерить в изолированном диагностическом сценарии latency/FPS/saving/memory на заранее описанных документах; иначе зарегистрировать конкретную техническую причину NOT TESTED.
- [ ] Определить, какие меры (tile cache, worker, отдельная geometry, другой renderer) стоит оценить после измерений; не выбирать технологию заранее.

### Task 4: Граница Professional/Learning и R1 decision

**Files:** Inspect `apps/web/src/{App,studio/Studio,editor/EditorCanvas}.tsx`, `apps/web/src/editor/model.ts`, `docs/**`.

**Interfaces:** Produces `R1Gate`: a minimal vertical slice scope and explicit go/no-go criteria.

- [ ] Установить где сейчас живут tool IDs, UI state, lesson metadata, persistence; убедиться, что учебный экран действительно не содержит завершённого workflow.
- [ ] Определить минимальные контракты Tool Registry и Tool Policy без нового слоя в документе v2.
- [ ] Составить первую миграционную последовательность: read-only registry → policy tests → один урок → progress persistence → copy-to-studio.
- [ ] Сделать самопроверку отчёта: каждое наблюдение с точным источником/результатом, каждый неизвестный показатель NOT TESTED, никакого искусственного PASS.
- [ ] Сохранить отчёт и план в отдельном документационном Draft PR; не менять статус #14 и не выполнять merge.

## Decision Gate

R0 считается полностью завершённым лишь при наличии проверяемого baseline, анализа рисков и одного из вариантов: `measured performance` либо **явного** списка недостающих измерений и причин. Если аппаратное тестирование недоступно, факт **не заменяется** синтетикой; возможен вывод `R0 static audit complete / hardware acceptance pending`. Реализация R1 — отдельное согласование.
