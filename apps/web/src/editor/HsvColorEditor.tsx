import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { hexToHsv, hsvToHex, parseHexColor, type HsvColor } from './color';

interface HsvColorEditorProps {
  initialColor: string;
  onApply: (color: string) => void;
  onCancel: () => void;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function HsvColorEditor({ initialColor, onApply, onCancel }: HsvColorEditorProps) {
  const [hsv, setHsv] = useState(() => hexToHsv(initialColor));
  const [hex, setHex] = useState(() => parseHexColor(initialColor) ?? '#000000');
  const activePointer = useRef<{ id: number; surface: 'square' | 'hue' } | null>(null);
  const normalizedHex = parseHexColor(hex);

  const changeHsv = (next: HsvColor) => {
    setHsv(next);
    setHex(hsvToHex(next));
  };

  const updateFromPointer = (surface: 'square' | 'hue', event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (surface === 'hue') {
      changeHsv({ ...hsv, h: clamp01((event.clientY - rect.top) / rect.height) * 360 });
    } else {
      changeHsv({ ...hsv, s: clamp01((event.clientX - rect.left) / rect.width), v: 1 - clamp01((event.clientY - rect.top) / rect.height) });
    }
  };

  const beginDrag = (surface: 'square' | 'hue') => (event: PointerEvent<HTMLDivElement>) => {
    activePointer.current = { id: event.pointerId, surface };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromPointer(surface, event);
  };

  const moveDrag = (surface: 'square' | 'hue') => (event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current?.id !== event.pointerId || activePointer.current.surface !== surface) return;
    updateFromPointer(surface, event);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current?.id === event.pointerId) activePointer.current = null;
  };

  const onSquareKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    changeHsv({
      ...hsv,
      s: clamp01(hsv.s + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)),
      v: clamp01(hsv.v + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)),
    });
  };

  const onHueKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    changeHsv({ ...hsv, h: Math.min(360, Math.max(0, hsv.h + (['ArrowDown', 'ArrowRight'].includes(event.key) ? step : -step))) });
  };

  return (
    <div className="hsv-editor" aria-label="Редактор своего цвета">
      <div className="hsv-picker-row">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Выбор насыщенности и яркости"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.s * 100)}
          aria-valuetext={`Насыщенность ${Math.round(hsv.s * 100)}%, яркость ${Math.round(hsv.v * 100)}%`}
          className="hsv-square"
          style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }}
          onPointerDown={beginDrag('square')}
          onPointerMove={moveDrag('square')}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onSquareKeyDown}
        >
          <span className="hsv-square-marker" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Оттенок"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(hsv.h)}
          className="hsv-hue"
          onPointerDown={beginDrag('hue')}
          onPointerMove={moveDrag('hue')}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onHueKeyDown}
        >
          <span className="hsv-hue-marker" style={{ top: `${hsv.h / 360 * 100}%` }} />
        </div>
      </div>
      <div className="hsv-preview-row">
        <span className="hsv-preview-label">Было <i style={{ backgroundColor: initialColor }} /></span>
        <span className="hsv-preview-label">Новый <i style={{ backgroundColor: normalizedHex ?? '#ffffff' }} /></span>
      </div>
      <label className="hsv-hex-label" htmlFor="custom-hex">HEX</label>
      <input id="custom-hex" aria-label="HEX" aria-invalid={!normalizedHex} className="hsv-hex-input" spellCheck={false} value={hex} onChange={(event) => {
        const next = event.target.value;
        setHex(next);
        const valid = parseHexColor(next);
        if (valid) setHsv(hexToHsv(valid));
      }} />
      <div className="hsv-actions">
        <button type="button" onClick={onCancel}>Отмена</button>
        <button type="button" className="hsv-apply" disabled={!normalizedHex} onClick={() => { if (normalizedHex) onApply(normalizedHex); }}>Применить</button>
      </div>
    </div>
  );
}
