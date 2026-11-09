# Eskizno E1 — Editor and Free Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать пригодный для самостоятельного рисования браузерный редактор «Эскизно»: четыре кисти, палитра, многослойный документ, сохраняемые проекты и свободная студия с собственным эскизом/референсом.

**Architecture:** Новый основной клиент `apps/web` на ранее утверждённых React + TypeScript + Canvas 2D; существующий самостоятельный прототип `prototypes/stylus-editor-v1` v0.4 оставить рабочим и неизменным. Модель документа, историю, рендерер и IndexedDB вынести из React; редактор использует одни и те же данные при рисовании, сохранении и PNG-экспорте.

**Tech Stack:** TypeScript, React, Canvas 2D, Pointer Events; Vite для клиентского приложения, Vitest для логики, Playwright + Chromium для браузерных сценариев, IndexedDB для локальных проектов. Backend, облако, платежи, внешние сервисы и аналитика в E1 не входят.

**Spec:** `docs/superpowers/specs/2026-11-09-eskizno-adult-learning-product-design.md` + утверждённое дополнение `docs/superpowers/specs/2026-11-09-eskizno-interactive-feedback-gamification-design.md`; прежние гарантии `docs/superpowers/specs/2026-11-08-eskizno-mvp-design.md` и `prototypes/stylus-editor-v1/README.md`.

## Global Constraints

- Первой обслуживается взрослая аудитория; учебные E2/E3 не реализуются в этом плане.
- Полноценный редактор и свободная студия используют одни и те же холст, кисти, палитры и слои.
- Стилус приоритетен, мышь и палец поддерживаются; давление и наклон не объявлять поддержанными до испытаний.
- Три режима свободной студии: пустой холст, рисунок поверх загруженного эскиза, референс отдельно от холста.
- Референс всегда отделён от собственного рисунка; ластик не удаляет другой слой, заблокированный слой или учебные направляющие.
- Переходы, перезапуск, неудачное сохранение и сбои импорта не должны незаметно терять данные.
- По умолчанию личные изображения не отправляются в сеть; без аккаунтов, трекеров, платежей и ИИ-оценки.
- Гибридный путь утверждён: E1 только передаёт локальные события завершённых действий и хранит минимальный прогресс; оценка упражнений, испытания и достижения появляются в E2–E3. Никаких ИИ-вызовов в E1.
- Сохранять спокойный стиль профессионального редактора с большим холстом и доступными действиями на телефоне.
- Выполнять небольшими PR от актуального `main`, без публикации продукта и без изменения принятого прототипа v0.4.

## Review Focus

1. **Референс со скрытым или заблокированным слоем:** ластик, штрих и удаление не изменяют его; E1.3/E1.6 тестируют неизменность содержимого.
2. **Завершение жеста двумя пальцами либо `pointercancel`:** черновой штрих не превращается в случайную линию; E1.4 покрывает E2E-сценарий.
3. **Неподходящий/огромный файл:** импорт объяснимо отклоняется, действующий проект остаётся доступным; E1.6 тестирует ограничения и битый файл.
4. **Заполненное/недоступное локальное хранилище:** интерфейс сообщает, что проект не сохранён, предлагает экспорт/повтор и не пишет ложное «Сохранено»; E1.5 тестирует отказ транзакции.
5. **Восстановление старого урока v1:** импорт v1 не удаляет исходный ключ и сохраняет порядок штрихов, ластик и шаг; E1.5 проверяет миграцию и повторный запуск.
6. **Отменённый штрих / undo после завершения:** система не излучает `strokeCommitted` для `pointercancel` и может строить актуальную оценку на текущем документе; E1.2/E1.4 проверяют событие и итоговое состояние.

---

## File map and API contract

`prototypes/stylus-editor-v1/{app,core,ink}.mjs` — **только источник проверенного поведения**; никакой массовой перезаписи. `app.mjs` содержит обработку Pointer Events/жестов, `core.mjs` — view/history/валидацию v1, `ink.mjs` — стирание через `destination-out` на отдельной прозрачной поверхности. Их тесты остаются регрессией.

Новые файлы внутри `apps/web`:

| Путь | Ответственность |
| --- | --- |
| `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `playwright.config.ts` | Сборка, тесты и статическая оболочка |
| `src/main.tsx`, `src/App.tsx`, `src/styles.css` | Запуск и навигация «Мои работы / Свободная студия» |
| `src/editor/model.ts` | Версионированные типы проекта, слоёв и операций; чистые функции изменения состояния |
| `src/editor/events.ts` | Минимальный поток семантических действий для будущих правил урока, без телеметрии pointermove |
| `src/editor/history.ts` | Общая undo/redo история операций со слоями, кистью и референсом |
| `src/editor/geometry.ts` | Точные преобразования экрана, холста, zoom/pan/pinch |
| `src/editor/brushes.ts` | Идентификаторы кистей, контроль параметров, отдельный размер ластика |
| `src/editor/render.ts` | Растеризация кистей, независимая поверхность слоя, композит и экспорт |
| `src/editor/persistence.ts` | IndexedDB, атомарная запись, миграция старого документа v1, независимый локальный прогресс |
| `src/editor/import-image.ts` | Валидация, декодирование и преобразование импортированного изображения |
| `src/editor/EditorCanvas.tsx` | Pointer Events и отображение редактора, без хранения модели в canvas |
| `src/editor/Toolbar.tsx`, `LayerPanel.tsx`, `PalettePanel.tsx` | Доступные клавиатурой и касанием органы управления |
| `src/studio/Studio.tsx`, `ReferencePanel.tsx`, `ProjectGallery.tsx` | Свободная студия, боковой референс, список проектов |
| `src/editor/*.test.ts`, `src/studio/*.test.tsx`, `e2e/*.spec.ts` | Unit, integration и браузерная регрессия |

Модель `DrawingProject` (`schemaVersion: 2`): `id: string`, `title: string`, `width: number`, `height: number`, `layers: Layer[]` (снизу вверх), `activeLayerId: string`, `palette: string[]`, `createdAt/updatedAt: number`, опциональное `lesson: { id: string; audience: 'adult'|'child'; mode: 'trace'|'construct'|'free'; step: number }`. `Layer` — общие `id/name/visible/locked/opacity` и ровно один вариант содержимого: `kind: 'paint'`, `strokes: Stroke[]`; либо `kind: 'reference'`, `assetId: string`, `placement: 'overlay'|'side'`, `transform: { x,y,scale,rotation }`. Рисовать поверх можно только при `placement: 'overlay'`; `side` означает отдельную панель, не пиксели экспорта. `Stroke` — `id`, `kind: 'ink'|'erase'`, `brushId`, `color`, `width`, `opacity`, `points: { x,y }[]` в нормализованных 0..1, опциональный `step`. Ресурсы изображений — Blob в IndexedDB, а не data URL внутри JSON.

Единый договор модулей: `createProject(options): DrawingProject`; `applyAction(project, action): DrawingProject`; `createProjectHistory(initial): ProjectHistory`; `commitAction(history, action): ProjectHistory`; `undoAction(history)/redoAction(history): ProjectHistory`; `createActionEvent(action, before, after): DrawingEvent|null` (только при действительном изменении проекта; `strokeCommitted` ровно раз на завершённый жест, без сырых `pointermove`); `renderProject(ctx, project, assets, options): void`; `saveProject(db, project, assets): Promise<void>`; `loadProject(db, id): Promise<SavedProject|null>`; `saveProgress(db, progress): Promise<void>`; `loadProgress(db): Promise<ProgressState>`; `importReference(file): Promise<ImportedImage>`; `exportPng(project, assets, { includeReferences }): Promise<Blob>`. Действие рисования всегда адресует `layerId`; изменение locked-слоя отклоняется без изменения модели. `ProgressState` на E1 хранит только `schemaVersion`, `lessonAttempts` и `earnedAchievementIds` (пустые по умолчанию); правила начисления и UI достижений в E1 отсутствуют.

Для E1 определить проверяемые ограничения: холст по умолчанию **1200×900 px**, максимум **16 слоёв**, PNG/JPEG/WebP до **10 MiB**, декодированный размер до **4096 px по каждой стороне и 16 Мп суммарно**; ошибки отображать на русском. Начальные значения — продуктовые технические ограничения E1, подлежат пересмотру по результатам тестирования устройств. Хранить исходные пропорции изображения при трансформации.

## Task E1.1: Базовая оболочка и проверочный контур

**Files:** Create `apps/web/package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `playwright.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `e2e/app.spec.ts`; modify root `README.md` только добавлением инструкции запуска E1.

**Interfaces:** Produces `App`, навигация `studio/gallery`, scripts `dev`, `build`, `typecheck`, `test:unit`, `test:e2e`; `Playwright` автоматически запускает локальный Vite dev server и не требует заранее запущенного порта.

- [ ] **Step 1 — RED:** Создать `e2e/app.spec.ts`: проверить заголовок «Эскизно», доступность кнопок «Свободная студия»/«Мои работы» и отсутствие ошибок JS.
- [ ] **Step 2 — verify RED:** Из `apps/web` выполнить `npm run test:e2e -- e2e/app.spec.ts`; ожидается FAIL, поскольку приложения ещё нет.
- [ ] **Step 3 — implementation:** Добавить минимальную React+TS оболочку и настройки Vite/Vitest/Playwright, без стороннего UI-kit и без network runtime; зафиксировать совместимые версии в lockfile.
- [ ] **Step 4 — verify GREEN:** `npm ci && npm run typecheck && npm run build && npm run test:e2e -- e2e/app.spec.ts`; все должны завершиться кодом 0; записать реальные версии Node/браузера.
- [ ] **Step 5 — commit:** `git add apps/web README.md && git commit -m "feat(eskizno): scaffold browser drawing studio"`.

## Task E1.2: Модель документа и undo/redo операций

**Files:** Create `apps/web/src/editor/model.ts`, `history.ts`, `events.ts`, `model.test.ts`, `history.test.ts`, `events.test.ts`.

**Interfaces:** `createProject({title?,width?,height?,lesson?})`, `applyAction(project, action)`, `createProjectHistory(initial)`, `commitAction(history, action)`, `undoAction`, `redoAction`, `createActionEvent(action,before,after)`; `ProjectAction` union с `addStroke`, `addLayer`, `removeLayer`, `reorderLayer`, `renameLayer`, `setLayerVisibility`, `setLayerLock`, `setLayerOpacity`, `setActiveLayer`, `setReferenceTransform`, `setPalette`.

- [ ] **Step 1 — RED:** Тест `model.test.ts`: новый проект имеет валидный активный paint-слой; `addStroke` меняет только указанный слой; stroke по locked-слою не проходит; `removeLayer` не оставляет проект без paint-слоя; лимит 16 слоёв соблюдается.
- [ ] **Step 2 — verify RED:** `npm run test:unit -- src/editor/model.test.ts`; до реализации FAIL.
- [ ] **Step 3 — implementation:** Реализовать discriminated unions, чистые действия и проверку параметров документа; команды, касающиеся несуществующего слоя, не должны менять состояние.
- [ ] **Step 4 — GREEN:** `npm run test:unit -- src/editor/model.test.ts`; PASS.
- [ ] **Step 5 — RED:** Тест `history.test.ts`: undo/redo восстанавливает и stroke, и слой, и настройки; новый action после undo очищает redo; ограничение истории 80 снимков, как в v0.4.
- [ ] **Step 6 — implementation + GREEN:** Реализовать `history.ts`; `npm run test:unit -- src/editor/history.test.ts` — PASS; `npm run typecheck` — PASS.
- [ ] **Step 7 — RED + GREEN:** `events.test.ts`: `addStroke` формирует ровно один `strokeCommitted`, отклонённый action и `pointercancel` не создают событий, отмена меняет только доступное состояние; затем реализовать `events.ts`. `npm run test:unit -- src/editor/events.test.ts` — PASS.
- [ ] **Step 8 — commit:** `git add apps/web/src/editor && git commit -m "feat(eskizno): add layered document and reversible actions"`.

## Task E1.3: Холст, независимый рендер слоёв и геометрия

**Files:** Create `apps/web/src/editor/geometry.ts`, `render.ts`, `EditorCanvas.tsx`, `geometry.test.ts`, `render.test.ts`; add `apps/web/e2e/drawing.spec.ts`.

**Interfaces:** `screenToArtboard`, `zoomView`, `panView`, `pinchView` повторяют математическую семантику `prototypes/stylus-editor-v1/core.mjs`; `renderProject(ctx, project, assets, { zoom,panX,panY, includeReferences })` рисует каждый paint-слой в отдельном прозрачном буфере, затем собирает слои с их непрозрачностью.

- [ ] **Step 1 — RED:** В `geometry.test.ts` проверить zoom 1…4, привязку к точке указателя и pan clamp на основании существующих `core.test.mjs`; в `render.test.ts` проверить пиксели: стирание на верхнем слое не стирает нижний и заблокированный референс, hidden-слой отсутствует в композите, opacity слоя применяется только при сборке.
- [ ] **Step 2 — verify RED:** `npm run test:unit -- src/editor/geometry.test.ts src/editor/render.test.ts`; FAIL.
- [ ] **Step 3 — implementation:** Перенести проверенную геометрию с сохранением семантики. `renderProject` использует прозрачный offscreen Canvas для каждого слоя; `destination-out` только в контексте текущего paint-слоя; содержимое референса не модифицировать.
- [ ] **Step 4 — verify GREEN:** `npm run test:unit -- src/editor/geometry.test.ts src/editor/render.test.ts`; PASS, включая пиксели в реальном Canvas2D тестовом окружении (без skipped).
- [ ] **Step 5 — RED + implementation:** В `e2e/drawing.spec.ts` написать и выполнить сценарий рисования мышью, zoom без изменения размера DOM canvas, undo/redo, независимых слоёв; подключить `EditorCanvas` к модели; добиться PASS.
- [ ] **Step 6 — commit:** `git add apps/web && git commit -m "feat(eskizno): render independent paint layers"`.

## Task E1.4: Управление пером и базовые инструменты

**Files:** Create `apps/web/src/editor/brushes.ts`, `Toolbar.tsx`, `brushes.test.ts`; update `render.ts`, `EditorCanvas.tsx`, `e2e/drawing.spec.ts`.

**Interfaces:** `getBrushDefaults(id: 'pencil'|'liner'|'marker'|'soft'): BrushSettings`; `normalizeToolSettings(settings): BrushSettings`; `EditorCanvas` создаёт жест как `addStroke` только на `pointerup`, отменяет при `pointercancel`, допускает альтернативные mouse/touch/pen.

- [ ] **Step 1 — RED:** `brushes.test.ts`: четыре отдельные кисти, независимые размеры кисти/ластика, ограничение диапазонов, прозрачность 0…1; `e2e/drawing.spec.ts`: одновременное второе касание отменяет черновой штрих и переходит в pan/pinch без случайной линии.
- [ ] **Step 2 — verify RED:** `npm run test:unit -- src/editor/brushes.test.ts && npm run test:e2e -- e2e/drawing.spec.ts`; FAIL до изменения.
- [ ] **Step 3 — implementation:** Добавить Pencil (тонкая линия), Liner (ровный контур), Marker (полупрозрачный мазок) и Soft (мягкий край) с отличающимся пиксельным результатом; параметры фиксируются в Stroke на момент рисования. Обрабатывать coalesced events, pointer capture, pen приоритетно; CSS `touch-action: none` только на холсте.
- [ ] **Step 4 — verify GREEN:** Unit + E2E; отдельный пиксельный тест различий хотя бы четырёх кистей. Переключение инструмента и размера на телефоне сохраняет независимый размер ластика.
- [ ] **Step 5 — commit:** `git add apps/web && git commit -m "feat(eskizno): support four brushes and pen gestures"`.

## Task E1.5: Проекты и локальное сохранение без потерь

**Files:** Create `apps/web/src/editor/persistence.ts`, `persistence.test.ts`, `apps/web/src/studio/ProjectGallery.tsx`, `apps/web/src/studio/Studio.tsx`, `apps/web/e2e/persistence.spec.ts`; update `App.tsx`.

**Interfaces:** `openProjectDb(): Promise<IDBDatabase>`, `saveProject(db, project, assets): Promise<void>`, `loadProject(db, id): Promise<SavedProject|null>`, `listProjects(db): Promise<ProjectSummary[]>`, `deleteProject(db,id): Promise<void>`, `migrateLegacyV1(db, raw): Promise<string|null>`; stores `projects`, `assets` с versioned IndexedDB schema.

- [x] **Step 1 — RED:** `persistence.test.ts` с IndexedDB polyfill: save/load полностью восстанавливает layers/opacity/image Blob; `saveProgress/loadProgress` хранит локальное состояние прогресса отдельно от проекта, корректно восстанавливает пустое значение и не дублирует ID достижений; транзакция ошибки не помечается успешной; `migrateLegacyV1` переносит документ из `eskizno:prototype:botanical-branch:v1` (не удаляет ключ), сохраняет `step`, `kind:'erase'`, порядок и не дублирует при повторном запуске; повреждённый JSON не разрушает галерею.
- [x] **Step 2 — verify RED:** `npm run test:unit -- src/editor/persistence.test.ts`; FAIL до реализации.
- [x] **Step 3 — implementation:** Реализовать асинхронное сохранение в IndexedDB атомарной транзакцией, debounce после изменённых состояний, идемпотентную миграцию через валидатор v1, UI состояния «Сохранение… / Сохранено / Не удалось сохранить», список проектов, открытие и подтверждённое удаление. Перенос v1 возможен только при доступности исходного `localStorage` в том же origin; при смене домена автоматический перенос не обещать.
- [x] **Step 4 — GREEN:** `npm run test:unit -- src/editor/persistence.test.ts`; PASS (8/8). После ревью добавлены регрессии удаления мигрированного проекта, гонки Undo, сохранения пустой ревизии, повторного открытия базы, обновления превью и аварийного PNG.
- [ ] **Step 5 — browser gate:** В `e2e/persistence.spec.ts` создать проект, нарисовать на двух слоях, перезагрузить, открыть из галереи и сравнить данные/пиксели; вызвать отказ IndexedDB и проверить отсутствие ложного индикатора сохранения. `npm run test:e2e -- e2e/persistence.spec.ts` — PASS.

  **Блокер E1.5:** E2E-сценарии написаны, но в данном executor Chromium не стартует: системный `/usr/bin/chromium` завершается с `socket() failed: Operation not permitted (1)`; Playwright-bundled Chromium отсутствует. Gate не пройден, PR остаётся Draft.
- [x] **Step 6 — commit:** `git add apps/web && git commit -m "feat(eskizno): persist local layered projects"`. Коммит подготовлен отдельно от `main`; browser gate (Step 5) остаётся открытым.

## Task E1.6: Режимы свободной студии и собственный эскиз

**Files:** Create `apps/web/src/editor/import-image.ts`, `import-image.test.ts`, `apps/web/src/studio/ReferencePanel.tsx`, `apps/web/src/editor/LayerPanel.tsx`, `apps/web/e2e/studio.spec.ts`; update `Studio.tsx`, `render.ts`, `App.tsx`.

**Interfaces:** `importReference(file: File): Promise<{ blob: Blob; width: number; height: number; mime: string }>`; `addReferenceLayer(project, assetId, transform): DrawingProject`; три события начала `newBlank()`, `newWithTracing(file)`, `newWithSideReference(file)`; `assets` не сериализуются в localStorage.

- [ ] **Step 1 — RED:** `import-image.test.ts`: valid PNG/JPEG/WebP, reject MIME без декодирования, размер >10 MiB, изображения >4096 px по стороне или >16 Мп, пустой/испорченный файл; ошибка не меняет текущий проект.
- [ ] **Step 2 — verify RED:** `npm run test:unit -- src/editor/import-image.test.ts`; FAIL.
- [ ] **Step 3 — implementation:** Распознать по декодированию, проверить размеры и корректно освобождать objectURL/ImageBitmap. Режим обводки создаёт заблокированный reference-слой и активный paint-слой; режим по образцу размещает отдельную панель, не влияющую на масштаб холста.
- [ ] **Step 4 — GREEN:** `npm run test:unit -- src/editor/import-image.test.ts`; PASS.
- [ ] **Step 5 — browser gate:** `e2e/studio.spec.ts`: открыть каждый из 3 входов; импортировать файл; изменить opacity/позицию/масштаб/поворот референса без потери пропорций; нарисовать поверх; стереть участок; скрыть референс по «Показать без эскиза»; reload восстанавливает референс; импорт битого файла сохраняет старый проект.
- [ ] **Step 6 — verify + commit:** `npm run test:e2e -- e2e/studio.spec.ts` и `npm run typecheck` — PASS; `git add apps/web && git commit -m "feat(eskizno): add imported sketch and side reference"`.

## Task E1.7: Палитра, слои, экспорт и UX-приёмка

**Files:** Create `apps/web/src/editor/PalettePanel.tsx`, `apps/web/e2e/finish.spec.ts`; update `LayerPanel.tsx`, `render.ts`, `Studio.tsx`, `Toolbar.tsx`, `styles.css`, `App.tsx`, root `README.md`.

**Interfaces:** `pickCompositedColor(ctx, point): string` возвращает `#RRGGBB`; `exportPng(project, assets, {includeReferences}: {includeReferences:boolean}): Promise<Blob>`; экспорт без UI/направляющих при 100% масштабе и нативном размере проекта.

- [ ] **Step 1 — RED:** Browser test: выбрать произвольный цвет, извлечь пипеткой цвет пикселя, сохранить ограниченную палитру; изменить название/порядок/видимость/блокировку/прозрачность слоя; скрытый и заблокированный слой не редактируется.
- [ ] **Step 2 — implementation:** Построить компактные панели palette/layers, доступные на планшете/телефоне и клавиатурой; добавить выбор цвета (цветовой круг или HSV-регуляторы, не только три фиксированных цвета), историю/набор цветов, пипетку итогового композита без UI, настройки активного слоя. Сохранять палитру с проектом.
- [ ] **Step 3 — verify:** `npm run test:e2e -- e2e/finish.spec.ts`; PASS для пунктов палитры/слоёв.
- [ ] **Step 4 — RED:** Пиксельные экспортные тесты: PNG без референса не содержит его пиксели, опция включения добавляет референс, zoom не влияет на размер/координаты экспорта; PNG корректно читается.
- [ ] **Step 5 — implementation + GREEN:** Использовать тот же `renderProject` в export с `{zoom:1, panX:0, panY:0}`, выполнить экспорт в Blob; `npm run test:unit` и `npm run test:e2e -- e2e/finish.spec.ts` — PASS.
- [ ] **Step 6 — UX check:** Экраны 1280×800, 768×900, 390×844: нет горизонтальной прокрутки; холст доступен; панель слоёв сворачивается; выбранная кисть и размер ластика видны; у критических кнопок есть фокус/названия.
- [ ] **Step 7 — commit:** `git add apps/web README.md && git commit -m "feat(eskizno): finish palette layers and png export"`.

## E1 integration/release gates

Это отдельная приёмка после E1.7, а не автоматическое объявление релиза.

- [ ] Установить зависимости с lockfile: `cd apps/web && npm ci`.
- [ ] `npm run typecheck && npm run test:unit && npm run build && npm run test:e2e` — реальные результаты и номера выполненных сценариев, не PASS по описанию.
- [ ] Регрессия старого v0.4: `cd ../../prototypes/stylus-editor-v1 && node --test core.test.mjs ink.test.mjs ui.test.mjs && node --check app.mjs`; пропущенные пиксельные тесты перечислить отдельно.
- [ ] Матрица устройств: мышь/Chromium; touch на планшете и телефоне; физический стилус на названной модели/браузере. Не проверенное пометить **NOT TESTED**, а не PASS.
- [ ] Проверить 2–3 проекта с реальными референсами, локальную приватность загрузки, отзывчивость кистей, восстановление после перезагрузки, отказ IndexedDB, ограничения изображения, экспорт и редактирование слоёв.
- [ ] Приёмка без публикации на площадках и без объявления готового продукта. При проблемах сохранить PR открытым и перечислить блокеры.

**Порядок PR:** E1.1 → E1.2 → E1.3 → E1.4 → E1.5 → E1.6 → E1.7, каждый от актуального `main` после проверки предыдущего. При необходимости объединить только соседние мелкие изменения, если тестовая граница не разрушается. Не объединять всю E1 в одну непроверяемую замену UI.

**За пределами E1:** алгоритмы оценки рисунка, контекстные подсказки, испытания и фактическое начисление достижений (E2–E3); библиотека 12 уроков (E3), маски/группы/режимы наложения, облачные проекты, совместимость редактируемых форматов Krita/Photoshop, биллинг, аккаунты. Подготовить отдельный методический план E2 после принятия технической E1.

## Handoff

План предназначен **на согласование**. Утверждённый продуктовый дизайн из PR #5 не означает автоматическое разрешение на техническое внедрение. До отдельного подтверждения этого плана не создавать `apps/web`, не трогать прототип и не публиковать сайт.
