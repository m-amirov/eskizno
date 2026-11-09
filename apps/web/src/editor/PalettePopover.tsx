import { useEffect, useId, useRef, useState } from 'react';

import { HsvColorEditor } from './HsvColorEditor';

interface PalettePopoverProps {
  color: string;
  colors: readonly string[];
  onSelect: (color: string) => void;
  onSaveColor: (color: string) => void;
}

const MAX_COLORS = 32;

export function PalettePopover({ color, colors, onSelect, onSaveColor }: PalettePopoverProps) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [placement, setPlacement] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  const alreadySaved = colors.some((entry) => entry.toLowerCase() === color.toLowerCase());

  useEffect(() => {
    if (!open) return;
    const dismissPointer = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) { setOpen(false); setCustomOpen(false); }
    };
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setCustomOpen(false);
        toggleRef.current?.focus();
      }
    };
    const dismissScroll = () => { setOpen(false); setCustomOpen(false); };
    document.addEventListener('pointerdown', dismissPointer);
    document.addEventListener('keydown', dismissKey);
    window.addEventListener('scroll', dismissScroll, true);
    return () => {
      document.removeEventListener('pointerdown', dismissPointer);
      document.removeEventListener('keydown', dismissKey);
      window.removeEventListener('scroll', dismissScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(false); setCustomOpen(false); return; }
    const rect = toggleRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(312, window.innerWidth - 24);
      setPlacement({
        top: Math.max(12, Math.min(rect.bottom + 9, window.innerHeight - 260)),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      });
    }
    setOpen(true);
  };

  return (
    <div className="palette-root" ref={rootRef}>
      <button
        ref={toggleRef}
        className={open ? 'palette-trigger selected' : 'palette-trigger'}
        type="button"
        aria-label={`Палитра, выбран ${color.toUpperCase()}`}
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onClick={toggle}
      >
        <span className="palette-preview" style={{ backgroundColor: color }} aria-hidden="true" />
        <span>Палитра</span>
      </button>
      {open && (
        <div className="palette-popover" id={popupId} role="dialog" aria-label="Палитра цветов" style={{ ...placement, maxHeight: Math.max(0, window.innerHeight - placement.top - 12) }}>
          <div className="palette-popover-heading">
            <strong>Цвета рисунка</strong>
            <button type="button" className="palette-close" aria-label="Закрыть палитру" onClick={() => { setOpen(false); setCustomOpen(false); }}>×</button>
          </div>
          <p className="palette-caption">Выберите оттенок для следующей линии</p>
          <div className="palette-swatches">
            {colors.map((preset, index) => (
              <button
                key={`${preset}-${index}`}
                type="button"
                aria-label={`Выбрать ${preset}`}
                aria-pressed={preset.toLowerCase() === color.toLowerCase()}
                className={preset.toLowerCase() === color.toLowerCase() ? 'palette-swatch active' : 'palette-swatch'}
                style={{ backgroundColor: preset }}
                onClick={() => { onSelect(preset); setOpen(false); }}
              />
            ))}
          </div>
          {customOpen ? (
            <HsvColorEditor initialColor={color} onCancel={() => setCustomOpen(false)} onApply={(next) => {
              onSelect(next);
              setCustomOpen(false);
              setOpen(false);
            }} />
          ) : (
            <div className="palette-custom-row">
              <button type="button" className="palette-custom-toggle" onClick={() => {
                setCustomOpen(true);
                setPlacement((current) => ({ ...current, top: Math.min(current.top, Math.max(12, window.innerHeight - 430)) }));
              }}>Свой цвет</button>
              <span className="palette-preview" style={{ backgroundColor: color }} aria-hidden="true" />
              <code aria-label="HEX-код">{color.toUpperCase()}</code>
            </div>
          )}
          <button
            type="button"
            className="palette-save"
            disabled={alreadySaved || colors.length >= MAX_COLORS}
            onClick={() => onSaveColor(color)}
          >
            Сохранить цвет
          </button>
        </div>
      )}
    </div>
  );
}
