# Layer renaming and extended brush library — design

## Approved scope

User selected option B: rename layers and provide an expanded, genuinely varied set of drawing brushes in the existing Draft PR #10. Do not change the editor's established palette, layer order, clear action, gestures, or visual language.

## Layer naming

- Layer actions (`⋯`) add **Переименовать** before lock/delete, for paint and reference layers, including locked layers.
- Editing occurs in the row itself; text is preselected on entry, Enter commits a trimmed non-empty name, Escape cancels, blank submission remains in edit mode, and losing focus commits a valid change or restores the old name.
- Existing `renameLayer` project action records a single Undo/Redo history entry. Keyboard interactions should not accidentally drag or select layers.

## Brushes

- Picker in the existing drawing toolbar selects one of ten brushes: **Карандаш** (`pencil`), **Линер** (`liner`), **Маркер** (`marker`), **Мягкая кисть** (`soft`), **Акварель** (`watercolor`), **Уголь** (`charcoal`), **Сухая кисть** (`dry`), **Аэрограф** (`airbrush`), **Каллиграфия** (`calligraphy`), **Пастель** (`pastel`).
- Each preset produces visibly distinct pixels: opacity, textured gaps, soft falloff, flat nib, bristle marks, or grain as appropriate; none may be a relabelled liner.
- Color and thickness remain shared controls. The last chosen preset stays selected after using the eraser; selecting a preset returns to drawing.
- Preview and committed strokes use the same brush implementation and the same brush ID. Eraser remains an opaque clean cut through the active layer regardless of selected preset.
- Existing document schema/legacy four IDs and Undo/Redo remain valid. No new required fields or dependencies, and brush textures must be deterministic across repeated renders (including export).
- Avoid unbounded rendering cost: sample long paths based on distance, cap stamp counts, and avoid heavyweight per-point surface allocation. Keep pointer/touch navigation unchanged.
- Add pixel-level tests for different brush traits and deterministic output, UI picker tests, end-to-end integration where environment allows, and full unit/build verification.

## Out of scope

Pressure sensitivity, editable per-brush settings, downloadable brush packs, server-side storage and schema migration. These can be considered separately.
