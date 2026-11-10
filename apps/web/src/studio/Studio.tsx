import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

import { EditorCanvas } from '../editor/EditorCanvas';
import type { ProjectHistory } from '../editor/history';
import { decodeLocalImage, importReference, type DecodedLocalImage, type ImportedImage } from '../editor/import-image';
import type { ProjectAction, ReferenceLayer } from '../editor/model';
import type { SaveStatus } from './useLocalProjects';
import { ReferencePanel } from './ReferencePanel';

interface StudioProps {
  history: ProjectHistory;
  assets: ReadonlyMap<string, Blob>;
  saveStatus: SaveStatus;
  storageMessage: string | null;
  onAction: (action: ProjectAction) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRetry: () => void;
  onNewBlank: () => Promise<boolean>;
  onNewWithReference: (image: ImportedImage, placement: ReferenceLayer['placement'], size: {
    width: number; height: number;
  }) => Promise<boolean>;
}

interface ReferenceMedia {
  images: ReadonlyMap<string, CanvasImageSource>;
  urls: ReadonlyMap<string, string>;
  failed: ReadonlySet<string>;
}

function useReferenceMedia(assets: ReadonlyMap<string, Blob>): ReferenceMedia {
  const [media, setMedia] = useState<ReferenceMedia>(() => ({ images: new Map(), urls: new Map(), failed: new Set() }));
  useEffect(() => {
    let cancelled = false;
    const urls = new Map<string, string>();
    const images = new Map<string, DecodedLocalImage>();
    const failed = new Set<string>();
    for (const [id, blob] of assets) {
      try { urls.set(id, URL.createObjectURL(blob)); } catch { /* decoding can still succeed */ }
    }
    const load = async () => {
      for (const [id, blob] of assets) {
        try {
          const decoded = await decodeLocalImage(blob);
          if (cancelled) { decoded.dispose(); break; }
          images.set(id, decoded);
        } catch { failed.add(id); }
        if (cancelled) break;
      }
      if (!cancelled) setMedia({ images: new Map([...images].map(([id, value]) => [id, value.source])),
        urls: new Map(urls), failed: new Set(failed) });
    };
    void load();
    return () => {
      cancelled = true;
      images.forEach((decoded) => decoded.dispose());
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assets]);
  return media;
}

export function Studio({ history, assets, saveStatus, storageMessage, onAction, onUndo, onRedo,
  onRetry, onNewBlank, onNewWithReference }: StudioProps) {
  const project = history.present;
  const [pending, setPending] = useState<{ image: ImportedImage; placement: ReferenceLayer['placement'] } | null>(null);
  const [sizeChoice, setSizeChoice] = useState<'canvas' | 'image'>('canvas');
  const [importError, setImportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sideWidth, setSideWidth] = useState(35);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sideLayoutRef = useRef<HTMLDivElement>(null);
  const draggingDivider = useRef(false);
  const media = useReferenceMedia(assets);
  const reference = project.layers.find((layer): layer is ReferenceLayer => layer.kind === 'reference');
  const side = reference?.placement === 'side';
  const referenceFailed = !!reference && media.failed.has(reference.assetId);

  const resizeSidePanel = (clientX: number) => {
    const bounds = sideLayoutRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    setSideWidth(Math.max(27, Math.min(45, (bounds.right - clientX) / bounds.width * 100)));
  };

  const endDividerDrag = (event: PointerEvent<HTMLDivElement>) => {
    draggingDivider.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  useEffect(() => { if (pending) dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [pending]);

  const dialogKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !busy) { event.stopPropagation(); setPending(null); return; }
    if (event.key !== 'Tab') return;
    const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? []);
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>, placement: ReferenceLayer['placement']) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setImportError(null);
    try {
      const image = await importReference(file);
      setSizeChoice('canvas');
      setPending({ image, placement });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Не удалось импортировать изображение.');
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const dimensions = sizeChoice === 'image'
        ? { width: pending.image.width, height: pending.image.height }
        : { width: project.width, height: project.height };
      const okay = await onNewWithReference(pending.image, pending.placement, dimensions);
      if (okay) { setPending(null); setImportError(null); }
      else setImportError('Не удалось сохранить текущую работу. Новый документ не создан.');
    } finally { setBusy(false); }
  };

  return (
    <section className="workspace-page" aria-labelledby="studio-heading">
      <div className="workspace-heading">
        <p className="section-kicker">Практика без ограничений</p>
        <h2 id="studio-heading">Свободная студия</h2>
        <p>Рисуйте на холсте, загружайте свои эскизы или держите образец рядом.</p>
      </div>
      <div className="studio-entry-bar" aria-label="Режимы свободной студии">
        <button type="button" className="secondary-button" onClick={() => {
          setBusy(true);
          void onNewBlank().then((okay) => {
            if (!okay) setImportError('Не удалось создать холст: работа изменилась во время сохранения или хранилище недоступно.');
            else setImportError(null);
          }).finally(() => setBusy(false));
        }} disabled={busy}>Новый холст</button>
        <label className="secondary-button studio-file-entry">Поверх эскиза
          <input type="file" aria-label="Загрузить эскиз для обводки" accept="image/png,image/jpeg,image/webp"
            onChange={(event) => { void chooseFile(event, 'overlay'); }} disabled={busy} />
        </label>
        <label className="secondary-button studio-file-entry">Референс рядом
          <input type="file" aria-label="Загрузить референс рядом" accept="image/png,image/jpeg,image/webp"
            onChange={(event) => { void chooseFile(event, 'side'); }} disabled={busy} />
        </label>
      </div>
      {importError && <p className="import-error" role="alert">{importError}</p>}
      {referenceFailed && <p className="import-error" role="alert">Не удалось восстановить референс из хранилища. Рисунок доступен для редактирования.</p>}
      {reference && !side && <ReferencePanel layer={reference} url={media.urls.get(reference.assetId)} failed={referenceFailed} onAction={onAction} />}
      <div ref={sideLayoutRef} className={side ? 'studio-reference-layout' : 'studio-artboard-layout'}
        style={side ? { '--reference-pane-width': `${sideWidth}%` } as CSSProperties : undefined}>
        <EditorCanvas history={history} referenceImages={media.images} onAction={onAction} onUndo={onUndo} onRedo={onRedo}
          saveStatus={saveStatus} storageMessage={storageMessage} onRetry={onRetry} />
        {side && <div className="reference-resize-handle" role="separator" aria-label="Размер области референса"
          aria-orientation="vertical" aria-valuemin={27} aria-valuemax={45} aria-valuenow={Math.round(sideWidth)} tabIndex={0}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            draggingDivider.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => { if (draggingDivider.current) resizeSidePanel(event.clientX); }}
          onPointerUp={endDividerDrag} onPointerCancel={endDividerDrag}
          onLostPointerCapture={() => { draggingDivider.current = false; }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              setSideWidth((width) => Math.max(27, Math.min(45, width + (event.key === 'ArrowLeft' ? 2 : -2))));
            }
          }} />}
        {side && reference && <ReferencePanel layer={reference} url={media.urls.get(reference.assetId)} failed={referenceFailed} onAction={onAction} />}
      </div>
      {pending && (
        <div className="import-dialog-backdrop">
          <div className="import-dialog" role="dialog" aria-modal="true" aria-label="Размер нового документа"
            ref={dialogRef} onKeyDown={dialogKeyboard}>
            <h3>Новый документ с изображением</h3>
            <p>Загруженное изображение: {pending.image.width} × {pending.image.height} пикселей.</p>
            <p>Текущая работа будет сохранена перед созданием нового документа.</p>
            <label><input type="radio" name="document-size" checked={sizeChoice === 'canvas'}
              onChange={() => setSizeChoice('canvas')} /> Размер холста: {project.width} × {project.height}</label>
            <label><input type="radio" name="document-size" checked={sizeChoice === 'image'}
              onChange={() => setSizeChoice('image')} /> Размер изображения: {pending.image.width} × {pending.image.height}</label>
            <div className="import-dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setPending(null)} disabled={busy}>Отмена</button>
              <button type="button" className="primary-button" onClick={() => { void confirm(); }} disabled={busy}>
                {pending.placement === 'overlay' ? 'Создать с эскизом' : 'Создать с референсом'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
