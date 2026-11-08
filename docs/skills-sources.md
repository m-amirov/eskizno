# Источники проектных навыков Codex

Навыки лежат в `.agents/skills/<имя>/SKILL.md` — это проектная установка, доступная при работе Codex в данном репозитории. Оригинальные инструкции и связанные Markdown-справочники сохранены без правок; тексты лицензий лежат рядом с соответствующими навыками. Проектные ограничения — в корневом `AGENTS.md`.

Снимок источников: **8 ноября 2026 года**. Версии некоторых навыков указаны в их YAML frontmatter. При обновлении сверяйте upstream, инструкции, ссылки на дополнительные файлы и лицензии. Установка не означает одобрения любой рекомендации или внешней операции из сторонних инструкций.

| Направление | Навык | Автор / исходный файл | Лицензия |
| --- | --- | --- | --- |
| Дизайн интерфейсов | `frontend-design` | [Anthropic — frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md) | Apache-2.0 |
| Учебные программы | `curriculum-design-guide` | [WentorAI — curriculum-design-guide](https://github.com/wentorai/research-plugins/blob/main/skills/domains/education/curriculum-design-guide/SKILL.md) | MIT |
| Контент-стратегия | `content-strategy` | [Corey Haines — content-strategy](https://github.com/coreyhaines31/marketingskills/blob/main/skills/content-strategy/SKILL.md) | MIT |
| Техническое SEO и аудит | `seo-audit` | [Corey Haines — seo-audit](https://github.com/coreyhaines31/marketingskills/blob/main/skills/seo-audit/SKILL.md) | MIT |
| Продуктовое исследование | `brainstorming` | [Jesse Vincent / obra — brainstorming](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md) | MIT |
| Планирование разработки | `writing-plans` | [Jesse Vincent / obra — writing-plans](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md) | MIT |
| Разработка через тесты | `test-driven-development` | [Jesse Vincent / obra — test-driven-development](https://github.com/obra/superpowers/blob/main/skills/test-driven-development/SKILL.md) | MIT |
| Проверка результатов | `verification-before-completion` | [Jesse Vincent / obra — verification-before-completion](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md) | MIT |

Первоначальный подбор выполнялся по [каталогу Agent Skills для Codex](https://agentskill.sh/for/codex). Каталог — средство обнаружения навыков; источником файлов являются публичные upstream-репозитории.

## Использование в проекте

- Дизайн уроков и редактора: `frontend-design` + правила UX в `AGENTS.md`.
- План урока: `curriculum-design-guide` + обязательные поля урока в `AGENTS.md`.
- Каталог уроков и публикации: `content-strategy` + `.agents/product-marketing.md`.
- Индексация сайта: `seo-audit`; без реальных данных Search Console нельзя утверждать, что страницы ранжируются.
- Проработка фич и планы: `brainstorming`, `writing-plans`.
- Реализация и доказательства проверки: `test-driven-development`, `verification-before-completion`.

Некоторые upstream-навыки ссылаются на другие навыки из более широких наборов. Если такой навык отсутствует в этом репозитории, не считайте его автоматически установленным и не блокируйте из-за этого проект: используйте доступные проектные правила или отдельно согласуйте расширение набора.

Никакие исполняемые файлы или скрипты из сторонних репозиториев не устанавливались. Внутри проекта размещены Markdown-инструкции, ссылки-справочники и тексты лицензий.
