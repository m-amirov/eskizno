import { applyAction, createProject, parseDrawingProject, type DrawingProject, type Stroke } from './model';
import { normalizeLearningProgress, type LearningProgress } from '../learning/progress';

const DB_NAME = 'eskizno-projects';
const DB_VERSION = 2;
const LEGACY_ID = 'legacy-botanical-branch-v1';
const LEGACY_DELETED_KEY = 'deleted:legacy-botanical-branch-v1';
export const LEGACY_STORAGE_KEY = 'eskizno:prototype:botanical-branch:v1';

export interface SavedProject { project: DrawingProject; assets: Map<string, Blob> }
export interface ProjectSummary { id: string; title: string; createdAt: number; updatedAt: number; lessonId?: string }
export interface ProgressState {
  schemaVersion: 1;
  lessonAttempts: Record<string, number>;
  earnedAchievementIds: string[];
}

const EMPTY_PROGRESS: ProgressState = { schemaVersion: 1, lessonAttempts: {}, earnedAchievementIds: [] };

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Не удалось прочитать IndexedDB'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Сохранение прервано'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Ошибка IndexedDB'));
  });
}

export function openProjectDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis) || !globalThis.indexedDB) {
      reject(new Error('IndexedDB недоступен'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      const assets = db.objectStoreNames.contains('assets')
        ? request.transaction!.objectStore('assets')
        : db.createObjectStore('assets', { keyPath: 'id' });
      if (!assets.indexNames.contains('projectId')) assets.createIndex('projectId', 'projectId');
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Не удалось открыть IndexedDB'));
    request.onblocked = () => reject(new Error('Другая вкладка блокирует обновление базы'));
  });
}

export async function saveProject(db: IDBDatabase, project: DrawingProject, assets: Map<string, Blob>): Promise<void> {
  const validated = parseDrawingProject(project);
  if (!validated) throw new TypeError('Некорректные данные рисунка');
  for (const [assetId, blob] of assets) {
    if (!assetId || !(blob instanceof Blob)) throw new TypeError('Некорректный файл рисунка');
  }
  const transaction = db.transaction(['projects', 'assets'], 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore('projects').put(validated);
  const assetStore = transaction.objectStore('assets');
  for (const [assetId, blob] of assets) {
    assetStore.put({ id: `${project.id}:${assetId}`, projectId: project.id, assetId, blob });
  }
  const existingAssets = assetStore.index('projectId').getAll(project.id);
  existingAssets.onsuccess = () => {
    for (const row of existingAssets.result as Array<{ id: string; projectId: string; assetId: string }>) {
      if (row.projectId === project.id && !assets.has(row.assetId)) assetStore.delete(row.id);
    }
  };
  await done;
}

export async function loadProject(db: IDBDatabase, id: string): Promise<SavedProject | null> {
  const transaction = db.transaction(['projects', 'assets'], 'readonly');
  const done = transactionDone(transaction);
  const [record, assets] = await Promise.all([
    requestValue(transaction.objectStore('projects').get(id)),
    requestValue<Array<{ projectId: string; assetId: string; blob: Blob }>>(
      transaction.objectStore('assets').index('projectId').getAll(id)),
  ]);
  await done;
  const project = parseDrawingProject(record);
  if (!project) return null;
  return { project, assets: new Map(assets.filter((asset) => asset.projectId === id && asset.blob instanceof Blob)
    .map((asset) => [asset.assetId, asset.blob])) };
}

export async function listProjects(db: IDBDatabase): Promise<ProjectSummary[]> {
  const transaction = db.transaction('projects', 'readonly');
  const done = transactionDone(transaction);
  const raw = await requestValue<unknown[]>(transaction.objectStore('projects').getAll());
  await done;
  return raw.flatMap((record) => {
    const project = parseDrawingProject(record);
    return project ? [{ id: project.id, title: project.title,
      createdAt: project.createdAt, updatedAt: project.updatedAt,
      ...(project.lesson ? { lessonId: project.lesson.id } : {}) }] : [];
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(db: IDBDatabase, id: string): Promise<void> {
  const transaction = db.transaction(['projects', 'assets', 'progress'], 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore('projects').delete(id);
  if (id === LEGACY_ID) transaction.objectStore('progress').put({ key: LEGACY_DELETED_KEY, value: true });
  const assetStore = transaction.objectStore('assets');
  const assetsRequest = assetStore.index('projectId').getAll(id);
  assetsRequest.onsuccess = () => {
    for (const asset of assetsRequest.result as Array<{ id: string; projectId: string }>) {
      if (asset.projectId === id) assetStore.delete(asset.id);
    }
  };
  await done;
}

function normalizeProgress(value: unknown): ProgressState {
  if (!value || typeof value !== 'object') return { ...EMPTY_PROGRESS, lessonAttempts: {}, earnedAchievementIds: [] };
  const raw = value as ProgressState;
  if (raw.schemaVersion !== 1 || !raw.lessonAttempts || typeof raw.lessonAttempts !== 'object'
    || !Array.isArray(raw.earnedAchievementIds)) return { ...EMPTY_PROGRESS, lessonAttempts: {}, earnedAchievementIds: [] };
  const lessonAttempts = Object.fromEntries(Object.entries(raw.lessonAttempts)
    .filter(([id, count]) => id.length > 0 && Number.isSafeInteger(count) && count >= 0));
  const earnedAchievementIds = [...new Set(raw.earnedAchievementIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0))];
  return { schemaVersion: 1, lessonAttempts, earnedAchievementIds };
}

export async function saveProgress(db: IDBDatabase, progress: ProgressState): Promise<void> {
  const transaction = db.transaction('progress', 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore('progress').put({ key: 'global', value: normalizeProgress(progress) });
  await done;
}

export async function loadProgress(db: IDBDatabase): Promise<ProgressState> {
  const transaction = db.transaction('progress', 'readonly');
  const done = transactionDone(transaction);
  const result = await requestValue<{ key: string; value: unknown } | undefined>(
    transaction.objectStore('progress').get('global'));
  await done;
  return normalizeProgress(result?.value);
}

export async function saveLearningProgress(db: IDBDatabase, progress: LearningProgress): Promise<void> {
  const transaction = db.transaction('progress', 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore('progress').put({ key: 'learning', value: normalizeLearningProgress(progress) });
  await done;
}

export async function loadLearningProgress(db: IDBDatabase): Promise<LearningProgress> {
  const transaction = db.transaction('progress', 'readonly');
  const done = transactionDone(transaction);
  const result = await requestValue<{ key: string; value: unknown } | undefined>(
    transaction.objectStore('progress').get('learning'));
  await done;
  return normalizeLearningProgress(result?.value);
}

/** A legacy localStorage key can be read only when this app runs on the same origin. */
export async function migrateLegacyV1(db: IDBDatabase, raw: string | null): Promise<string | null> {
  if (!raw) return null;
  let legacy: unknown;
  try { legacy = JSON.parse(raw); } catch { return null; }
  if (!legacy || typeof legacy !== 'object') return null;
  const candidate = legacy as Record<string, unknown>;
  if (candidate.version !== 1 || candidate.lessonId !== 'botanical-branch'
    || !['adult', 'child'].includes(candidate.audience as string)
    || !['trace', 'construct', 'free'].includes(candidate.mode as string)
    || !Number.isInteger(candidate.step) || (candidate.step as number) < 0 || (candidate.step as number) > 5
    || !Array.isArray(candidate.strokes) || candidate.strokes.length > 500) return null;
  const migrationTransaction = db.transaction('progress', 'readonly');
  const migrationDone = transactionDone(migrationTransaction);
  const deleted = await requestValue<{ key: string; value: boolean } | undefined>(
    migrationTransaction.objectStore('progress').get(LEGACY_DELETED_KEY));
  await migrationDone;
  if (deleted?.value) return null;
  const strokes = candidate.strokes as Array<Partial<Stroke>>;
  if (new Set(strokes.map((stroke) => stroke?.id)).size !== strokes.length) return null;
  const project = createProject({ title: 'Веточка с листьями · прежний рисунок', lesson: {
    id: 'botanical-branch', audience: candidate.audience as 'adult' | 'child',
    mode: candidate.mode as 'trace' | 'construct' | 'free', step: candidate.step as number,
  } });
  let migrated: DrawingProject = { ...project, id: LEGACY_ID };
  for (const old of strokes) {
    if (!old || typeof old.id !== 'string' || !old.id
      || !Number.isInteger(old.step) || old.step! < 0 || old.step! > 5
      || !Array.isArray(old.points) || old.points.length < 1 || old.points.length > 2000
      || !Number.isFinite(old.width) || old.width! <= 0 || old.width! > 50) return null;
    const converted: Stroke = { id: old.id, step: old.step, kind: old.kind ?? 'ink',
      brushId: 'pencil', color: old.color as string, width: old.width!, opacity: 1, points: old.points };
    const next = applyAction(migrated, { type: 'addStroke', layerId: migrated.activeLayerId, stroke: converted });
    if (next === migrated) return null;
    migrated = next;
  }
  const existing = await loadProject(db, LEGACY_ID);
  if (existing) return LEGACY_ID;
  await saveProject(db, migrated, new Map());
  return LEGACY_ID;
}
