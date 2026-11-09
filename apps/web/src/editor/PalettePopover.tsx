import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { HsvColorEditor } from './HsvColorEditor';
import { ToolIcon } from './ToolIcon';

interface PalettePopoverProps {
  color: string;
  colors: readonly string[];
  recentColors: readonly string[];
  onSelect: (color: string) => void;
  onSaveColor: (color: string) => void;
}

const MAX_COLORS = 32;
const POPOVER_WIDTH = 332;
const POPOVER_HEIGHT = 530;
const VIEWPORT_GUTTER = 12;

function positionPopover(rect: DOMRect, viewportWidth: number, viewportHeight: number) {
  const width = Math.min(POPOVER_WIDTH, Math.max(0, viewportWidth - VIEWPORT_GUTTER * 2));
  return {
    top: Math.max(VIEWPORT_GUTTER, Math.min(rect.bottom + 9, viewportHeight - POPOVER_HEIGHT)),
    left: Math.max(VIEWPORT_GUTTER, Math.min(rect.left, viewportWidth - width - VIEWPORT_GUTTER)),
  };
}

export function PalettePopover({ color, colors, recentColors, onSelect, onSaveColor }: PalettePopoverProps) {
  const [open, setOpen] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const [placement, setPlacement] = useState({ top: 0, left: 0 });
  const [actionsHost, setActionsHost] = useState<HTMLDivElement | null>(null);
  const setActionsHostRef = useCallback((node: HTMLDivElement | null) => setActionsHost(node), []);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  const alreadySaved = colors.some((entry) => entry.toLowerCase() === color.toLowerCase());

  useEffect(() => {
    if (!open) return;
    const updatePlacement = () => {
      const rect = toggleRef.current?.getBoundingClientRect();
      if (rect) setPlacement(positionPopover(rect, window.innerWidth, window.innerHeight));
    };
    const dismissPointer = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const dismissKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const dismissScroll = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissPointer);
    document.addEventListener('keydown', dismissKey);
    window.addEventListener('scroll', dismissScroll, true);
    window.addEventListener('resize', updatePlacement);
    window.visualViewport?.addEventListener('resize', updatePlacement);
    return () => {
      document.removeEventListener('pointerdown', dismissPointer);
      document.removeEventListener('keydown', dismissKey);
      window.removeEventListener('scroll', dismissScroll, true);
      window.removeEventListener('resize', updatePlacement);
      window.visualViewport?.removeEventListener('resize', updatePlacement);
    };
  }, [open]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const rect = toggleRef.current?.getBoundingClientRect();
    if (rect) setPlacement(positionPopover(rect, window.innerWidth, window.innerHeight));
    setOpen(true);
  };

  return (
    <div className="palette-root" ref={rootRef}>
      <button
        ref={toggleRef}
        className={open ? 'palette-trigger selected' : 'palette-trigger'}
        type="button"
        aria-label={`Палитра, выбран ${color.toUpperCase()}`}
        title="Палитра"
        aria-expanded={open}
        aria-controls={open ? popupId : undefined}
        onClick={toggle}
      >
        <ToolIcon name="palette" />
        <span className="palette-icon-color" style={{ backgroundColor: color }} aria-hidden="true" />
      </button>
      {open && (
        <div className="palette-popover" id={popupId} role="dialog" aria-label="Палитра цветов" style={{ ...placement, maxHeight: Math.max(0, window.innerHeight - placement.top - 12) }}>
          <div className="palette-popover-heading">
            <strong>Цвета рисунка</strong>
            <button type="button" className="palette-close" aria-label="Закрыть палитру" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="palette-popover-scroll">
            <p className="palette-caption">Выберите оттенок для следующей линии</p>
            <h4 className="palette-section-title">Недавние и на рисунке</h4>
            <div className="palette-swatches palette-recent" aria-label="Недавние цвета">
              {recentColors.map((preset) => (
                <button
                  key={preset.toLowerCase()}
                  type="button"
                  aria-label={`Недавний цвет ${preset.toUpperCase()}`}
                  aria-pressed={preset.toLowerCase() === color.toLowerCase()}
                  className={preset.toLowerCase() === color.toLowerCase() ? 'palette-swatch active' : 'palette-swatch'}
                  style={{ backgroundColor: preset }}
                  onClick={() => onSelect(preset)}
                />
              ))}
            </div>
            <h4 className="palette-section-title">Сохранённые цвета</h4>
            <div className="palette-swatches palette-saved" aria-label="Сохранённые цвета">
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
            <HsvColorEditor key={`${color}:${editorRevision}`} initialColor={color} actionsHost={actionsHost} onCancel={() => setEditorRevision((current) => current + 1)} onApply={(next) => {
              onSelect(next);
              setEditorRevision((current) => current + 1);
            }} />
          </div>
          <div className="palette-popover-footer">
            <div ref={setActionsHostRef} className="palette-actions-host" />
            <button
              type="button"
              className="palette-save"
              disabled={alreadySaved || colors.length >= MAX_COLORS}
              onClick={() => onSaveColor(color)}
            >
              Сохранить цвет
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
