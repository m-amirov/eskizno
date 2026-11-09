# Eskizno MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** создать доступный в браузере вертикальный срез «Эскизно»: стилус-ориентированный редактор, 6-шаговый урок «Ветка с листьями», три режима обучения, локальное сохранение и экспорт PNG.

**Architecture:** статический сайт из главной страницы и страницы урока (Vite multi-page build), с React UI и Canvas 2D для рисования. Штрихи — нормализованные векторные данные с версионированным форматом; ввод, история, отрисовка, учебные шаги и хранение разделены тестируемыми интерфейсами. Сервер, аккаунты, AI API и внешнее сохранение изображений отсутствуют.

**Tech Stack:** React + TypeScript + Vite, Canvas 2D + Pointer Events, Vitest + React Testing Library, Playwright; npm, ESLint. При реализации использовать совместимые актуальные версии, зафиксировать точные версии в lockfile и записать Node version в README/CI. Не выдумывать версии заранее.

**Spec:** `docs/superpowers/specs/2026-11-08-eskizno-mvp-design.md`.

## Global Constraints

- Приоритет стилуса; мышь и касания — поддерживаемые альтернативы, но реальная поддержка пера требует испытаний на устройстве.
- Одна оригинальная ботаническая иллюстрация, 6 шагов, детские и взрослые подсказки.
- Три режима: «Повтори», «Пойми», «Нарисуй сам»; переключение не удаляет штрихи.
- Художественное качество не оценивается автоматически; продвижение по шагам не блокируется субъективным оцениванием.
- Максимально большой холст, компактные панели, без мультяшного оформления, анимированных маскотов, геймификации и рекламных блоков.
- Нет backend, регистрации, платежей, стороннего AI, публичных профилей и трекеров.
- Основные статические тексты главной и страницы урока доступны без выполнения JS.
- Все реализации через TDD, без массового рефакторинга и с реальными тестовыми/ручными доказательствами.
- Никакой публикации на реальном домене или запуска монетизации без отдельного разрешения.

## Review Focus

1. **Второй указатель/ладонь во время пера:** дополнительное касание не создаёт лишний штрих. Тест в Task 3.
2. **Resize, DPR и offset у canvas:** координаты пользователя остаются корректными после изменения размеров. Тесты в Task 2 и Task 3.
3. **Отмена/повтор после работы ластиком:** операции восстанавливают состояние, новый штрих очищает redo. Тесты в Task 2.
4. **Сломанное/старое/переполненное локальное хранилище:** приложение не падает и сообщает об ограничении. Тесты в Task 5.
5. **Переключение режима или возрастной версии посреди урока:** рисунок не исчезает, направляющие не попадают в PNG. Тесты в Task 4 и Task 5.

## Visual approval gate — before product code

- [ ] Создать 2 согласованных макета **одного** направления (планшет 1280×800 и телефон 390×844); профессиональный редактор, холст доминирует, компактная левая панель, короткие подсказки, доступные кнопки. Это визуальное предложение, не автоматическое право на реализацию.
- [ ] Показать владельцу и получить явное утверждение. Если он меняет механику, обновить spec и этот план до начала Task 1.
- [ ] Приёмка: понятны инструменты, прогресс 1/6 и переключатель режима; нет горизонтальной прокрутки, декоративного «нейрослопа» и скрытых критичных действий.

## File map (создаются только по нужде задач)

- `index.html`, `lesson/botanical-branch/index.html` — две индексируемые HTML-страницы.
- `src/entry-home.tsx`, `src/entry-lesson.tsx` — отдельные React-точки входа.
- `src/components/HomePage.tsx`, `src/features/lesson/LessonPage.tsx` — пользовательские экраны.
- `src/styles/tokens.css`, `src/styles/layout.css` — согласованная визуальная система и responsive.
- `src/drawing/types.ts`, `geometry.ts`, `history.ts`, `eraser.ts`, `render.ts`, `input.ts`, `DrawingCanvas.tsx` — графический редактор.
- `src/lesson/definition.ts`, `botanicalBranch.ts`, `progress.ts`, `lessonText.ts` — урок, состояния и адаптация подсказок.
- `src/storage/localDocument.ts`, `src/drawing/exportPng.ts` — локальное восстановление и экспорт.
- `src/**/*.test.ts(x)` — unit/component tests около соответствующих модулей.
- `tests/e2e/lesson.spec.ts`, `tests/e2e/seo.spec.ts` — браузерная приёмка.
- `README.md`, `docs/qa/mvp-device-matrix.md` — запуск, ограничения, устройства и доказательства.

## Task 1: Project shell + visual target

**Files:** Create `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `lesson/botanical-branch/index.html`, `src/entry-home.tsx`, `src/entry-lesson.tsx`, `src/components/HomePage.tsx`, `src/features/lesson/LessonPage.tsx`, `src/styles/tokens.css`, `src/styles/layout.css`; Test `src/components/HomePage.test.tsx`, `tests/e2e/seo.spec.ts`.

**Interfaces:**
- Produces: `HomePage(): React.JSX.Element`, `LessonPage(): React.JSX.Element`, HTML entry points `/` and `/lesson/botanical-branch/`.
- No backend or runtime router. Navigation via semantic links between static pages. Query `audience=child|adult` передаёт стартовый вариант; другой текст доступен в редакторе. HTML не должен дублировать заголовки при гидратации.

- [ ] **Step 1:** После визуального approval зафиксировать версии совместимых React/Vite/TypeScript/Vitest/Playwright/ESLint и npm scripts `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`.
- [ ] **Step 2:** Создать failing component test `HomePage.test.tsx`: heading «Эскизно», выбор «Для ребёнка» / «Для взрослого» доступен с клавиатуры, ссылка «Начать рисовать» ведёт на `/lesson/botanical-branch/?audience=child` или `?audience=adult` согласно выбору.
- [ ] **Step 3:** Run `npm run test -- --run src/components/HomePage.test.tsx`; expected FAIL (компонент отсутствует).
- [ ] **Step 4:** Создать минимальные страницы и React-входы по утверждённому макету; HTML содержит видимые без JS заголовок, описание урока и данные о цели.
- [ ] **Step 5:** Run `npm run test -- --run src/components/HomePage.test.tsx`, `npm run typecheck`, `npm run build`; expected PASS.
- [ ] **Step 6:** Добавить E2E `tests/e2e/seo.spec.ts` с `request.get` на обе HTML-страницы: status 200; заголовок/описание в исходном HTML без выполнения JS, канонический URL не выдумывать до выбора домена; `npm run test:e2e -- tests/e2e/seo.spec.ts`.
- [ ] **Step 7:** Коммит `feat: scaffold static Eskizno lesson shell`.

## Task 2: Drawing model, geometry, history and eraser

**Files:** Create `src/drawing/types.ts`, `geometry.ts`, `geometry.test.ts`, `history.ts`, `history.test.ts`, `eraser.ts`, `eraser.test.ts`.

**Interfaces:**
- `type Point = { x: number; y: number; pressure: number; t: number }` (normalized x/y, pressure 0..1).
- `type Stroke = { id: string; stepId: string; color: string; width: number; points: Point[] }`.
- `type DrawingDocument = { version: 1; lessonId: string; strokes: Stroke[]; activeStepId: string; completedStepIds: string[]; audience: "child" | "adult"; mode: "trace" | "construct" | "free" }`.
- `toNormalizedPoint(clientX: number, clientY: number, rect: Pick<DOMRect,"left"|"top"|"width"|"height">): {x:number;y:number}`. Artboard: фиксированная пропорция 4:3 внутри доступного пространства без обрезки; x/y относятся к artboard, а не к окну.
- `type HistoryState = { past: DrawingDocument[]; present: DrawingDocument; future: DrawingDocument[] }`.
- `applyDrawingEdit(state: HistoryState, edit: (doc: DrawingDocument) => DrawingDocument): HistoryState`; `undo(state)`, `redo(state)`.
- `eraseNear(strokes: Stroke[], point: {x:number;y:number}, radius: number, newId: () => string): Stroke[]` removes touched segments by splitting into fragments; radius is normalized to the fixed artboard and IDs come from `newId`.

- [ ] **Step 1:** Add failing tests for normalized origin/center/DPR-independent resize and nonzero rect offset; reject zero width/height deliberately. Test invalid rect dimensions.
- [ ] **Step 2:** Run `npm run test -- --run src/drawing/geometry.test.ts`; expected FAIL.
- [ ] **Step 3:** Implement types + `toNormalizedPoint`; run targeted test; expected PASS.
- [ ] **Step 4:** Add failing tests: add stroke → undo → redo; new edit clears redo; erase splits a stroke, undo restores original fragments; independent steps are unaffected.
- [ ] **Step 5:** Run `npm run test -- --run src/drawing/history.test.ts src/drawing/eraser.test.ts`; expected FAIL.
- [ ] **Step 6:** Implement pure history/eraser modules with deterministic fragments (generated IDs delegated to caller if needed); run targeted tests; expected PASS.
- [ ] **Step 7:** Run `npm run typecheck && npm run test -- --run`; commit `feat: model editable normalized drawing strokes`.

## Task 3: Pen-first Canvas renderer and input

**Files:** Create `src/drawing/render.ts`, `render.test.ts`, `input.ts`, `input.test.ts`, `DrawingCanvas.tsx`; Modify `src/features/lesson/LessonPage.tsx`; Test `tests/e2e/lesson.spec.ts`.

**Interfaces:**
- `renderDrawing(ctx: CanvasRenderingContext2D, doc: DrawingDocument, options: {width:number;height:number;dpr:number;showGuides:boolean; guides?: Stroke[]}): void`.
- `bindPointerInput(canvas: HTMLCanvasElement, options: { onStroke: (stroke: Stroke)=>void; onErase: (point:{x:number;y:number})=>void; getTool:()=> "brush"|"eraser"; getStepId:()=>string; getBrush:()=>{color:string;width:number} }): () => void`.
- Renderer draws guides separately from editable user strokes. It does not mutate `DrawingDocument`.

- [ ] **Step 1:** Add failing unit tests for coordinate alignment after viewport resize/high DPR and guide toggle; input tests for `pointercancel`, second pointer ignored during active pen, mouse/touch accepted and pen coalesced events fallback.
- [ ] **Step 2:** Run `npm run test -- --run src/drawing/render.test.ts src/drawing/input.test.ts`; expected FAIL.
- [ ] **Step 3:** Implement canvas resize/backing scale + pure render + pointer capture and disposal; `touch-action: none` only on drawing area. Keep live pointer preview separate from committed document state.
- [ ] **Step 4:** Run targeted tests + `npm run typecheck`; expected PASS.
- [ ] **Step 5:** Add E2E: draw by mouse, undo, redo, resize and draw again, verify stroke count/location via application-visible state or test-only data hooks; do not claim synthetic events prove physical stylus support.
- [ ] **Step 6:** Run `npm run test:e2e -- tests/e2e/lesson.spec.ts`; expected PASS; commit `feat: add pen-first canvas interaction`.

## Task 4: Six-step lesson, age variants and modes

**Files:** Create `src/lesson/definition.ts`, `botanicalBranch.ts`, `lessonText.ts`, `progress.ts`, `progress.test.ts`; Modify `LessonPage.tsx`, `HomePage.tsx`; Test `src/features/lesson/LessonPage.test.tsx`, `tests/e2e/lesson.spec.ts`.

**Interfaces:**
- `type LessonStep = { id:string; title:string; skill:string; childPrompt:string; adultPrompt:string; guides: {trace: Stroke[]; construct: Stroke[]}; allowSkip:boolean }`.
- `const botanicalBranch: { id:"botanical-branch"; steps: readonly LessonStep[] }` with exactly 6 steps, original normalized guide geometry and original illustration.
- `nextStep(doc: DrawingDocument, lesson: typeof botanicalBranch): DrawingDocument`.
- `changeMode(doc: DrawingDocument, mode: DrawingDocument["mode"]): DrawingDocument`.
- `changeAudience(doc: DrawingDocument, audience: DrawingDocument["audience"]): DrawingDocument`.

- [ ] **Step 1:** Write failing tests: six unique step IDs; prompts present for both audiences; all modes map to proper guide visibility; last step allows independent variations.
- [ ] **Step 2:** Run `npm run test -- --run src/lesson/progress.test.ts src/features/lesson/LessonPage.test.tsx`; expected FAIL.
- [ ] **Step 3:** Implement lesson definition and UI, step 1..6, «Повтори / Пойми / Нарисуй сам», «Пропустить» where appropriate, no automated aesthetic score.
- [ ] **Step 4:** Run targeted tests; expected PASS.
- [ ] **Step 5:** Browser E2E: switch audience and mode mid-lesson, progress through all steps, user strokes remain unchanged, guides change, finish reveals work without overlay.
- [ ] **Step 6:** Run all unit tests + E2E; commit `feat: introduce botanical branch lesson flow`.

## Task 5: Local resume, safe recovery and PNG export

**Files:** Create `src/storage/localDocument.ts`, `localDocument.test.ts`, `src/drawing/exportPng.ts`, `exportPng.test.ts`; Modify `LessonPage.tsx`; Test `tests/e2e/lesson.spec.ts`.

**Interfaces:**
- `loadDocument(storage: Storage, lessonId: string): DrawingDocument | null`.
- `saveDocument(storage: Storage, doc: DrawingDocument): { ok:true } | {ok:false;reason:"unavailable"|"quota"}`.
- `exportPng(doc: DrawingDocument, options:{width:number;height:number;background:string}): Promise<Blob>` renders own strokes/background only.

- [ ] **Step 1:** Failing tests: valid save/load, corrupt JSON, wrong schema version, wrong lesson ID, missing Storage, quota exception, mode/audience/active and completed step retained, pressure outside 0..1 rejected.
- [ ] **Step 2:** Run `npm run test -- --run src/storage/localDocument.test.ts`; expected FAIL.
- [ ] **Step 3:** Implement local persistence, debounced autosave in UI, visible non-blocking error on failure. Do not send drawings to network.
- [ ] **Step 4:** Test PNG dimensions and absence of guide layers with controlled fake canvas; run `npm run test -- --run src/drawing/exportPng.test.ts`; expected FAIL, implement, rerun PASS.
- [ ] **Step 5:** E2E: draw, change mode, reload, verify strokes/step/mode, export PNG, restart lesson only after confirmation, simulate blocked storage gracefully.
- [ ] **Step 6:** Run `npm run test -- --run && npm run test:e2e`; commit `feat: persist lessons locally and export artwork`.

## Task 6: Accessibility, visual QA, SEO and release evidence

**Files:** Modify HTML/React/CSS only for proven gaps; Create `docs/qa/mvp-device-matrix.md`; Modify `README.md`; Test `tests/e2e/seo.spec.ts`, `tests/e2e/lesson.spec.ts`.

**Interfaces:** No new domain API; records actual QA outcomes and known limitations.

- [ ] **Step 1:** Add browser checks for keyboard navigation, visible focus, accessible tool names/states, 390×844 and 1280×800 layouts, lack of horizontal document scroll.
- [ ] **Step 2:** Run new checks; expected FAIL for any actual deficiency; fix root causes without unrelated redesign.
- [ ] **Step 3:** Inspect actual page HTML: meaningful title/description/h1 for both static entries; no fabricated ratings, testimonials, SEO traffic or schema.
- [ ] **Step 4:** Document launch/build/test commands and local-storage limitations in README; document manual matrix `device, browser, input, scroll/palm, pressure if supported, export, result, evidence`.
- [ ] **Step 5:** Run `npm run typecheck && npm run lint && npm run test -- --run && npm run test:e2e && npm run build`; capture factual logs.
- [ ] **Step 6:** Test physical tablet + stylus before claiming stylus QA PASS; if unavailable, mark this release gate **NOT VERIFIED**, do not call MVP production-ready.
- [ ] **Step 7:** Screenshot/visual acceptance versus approved mockup; open PR and provide risks, checks, and remaining gaps. No production publish or merge without requested review gate.

## Execution handoff / gates

1. Owner approves **visual mockup** before Task 1; this document does not replace that approval.
2. Owner reviews this plan and chooses execution mode; unapproved changes to scope/stack require new decision.
3. Every task gets RED → GREEN proof and a small commit; final PR must show logs, screenshots and device matrix.
4. Site publication and monetization are explicitly out of scope; no automatic production deployment.
