import type { DrawingLesson } from './lessons';

/** Guides live outside EditorCanvas and cannot become part of the saved drawing or PNG. */
export function LessonGuide({ lesson, step, mode }: { lesson: DrawingLesson; step: number; mode: 'trace' | 'construct' | 'free' }) {
  if (mode === 'free') return null;
  const botanical = lesson.id === 'e2a-botanical-branch';
  const cup = lesson.id === 'e2b-coffee-cup';
  const detail = mode === 'trace';
  const botanicalState = !detail ? 1 : step === 0 ? 1 : step === 1 ? 2 : step < 4 ? 3 : 4;
  const cupState = !detail ? 1 : Math.min(4, step + 1);
  const plantState = !detail ? 1 : Math.min(4, step + 1);
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
      </g> : cup ? <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <g data-guide-part="proportions" strokeWidth="1.2" strokeDasharray="4 5" opacity=".7">
          <path d="M50 24 H184 V158 H50 Z M117 17 V169 M43 44 H192" />
        </g>
        {cupState >= 2 && <g data-guide-part="rim" strokeWidth="2">
          <ellipse cx="117" cy="44" rx="67" ry="20" />
        </g>}
        {cupState >= 3 && <g data-guide-part="body" strokeWidth="2.2">
          <path d="M50 44 L64 151 Q117 172 170 151 L184 44" />
          <path d="M64 151 Q117 164 170 151" strokeWidth="1" opacity=".5" />
        </g>}
        {cupState >= 4 && <g data-guide-part="handle" strokeWidth="2.2">
          <path d="M183 58 C249 34 249 135 174 125" />
          <path d="M184 73 C223 63 223 106 177 109" />
        </g>}
      </g> : <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <g data-guide-part="composition" strokeWidth="1.2" strokeDasharray="4 5" opacity=".65">
          <path d="M64 13 H198 V168 H64 Z M131 10 V170 M60 111 H203" />
        </g>
        {plantState >= 2 && <g data-guide-part="pot" strokeWidth="2.1">
          <ellipse cx="131" cy="113" rx="54" ry="14" />
          <path d="M77 113 L89 163 Q131 176 172 163 L185 113" />
        </g>}
        {plantState >= 3 && <g data-guide-part="stems" strokeWidth="2">
          <path d="M130 111 Q126 75 129 31 M129 80 Q95 52 76 29 M132 73 Q160 45 187 29" />
          <path d="M129 61 Q111 39 112 17 M131 59 Q150 36 157 15" strokeWidth="1.2" />
        </g>}
        {plantState >= 4 && <g data-guide-part="leaves" strokeWidth="1.8">
          <path d="M76 29 Q54 10 64 2 Q102 6 105 39 Q92 43 76 29 Z" />
          <path d="M187 29 Q211 11 201 2 Q165 7 159 42 Q175 44 187 29 Z" />
          <path d="M129 31 Q108 3 126 2 Q150 3 145 35 Q137 43 129 31 Z" />
          <path d="M112 17 Q93 4 90 7 Q89 33 117 41 M157 15 Q176 3 178 8 Q179 33 150 42" />
        </g>}
      </g>}
    </svg>
    <p className="lesson-visual-state">Состояние {botanical ? botanicalState : cup ? cupState : plantState} из 4</p>
    <p>{mode === 'trace' ? 'Схема построения — ориентир для работы на холсте.' : 'Главные оси и формы — постройте детали самостоятельно.'}</p>
  </div>;
}
