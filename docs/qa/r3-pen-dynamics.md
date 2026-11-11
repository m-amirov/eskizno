# R3A — нажим и наклон: протокол приёмки

Дата первого локального прогона: **2026-11-10 UTC**. Ветка: `feat/r3-pen-dynamics`, stacked на `feat/r2-selection-transform`. **Автоматический browser CI PASS; аппаратная проверка NOT TESTED, релиз не принят.** Только Draft PR; без merge и deploy.

## Итог автоматизированной проверки — 2026-11-11

- Проверенный GitHub commit: `ee84898c9a8c7ea0107132236ce96ab901f3287e`, дерево `2ce7bc38f0b1af2477ac03502eea5f68f2bd36bd`, [CI run 42966569611](https://github.com/m-amirov/eskizno/actions/runs/42966569611), job `130345042920`: **success**.
- Чистый CI runner: установка зависимостей и Chromium, TypeScript, **282/282 unit PASS**, production build, **37/37 Chromium E2E PASS**. Снимки viewport сохранены артефактом GitHub Actions.
- В одном из предыдущих CI-прогонов: **34/37 E2E**, затем **36/37 E2E**. Исправлены устаревшие координаты холста после изменения инструмента и вертикальное схлопывание холста на 390×844 при управлении каллиграфией. Текущий тест проверяет видимый холст и доступность нижних действий с прокруткой.
- Отдельный промежуточный CI остановился на нестабильном `App.learning.test.tsx` (**281/282 unit**): тест начинал жест сразу после монтирования редактора. Синхронизация эффекта инициализации и ожидание подтверждённого штриха внесены только в тест. Три последовательных полных локальных unit-прогона и итоговый CI прошли **282/282**. Эта история не скрывается, но нет доказательств дальнейшего воспроизведения после исправления.
- Аппаратный прогон **Huawei / Яндекс Браузер / реальный стилус** не выполнен: ни pressure/tilt, ни 15-минутная нагрузка, ни фактический импорт файлов не объявляются аппаратным PASS.

Все приведённые далее локальные результаты относятся к промежуточным ревизиям и сохранены как исторический диагностический протокол; актуальный автоматический gate указан выше.

## Повтор после whole-branch review

База волны исправлений: `b3efe91d832f7ab93f47033293e82eb9164add57`; результаты ниже относятся к рабочему дереву поверх этой базы, а не к одному из исторических SHA в таблице далее. Итоговый коммит определяется по `git log` и должен быть отдельно проверен CI. Последовательные локальные команды: `npm run typecheck` — exit 0; первый `npm run test:unit` — exit 0, **281/281**, 30 файлов; после добавления pixel-регрессии повторный полный прогон — **FAIL: 281 passed / 1 failed, 29/30 файлов**. `src/App.learning.test.tsx`, тест «не отмечает урок завершённым при отказе записи прогресса, позволяет повторить»: не найден «Шаг 2 из 3» на строке 66; в DOM кнопка «Следующий шаг» отключена и шаг всё ещё первый. Изолированный `npm run test:unit -- src/App.learning.test.tsx` после этого — 2/2 PASS; причина отсутствующего подтверждения штриха не установлена, порог не менялся, gate нестабилен. `npm run build` — exit 0, 47 модулей. Отдельная строгая проверка типов `e2e/drawing.spec.ts` — exit 0; `npx playwright test --list` — exit 0, **37 тестов в 7 файлах**. Новый E2E **NOT EXECUTED** из-за ранее подтверждённого browser launch blocker. Не считать предыдущий успешный прогон доказательством стабильности.

В Task 3 один синтетический запуск native Canvas2D: dynamic liner, **2048×2048, 5000 входных точек, 43,6 мс**. Это единичное измерение в Linux-среде разработки без статистики и без устройства Huawei; не измерение интерактивной задержки, не порог производительности и не hardware/release PASS.

## Проверенная ревизия и среда

- Исходный HEAD: `efde0746ed58a292c3501ddc0d26296f3f8f3415`. Команды ниже выполнены поверх него с Task 5 изменениями только в `e2e/drawing.spec.ts` и workflow; production-код не изменялся. Этот документ фиксирует результат до коммита. SHA итогового Task 5 коммита и повторная проверка после коммита фиксируются в исполнительском отчёте `.superpowers/sdd/2026-11-10-r3-pen-dynamics/task-5-report.md`; CI обязан привязать свой результат к фактически проверенному SHA.
- Worktree: `/workspace/scratch/fcffd2fe74c5/eskizno/.worktrees/r3-pen-dynamics`; npm cwd: `apps/web`.
- Linux `6.18.57`, `x86_64`, Node `v24.22.1`, npm `11.9.0`; TypeScript `5.9.3`, Vitest `4.1.12`, Vite `8.3.6`, Playwright `1.65.0`.
- Использованы существующие зависимости, общие с основной рабочей копией (`node_modules` symlink). `npm ci` в Task 5 не запускался. CI использует собственную чистую установку и Node 22.
- Bundled Chromium отсутствует. Требуемый путь: `/home/agent/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell`.
- Ранее в этой среде системный `/usr/bin/chromium` завершился с `socket() failed: Operation not permitted` (исходные данные контроллера, не новый прогон Task 5). Обход ограничений, установка браузера и escalation не выполнялись.

## Локальные команды и результаты

Все npm/npx команды — из `apps/web`; `git diff --check` — из корня worktree. Typecheck, unit и build запускались последовательно, не одновременно друг с другом.

| Команда | Результат |
| --- | --- |
| `npm run test:e2e -- e2e/drawing.spec.ts --grep 'перо:|параметры пера' --reporter=line` (до правок Task 5) | exit 1; 2 launch failures, 0 выполненных сценариев; отсутствует Chromium |
| `npm run typecheck` | PASS, exit 0, `tsc --noEmit` без ошибок |
| `npm run test:unit` | PASS, exit 0; **275 passed, 0 failed, 30 файлов**; 17.79 s |
| `npm run typecheck && npm run test:unit && npm run build` (повтор после коммита `987068eea11ef46ffedc3694b17a61c6b5ee91f8`) | **FAIL**, exit 1; typecheck PASS, unit **274 passed, 1 failed**, 29 файлов PASS / 1 FAIL; 24.38 s; build не запущен после unit failure |
| `npm run test:unit -- src/App.learning.test.tsx` (после FAIL полного набора) | PASS, exit 0; **2 passed, 0 failed**, 6.41 s; это не повторный PASS всего набора |
| `npm run build` | PASS, exit 0; повторный typecheck, Vite **47 modules**, 536 ms |
| `npx playwright test --list` | PASS, exit 0; **36 тестов в 7 файлах**; это обнаружение тестов, не выполнение |
| `npx tsc --noEmit --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck e2e/drawing.spec.ts` | PASS, exit 0; отдельная проверка типов E2E, не входящего в основной `tsconfig.json` |
| `npm run test:e2e` (после правок) | **BLOCKED**, exit 1; Playwright: **36 failed**, все 36 — `browserType.launch: Executable doesn't exist`; **0 passed, 0 выполненных сценариев** |
| `git diff --check` | PASS, exit 0, пустой вывод |

Значимые строки фактического вывода:

```text
Test Files  30 passed (30)
     Tests  275 passed (275)
  Duration  17.79s (transform 6.42s, setup 0ms, import 14.02s, tests 40.50s, environment 65.42s)

vite v8.3.6 building client environment for production...
✓ 47 modules transformed.
dist/index.html                   0.48 kB │ gzip:   0.34 kB
dist/assets/index-CCP0ELfa.css   37.61 kB │ gzip:   8.32 kB
dist/assets/index-DV6-GpWC.js   346.84 kB │ gzip: 105.72 kB
✓ built in 536ms

Running 36 tests using 4 workers
Error: browserType.launch: Executable doesn't exist at /home/agent/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell
36 failed
```

Полный stdout/stderr E2E сохранён в исполнительском архиве `task-5-e2e.log` рядом с отчётом. Playwright создал `apps/web/test-results/**/error-context.md`; скриншотов и pixel artifacts успешного браузерного прогона **нет**. Запуск завершился до открытия страницы. Предупреждения среды: npm `Unknown env config "http-proxy"`, Playwright `NO_COLOR`/`FORCE_COLOR`; они не скрывают launch failure.

В Task 4 при параллельных запусках ранее наблюдался intermittent timeout в `src/App.learning.test.tsx` при ожидании `Шаг 2 из 3` (274 passed, 1 failed). Последующий последовательный полный прогон Task 4 и первый последовательный прогон Task 5 прошли 275/275. **В повторном Task 5 прогоне после коммита таймаут воспроизвёлся и без одновременно запущенного нами другого npm gate:** `не отмечает урок завершённым при отказе записи прогресса, позволяет повторить`, строка 55, `Test timed out in 5000ms`; 274 passed / 1 failed. Следовательно, утверждать, что проблема бывает только при параллельном запуске отдельных команд, нельзя. Полный вывод сохранён в `task-5-post-commit.log` рядом с отчётом. Последующий изолированный запуск файла прошёл 2/2, но не отменяет FAIL полного набора. Первопричина не установлена, тест и production-код не менялись; это не объявляется исправленным багом, общий unit gate нестабилен. После этого наблюдения изменена только QA-документация, итоговый SHA указан в исполнительском отчёте.

## Что проверяют браузерные сценарии

- `drawing.spec.ts`: **synthetic** `PointerEvent` поток с `pointerType: 'pen'`, pressure/tilt, Undo/Redo, сохранение и reload; обычная Playwright-мышь не получает dynamics. Pen-up имеет pressure 0. Заглушка `setPointerCapture` нужна только синтетическим ID и восстанавливается в `finally` до мыши.
- Настройки на 390×844 и 820×1180: проверяются границы самих input и подписанного control, попадание input в viewport, изменение нажима кликом и клавиатурой, переключение tilt, отсутствие горизонтального overflow. Такая проверка должна ловить обрезанный или недоступный control, даже если overflow скрыт CSS.
- Действующие drawing-сценарии сохраняют покрытие мыши, двухпальцевого zoom/cancel, pan, responsive layout и истории. Их наличие не означает локальный PASS.
- `studio.spec.ts` уже содержит планшетный `820×1180`, `hasTouch`, `isMobile` regression: реальное касание открывает file chooser, PNG с общим MIME `application/octet-stream` принимается и создаёт эскиз. Есть сохранение/reload референса и отказ на повреждённый файл. Сценарий не дублировался. JPEG/WebP на физическом планшете остаются отдельными непроверенными пунктами.
- Production UI, палитра, типографика и схема загрузки референса в Task 5 не менялись. Браузерный RED/GREEN для усиленных assertions не установлен из-за launch blocker; утверждать прохождение этих assertions нельзя.

## CI: конфигурация и исторический план запуска

`.github/workflows/e1-browser-gate.yml` сохраняет все прежние triggers и добавляет:

- push в `feat/r3-pen-dynamics`;
- pull request с base `feat/r2-selection-transform` (stacked R3A → R2).

Требование этапа было получить фактический run URL/SHA и результаты **typecheck, unit, build и browser tests**, изучить failure artifacts при любом FAIL. Этот этап выполнен для `ee84898c9a8c7ea0107132236ce96ab901f3287e`: актуальные **37 browser tests PASS** (не прежние 36). Успешный синтетический CI не закрывает hardware gate и не разрешает релиз.

## Аппаратная матрица

Исполнитель: владелец Huawei с совместимым пером либо назначенный тестировщик. Устройство в этой среде недоступно. Неизвестные значения не заполнены предположениями.

| Проверка | Что записать / как выполнить | Статус |
| --- | --- | --- |
| Устройство | Точная модель Huawei, ОС и версия | NOT TESTED |
| Браузер | Яндекс Браузер: точная версия; другие браузеры отдельно | NOT TESTED |
| Перо | Модель пера, соединение/совместимость; фактические pressure/tilt, не просто наличие полей | NOT TESTED |
| Нажим | Pencil, liner, calligraphy: слабый/сильный нажим; 0% и 80%; нулевое/постоянное давление без исчезновения линии | NOT TESTED |
| Наклон | Calligraphy: направления наклона, включение/выключение; preview и финал без скачка | NOT TESTED |
| Palm + pinch | Перо при ладони; два пальца до/во время/после пера; масштаб, отмена, выход за холст, восстановление рисования после отпускания | NOT TESTED |
| Нагрузка | Документ **2048×2048, 8 слоёв, минимум 15 минут**: рисование, Undo/Redo, zoom/pan, смена кистей | NOT TESTED |
| Производительность | Записать измеренные задержки, memory errors, пропуски и неожиданные отмены штрихов; пороги определить по baseline этого устройства | NOT TESTED |
| PNG import | Файловый picker касанием, обводка и референс рядом, масштабирование, сохранение/reload | NOT TESTED |
| JPEG import | То же с реальным JPEG, включая общий MIME при выдаче picker | NOT TESTED |
| WebP import | То же с реальным WebP, включая общий MIME при выдаче picker | NOT TESTED |
| Recovery | Старый v2-проект → добавить pen stroke → Undo/Redo → сохранить → reload/галерея → продолжить редактирование → PNG export | NOT TESTED |
| Ошибка импорта | Повреждённый файл не затирает документ; после ошибки можно продолжить рисование и импортировать корректный файл | NOT TESTED |

К аппаратному отчёту приложить tested SHA, версии, настройки, длительность, фактические наблюдения/метрики и файлы либо видео при наличии. Только после реального прогона отдельный пункт может сменить `NOT TESTED` на PASS/FAIL. Поддержка конкретного Huawei/браузера/пера и приемлемая задержка сейчас **не подтверждены**.
