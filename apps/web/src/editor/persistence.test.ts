import { describe, expect, it } from 'vitest';

import { applyAction, createProject, type ReferenceLayer } from './model';
import { deleteProject, listProjects, loadProgress, loadProject, migrateLegacyV1,
  saveProgress, saveProject } from './persistence';

/** Transactional, asynchronous IndexedDB stand-in; no browser or network required. */
function memoryDb() {
  const stores = new Map<string, Map<string, unknown>>([
    ['projects', new Map()], ['assets', new Map()], ['progress', new Map()],
  ]);
  let rejectNextPut = false;
  let rejectAtPut = 0;
  let putSequence = 0;
  let fullAssetScans = 0;
  const db = {
    transaction(names: string | string[], mode: IDBTransactionMode = 'readonly') {
      const selected = Array.isArray(names) ? names : [names];
      const snapshots = new Map(selected.map((name) => [name, new Map(stores.get(name) ?? [])]));
      let pending = 0;
      let done = false;
      let aborted = false;
      const tx = {
        error: null as Error | null,
        oncomplete: null as null | (() => void),
        onabort: null as null | (() => void),
        onerror: null as null | (() => void),
        objectStore(name: string) {
          const store = snapshots.get(name);
          if (!store) throw new Error(`Missing object store: ${name}`);
          const request = (operation: () => unknown) => {
            pending += 1;
            const result = { result: undefined as unknown, error: null as Error | null,
              onsuccess: null as null | (() => void), onerror: null as null | (() => void) };
            queueMicrotask(() => {
              if (aborted) return;
              try { result.result = operation(); }
              catch (error) {
                result.error = error as Error;
                tx.error = error as Error;
                aborted = true;
                result.onerror?.();
                tx.onabort?.();
                return;
              }
              result.onsuccess?.();
              pending -= 1;
              queueMicrotask(finish);
            });
            return result as unknown as IDBRequest;
          };
          return {
            get: (key: string) => request(() => store.get(key)),
            getAll: () => request(() => {
              if (name === 'assets') fullAssetScans += 1;
              return [...store.values()];
            }),
            index: (indexName: string) => {
              if (name !== 'assets' || indexName !== 'projectId') throw new Error('Unknown index');
              return { getAll: (projectId: string) => request(() => [...store.values()].filter(
                (row) => (row as { projectId: string }).projectId === projectId)) };
            },
            put: (value: { id?: string; key?: string }) => request(() => {
              if (rejectNextPut) { rejectNextPut = false; throw new Error('QuotaExceededError'); }
              putSequence += 1;
              if (rejectAtPut === putSequence) { rejectAtPut = 0; throw new Error('Blob quota exceeded'); }
              const key = value.id ?? value.key;
              if (!key) throw new Error('missing key');
              // JSDOM Blob is not serializable by Node's structuredClone; native IDB preserves it.
              const cloned = structuredClone(value) as Record<string, unknown>;
              if ('blob' in value && value.blob instanceof Blob) cloned.blob = value.blob;
              store.set(key, cloned);
              return key;
            }),
            delete: (key: string) => request(() => { store.delete(key); }),
          };
        },
      };
      const finish = () => {
        if (pending || aborted || done) return;
        done = true;
        if (mode === 'readwrite') {
          for (const [name, snapshot] of snapshots) stores.set(name, snapshot);
        }
        tx.oncomplete?.();
      };
      queueMicrotask(finish);
      return tx as unknown as IDBTransaction;
    },
  } as unknown as IDBDatabase;
  return { db, failPut: () => { rejectNextPut = true; },
    failOnSecondPut: () => { rejectAtPut = putSequence + 2; }, fullAssetScans: () => fullAssetScans };
}

describe('локальное хранение проектов', () => {
  it('восстанавливает слои и Blob референса без потери свойств и сортирует галерею', async () => {
    const { db } = memoryDb();
    const base = createProject({ title: 'Тест рисунка' });
    const drawn = applyAction(base, { type: 'addStroke', layerId: base.activeLayerId,
      stroke: { id: 'stroke-1', kind: 'erase', brushId: 'pencil', color: '#254332', width: 17,
        opacity: .5, points: [{ x: .2, y: .3 }, { x: .4, y: .5 }], step: 3 } });
    const reference: ReferenceLayer = { id: 'reference-layer', kind: 'reference', name: 'Мой эскиз',
      assetId: 'reference-1', placement: 'overlay', transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      visible: true, locked: true, opacity: .6 };
    const project = applyAction(drawn, { type: 'addLayer', layer: reference });
    const asset = new Blob(['image-bytes'], { type: 'image/png' });
    await saveProject(db, project, new Map([['reference-1', asset]]));
    const loaded = await loadProject(db, project.id);
    expect(loaded?.project).toEqual(project);
    expect(loaded?.assets.get('reference-1')).toBeInstanceOf(Blob);
    expect(await loaded?.assets.get('reference-1')?.text()).toBe('image-bytes');
    expect(await listProjects(db)).toEqual([expect.objectContaining({
      id: project.id, title: 'Тест рисунка', updatedAt: project.updatedAt,
    })]);
    await deleteProject(db, project.id);
    expect(await loadProject(db, project.id)).toBeNull();
    expect(await listProjects(db)).toEqual([]);
  });

  it('не выдаёт успешное сохранение при отказе транзакции и сохраняет прежний проект', async () => {
    const { db, failPut } = memoryDb();
    const initial = createProject({ title: 'Уцелевший' });
    await saveProject(db, initial, new Map());
    failPut();
    await expect(saveProject(db, { ...initial, title: 'Не записан' }, new Map())).rejects.toThrow();
    expect((await loadProject(db, initial.id))?.project.title).toBe('Уцелевший');
  });

  it('откатывает изменения проекта, если Blob во второй операции put не записался', async () => {
    const { db, failOnSecondPut } = memoryDb();
    const original = createProject({ title: 'До ошибки Blob' });
    await saveProject(db, original, new Map([['old', new Blob(['old'])]]));
    failOnSecondPut();
    await expect(saveProject(db, { ...original, title: 'Нельзя сохранить' },
      new Map([['new', new Blob(['new'])]]))).rejects.toThrow('Blob quota exceeded');
    const restored = await loadProject(db, original.id);
    expect(restored?.project.title).toBe('До ошибки Blob');
    expect([...(restored?.assets.keys() ?? [])]).toEqual(['old']);
  });

  it('отклоняет ошибочный файл до запуска транзакции, не меняя сохранённый рисунок', async () => {
    const { db } = memoryDb();
    const initial = createProject({ title: 'До ошибки' });
    await saveProject(db, initial, new Map());
    await expect(saveProject(db, { ...initial, title: 'Не сохранять' },
      new Map([['bad', {} as Blob]]))).rejects.toThrow('Некорректный файл');
    expect((await loadProject(db, initial.id))?.project.title).toBe('До ошибки');
  });

  it('при замене вложений удаляет устаревшие Blob только у этого проекта', async () => {
    const { db } = memoryDb();
    const first = createProject({ title: 'Первый' });
    const second = createProject({ title: 'Второй' });
    await saveProject(db, first, new Map([['old', new Blob(['старый'])]]));
    await saveProject(db, second, new Map([['kept', new Blob(['другой'])]]));
    await saveProject(db, first, new Map([['new', new Blob(['новый'])]]));
    expect([...(await loadProject(db, first.id))!.assets.keys()]).toEqual(['new']);
    expect([...(await loadProject(db, second.id))!.assets.keys()]).toEqual(['kept']);
  });

  it('выбирает вложения по projectId, не читая Blob всех проектов галереи', async () => {
    const { db, fullAssetScans } = memoryDb();
    const first = createProject();
    const second = createProject();
    await saveProject(db, first, new Map([['first', new Blob(['one'])]]));
    await saveProject(db, second, new Map([['second', new Blob(['two'])]]));
    expect([...(await loadProject(db, first.id))!.assets.keys()]).toEqual(['first']);
    await deleteProject(db, second.id);
    expect(fullAssetScans()).toBe(0);
  });

  it('отдельно сохраняет прогресс, удаляет повторы достижений и восстанавливает пустые значения', async () => {
    const { db } = memoryDb();
    expect(await loadProgress(db)).toEqual({ schemaVersion: 1, lessonAttempts: {}, earnedAchievementIds: [] });
    await saveProgress(db, { schemaVersion: 1, lessonAttempts: { 'lesson-1': 3 },
      earnedAchievementIds: ['first', 'first', 'second'] });
    expect(await loadProgress(db)).toEqual({ schemaVersion: 1, lessonAttempts: { 'lesson-1': 3 },
      earnedAchievementIds: ['first', 'second'] });
  });

  it('мигрирует старый черновик идемпотентно, сохраняя шаг, стирание и порядок', async () => {
    const { db } = memoryDb();
    const raw = JSON.stringify({ version: 1, lessonId: 'botanical-branch', audience: 'adult', mode: 'trace', step: 4,
      strokes: [
        { id: 'first', kind: 'ink', color: '#112233', width: 5, step: 1, points: [{ x: .1, y: .2 }] },
        { id: 'second', kind: 'erase', color: '#112233', width: 9, step: 4, points: [{ x: .3, y: .4 }] },
      ] });
    const id = await migrateLegacyV1(db, raw);
    expect(id).toBeTruthy();
    expect(await migrateLegacyV1(db, raw)).toBe(id);
    expect((await listProjects(db))).toHaveLength(1);
    const project = (await loadProject(db, id!))?.project;
    expect(project?.lesson?.step).toBe(4);
    expect(project?.layers[0]).toMatchObject({ kind: 'paint', strokes: [
      { id: 'first', step: 1, kind: 'ink' }, { id: 'second', step: 4, kind: 'erase' },
    ] });
    expect(await migrateLegacyV1(db, '{broken')).toBeNull();
    expect(await listProjects(db)).toHaveLength(1);
    await deleteProject(db, id!);
    expect(await migrateLegacyV1(db, raw)).toBeNull();
    expect(await listProjects(db)).toHaveLength(0);
  });
});
