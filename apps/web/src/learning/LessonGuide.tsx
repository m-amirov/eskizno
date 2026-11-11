import type { DrawingLesson } from './lessons';

/** Guides live outside EditorCanvas and cannot become part of the saved drawing or PNG. */
export function LessonGuide({ lesson, step, mode }: { lesson: DrawingLesson; step: number; mode: 'trace' | 'construct' | 'free' }) {
  if (mode === 'free') return null;
  const botanical = lesson.id === 'e2a-botanical-branch';
  const cup = lesson.id === 'e2b-coffee-cup';
  const detail = mode === 'trace';
  return <div className="lesson-guide-art" role="img" aria-label="Пошаговая схема рисунка">
    <svg viewBox="0 0 260 180" aria-hidden="true" focusable="false">
      {botanical ? <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M41 155 Q100 112 211 23" />
        {detail && Array.from({ length: Math.min(7, step + 2) }, (_, i) => {
          const x = 73 + i * 19; const y = 132 - i * 16;
          return <g key={i}><path d={`M${x} ${y} Q${x - 31} ${y - 30} ${x - 28} ${y - 37} Q${x - 2} ${y - 35} ${x} ${y}`} />
            <path d={`M${x} ${y} Q${x + 27} ${y + 5} ${x + 36} ${y - 7} Q${x + 15} ${y - 22} ${x} ${y}`} /></g>;
        })}
      </g> : cup ? <g fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="117" cy="44" rx="66" ry="20" />
        {step > 0 && <path d="M51 44 L64 150 Q117 172 170 150 L183 44" />}
        {detail && step > 2 && <path d="M181 57 C250 35 245 135 171 126 M184 71 C224 61 217 108 174 110" />}
      </g> : <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <ellipse cx="128" cy="109" rx="56" ry="16" />
        <path d="M72 109 L85 163 Q128 176 171 163 L184 109" />
        {step > 1 && <path d="M128 108 L126 30 M127 71 Q75 37 76 20 M128 69 Q173 36 184 25" />}
        {detail && step > 2 && <><ellipse cx="80" cy="31" rx="17" ry="34" transform="rotate(-48 80 31)" />
          <ellipse cx="182" cy="37" rx="17" ry="34" transform="rotate(41 182 37)" />
          <ellipse cx="132" cy="30" rx="17" ry="30" /></>}
      </g>}
    </svg>
    <p>{mode === 'trace' ? 'Схема построения — ориентир для работы на холсте.' : 'Главные оси и формы — постройте детали самостоятельно.'}</p>
  </div>;
}
