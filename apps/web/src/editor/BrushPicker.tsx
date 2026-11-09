import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { BrushId } from './model';
import { BRUSH_PRESETS } from './brushes';

interface BrushPickerProps {
  value: BrushId;
  onChange: (brush: BrushId) => void;
  active?: boolean;
}

export function BrushPicker({ value, onChange, active = true }: BrushPickerProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = BRUSH_PRESETS.find((brush) => brush.id === value) ?? BRUSH_PRESETS[0];
  const portalHost = rootRef.current?.closest('.studio-layout') ?? document.body;

  useEffect(() => {
    if (!open) return;
    popupRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismissOutside = (event: globalThis.PointerEvent) => {
      if (!popupRef.current?.contains(event.target as Node) && !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    const dismissScroll = (event: Event) => {
      if (!popupRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissKey);
    window.addEventListener('scroll', dismissScroll, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissKey);
      window.removeEventListener('scroll', dismissScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({
        top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 380)),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 342)),
      });
    }
    setOpen(true);
  };

  return <div className="brush-picker-root" ref={rootRef}>
    <button
      ref={triggerRef}
      className={active ? 'brush-picker-trigger tool-active' : 'brush-picker-trigger'}
      type="button"
      aria-label={`Кисти, выбран ${selected.label}`}
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      onClick={toggle}
    ><span aria-hidden="true" className="brush-trigger-icon">✎</span>{selected.label}<span aria-hidden="true" className="brush-trigger-caret">▾</span></button>
    {open && createPortal(<div
      id={id}
      role="dialog"
      aria-label="Выбор кисти"
      ref={popupRef}
      className="brush-picker-popup"
      style={{ ...position, maxHeight: Math.max(120, window.innerHeight - position.top - 12) }}
    >
      <div className="brush-picker-heading"><strong>Кисти</strong><span>Выберите характер линии</span></div>
      <div className="brush-picker-grid">
        {BRUSH_PRESETS.map((brush) => <button
          key={brush.id}
          type="button"
          className={brush.id === value ? 'brush-option is-selected' : 'brush-option'}
          aria-label={`Выбрать ${brush.label}`}
          aria-pressed={brush.id === value}
          onClick={() => { onChange(brush.id); setOpen(false); triggerRef.current?.focus(); }}
        >
          <span className={`brush-sample brush-sample--${brush.id}`} aria-hidden="true" />
          <span className="brush-option-copy"><strong>{brush.label}</strong><small>{brush.description}</small></span>
        </button>)}
      </div>
    </div>, portalHost)}
  </div>;
}
