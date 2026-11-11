import type { DrawingLesson } from './lessons';

/** Guides live outside EditorCanvas and cannot become part of the saved drawing or PNG. */
export function LessonGuide({ lesson, step, mode }: { lesson: DrawingLesson; step: number; mode: 'trace' | 'construct' | 'free' }) {
  if (mode === 'free') return null;
  const botanical = lesson.id === 'e2a-botanical-branch';
  const cup = lesson.id === 'e2b-coffee-cup';
  const detail = mode === 'trace';
  const botanicalState = !detail ? 1 : step === 0 ? 1 : step === 1 ? 2 : step < 4 ? 3 : 4;
  return <div className="lesson-guide-art" role="img" aria-label="Пошаговая схема рисунка">
    <svg viewBox="0 0 260 180" aria-hidden="true" focusable="false">
      {botanical ? <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <g data-guide-part="axis" strokeWidth="2.2"><path d="M40 158 Q106 111 211 24" /></g>
        {botanicalState >= 2 && <g data-guide-part="rhythm" strokeWidth="1.2" strokeDasharray="3 4" opacity=".75">
          {Array.from({ length: 5 }, (_, i) => {
            const x = 78 + i * 25; const y = 131 - i * 20;
            return <g key={i}><path d={`M${x} ${y} l-19 -17 M${x} ${y} l20 7`} />
              <circle cx={x} cy={y} r="3.2" fill="currentColor" stroke="none" /></g>;
          })}
        </g>}
        {botanicalState >= 3 && <g data-guide-part="leaf-contours" strokeWidth="1.7">
          {Array.from({ length: 5 }, (_, i) => {
            const x = 78 + i * 25; const y = 131 - i * 20;
            return <g key={i}><path d={`M${x} ${y} Q${x - 31} ${y - 26} ${x - 27} ${y - 36} Q${x - 7} ${y - 36} ${x} ${y}`} />
              <path d={`M${x} ${y} Q${x + 24} ${y - 1} ${x + 33} ${y - 15} Q${x + 11} ${y - 21} ${x} ${y}`} /></g>;
          })}
        </g>}
        {botanicalState >= 4 && <g data-guide-part="veins" strokeWidth=".9" opacity=".7">
          {Array.from({ length: 5 }, (_, i) => {
            const x = 78 + i * 25; const y = 131 - i * 20;
            return <g key={i}><path d={`M${x} ${y} L${x - 27} ${y - 36} M${x} ${y} L${x + 33} ${y - 15}`} /></g>;
          })}
        </g>}
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
    {botanical && <p className="lesson-visual-state">Состояние {botanicalState} из 4</p>}
    <p>{mode === 'trace' ? 'Схема построения — ориентир для работы на холсте.' : 'Главные оси и формы — постройте детали самостоятельно.'}</p>
  </div>;
}
