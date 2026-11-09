import { useCallback, useEffect, useRef, useState } from 'react';

import { commitAction, createProjectHistory, redoAction, undoAction, type ProjectHistory } from '../editor/history';
import { createProject, type DrawingProject, type ProjectAction } from '../editor/model';
import {
  LEGACY_STORAGE_KEY, deleteProject, listProjects, loadProject, migrateLegacyV1, openProjectDb, saveProject,
  type ProjectSummary,
} from '../editor/persistence';

const ACTIVE_PROJECT_KEY = 'eskizno:active-project:v1';
function lastOpened(): string | null {
  try { return localStorage.getItem(ACTIVE_PROJECT_KEY); } catch { return null; }
}
function rememberOpened(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch { /* IndexedDB remains the source of the actual drawing. */ }
}

export type SaveStatus = 'loading' | 'empty' | 'saving' | 'saved' | 'error';

function hasWork(project: DrawingProject): boolean {
  return project.layers.length > 1 || project.layers.some((layer) => layer.kind === 'paint'
    && (layer.strokes.length > 0 || (layer.operations?.length ?? 0) > 0));
}

export function useLocalProjects() {
  const [history, setHistory] = useState<ProjectHistory>(() => createProjectHistory(createProject()));
  const [ready, setReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [migrationMessage, setMigrationMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const dbRef = useRef<IDBDatabase | null>(null);
  const assetsRef = useRef(new Map<string, Blob>());
  const savedRef = useRef<DrawingProject | null>(null);
  const writtenRef = useRef<DrawingProject | null>(null);
  const outstandingRef = useRef(0);
  const currentRef = useRef(history.present);
  currentRef.current = history.present;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Promise<void>>(Promise.resolve());
  const generationRef = useRef(0);
  const aliveRef = useRef(true);
  const userEditedDuringBootRef = useRef(false);

  const refreshProjects = useCallback(async (db: IDBDatabase) => {
    const found = await listProjects(db);
    if (aliveRef.current) setProjects(found);
  }, []);

  const attachDatabase = useCallback((db: IDBDatabase) => {
    dbRef.current = db;
    const previousHandler = db.onversionchange;
    db.onversionchange = (event) => {
      previousHandler?.call(db, event);
      db.close?.();
      if (dbRef.current === db) {
        dbRef.current = null;
        if (aliveRef.current) {
          setSaveStatus('error');
          setStorageMessage('Хранилище обновилось в другой вкладке. Повторите сохранение.');
        }
      }
    };
  }, []);

  /** Saves are serialized so an earlier delayed transaction cannot overwrite newer changes. */
  const persist = useCallback(async (snapshot: DrawingProject): Promise<boolean> => {
    const db = dbRef.current;
    if (!db) {
      if (aliveRef.current) {
        setSaveStatus('error');
        setStorageMessage('Локальное хранилище недоступно. Рисунок не сохранён.');
      }
      return false;
    }
    const generation = generationRef.current;
    const assets = new Map(assetsRef.current);
    if (aliveRef.current && generation === generationRef.current) {
      setSaveStatus('saving');
      setStorageMessage(null);
    }
    outstandingRef.current += 1;
    const task = pendingRef.current.then(async () => {
      await saveProject(db, snapshot, assets);
      writtenRef.current = snapshot;
    }).finally(() => { outstandingRef.current -= 1; });
    pendingRef.current = task.catch(() => {});
    try {
      await task;
      if (aliveRef.current) {
        await refreshProjects(db);
        if (generation === generationRef.current && currentRef.current === snapshot) {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = null;
          savedRef.current = snapshot;
          rememberOpened(snapshot.id);
          setSaveStatus('saved');
          setStorageMessage(null);
        }
      }
      return true;
    } catch {
      if (aliveRef.current && generation === generationRef.current) {
        setSaveStatus('error');
        setStorageMessage('Не удалось сохранить рисунок. Проверьте свободное место и попробуйте ещё раз.');
      }
      return false;
    }
  }, [refreshProjects]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = null;
    if (!ready) return false;
    const current = currentRef.current;
    if (savedRef.current === current) {
      await pendingRef.current;
      if (writtenRef.current?.id !== current.id || writtenRef.current === current) return true;
      return persist(current);
    }
    if (!hasWork(current) && savedRef.current?.id !== current.id) return true;
    return persist(current);
  }, [persist, ready]);

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;
    const boot = async () => {
      try {
        const db = await openProjectDb();
        if (cancelled) { db.close?.(); return; }
        attachDatabase(db);
        let legacy: string | null = null;
        try { legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY); } catch { /* storage disabled */ }
        try {
          await migrateLegacyV1(db, legacy);
        } catch {
          setMigrationMessage('Не удалось перенести прежний рисунок. Существующие работы доступны; исходный черновик не удалён.');
        }
        const found = await listProjects(db);
        const preferred = found.find(({ id }) => id === lastOpened());
        const mostRecent = preferred ?? found[0];
        const restored = mostRecent ? await loadProject(db, mostRecent.id) : null;
        if (cancelled) return;
        setProjects(found);
        if (userEditedDuringBootRef.current) {
          // A quick first stroke must not be replaced by asynchronous startup restoration.
          savedRef.current = null;
          setSaveStatus('saving');
        } else if (restored) {
          currentRef.current = restored.project;
          savedRef.current = restored.project;
          writtenRef.current = restored.project;
          assetsRef.current = restored.assets;
          setHistory(createProjectHistory(restored.project));
          setSaveStatus('saved');
        } else {
          savedRef.current = currentRef.current;
          setSaveStatus('empty');
        }
      } catch {
        if (cancelled) return;
        setSaveStatus('error');
        setStorageMessage('Локальное хранилище недоступно. Рисунок не сохранён.');
      } finally {
        if (!cancelled) setReady(true);
      }
    };
    void boot();
    return () => {
      cancelled = true;
      aliveRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      dbRef.current?.close?.();
    };
  }, [attachDatabase]);

  useEffect(() => {
    if (!ready || !dbRef.current) return;
    const staleWrite = writtenRef.current?.id === history.present.id
      && writtenRef.current !== history.present;
    if (savedRef.current === history.present && outstandingRef.current === 0 && !staleWrite) return;
    if (!hasWork(history.present) && savedRef.current?.id !== history.present.id) return;
    setSaveStatus('saving');
    setStorageMessage(null);
    const snapshot = history.present;
    debounceRef.current = setTimeout(() => { void persist(snapshot); }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = null; };
  }, [history.present, persist, ready]);

  useEffect(() => {
    if (!ready) return;
    const storedSameProject = savedRef.current?.id === history.present.id;
    if (!storedSameProject && !hasWork(history.present)) return;
    const pendingWrites = outstandingRef.current > 0;
    const staleWrite = writtenRef.current?.id === history.present.id && writtenRef.current !== history.present;
    if (savedRef.current === history.present && !pendingWrites && !staleWrite) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [history.present, ready, saveStatus]);

  const apply = (action: ProjectAction) => {
    if (!ready) userEditedDuringBootRef.current = true;
    setHistory((current) => commitAction(current, action));
  };
  const undo = () => {
    if (!ready) userEditedDuringBootRef.current = true;
    setHistory(undoAction);
  };
  const redo = () => {
    if (!ready) userEditedDuringBootRef.current = true;
    setHistory(redoAction);
  };

  const open = async (id: string): Promise<boolean> => {
    const db = dbRef.current;
    if (!db || !(await flush())) return false;
    try {
      const loaded = await loadProject(db, id);
      if (!loaded) throw new Error('Работа не найдена');
      generationRef.current += 1;
      currentRef.current = loaded.project;
      savedRef.current = loaded.project;
      assetsRef.current = loaded.assets;
      rememberOpened(loaded.project.id);
      setHistory(createProjectHistory(loaded.project));
      setSaveStatus('saved');
      setStorageMessage(null);
      return true;
    } catch {
      setSaveStatus('error');
      setStorageMessage('Не удалось открыть работу. Рисунок в студии не изменён.');
      return false;
    }
  };

  const createNew = async (): Promise<boolean> => {
    if (!(await flush())) return false;
    const project = createProject();
    generationRef.current += 1;
    assetsRef.current = new Map();
    savedRef.current = null;
    currentRef.current = project;
    setHistory(createProjectHistory(project));
    // A new canvas exists even when its first IndexedDB write fails; report that failure in the studio.
    void persist(project);
    return true;
  };

  const remove = async (id: string): Promise<boolean> => {
    const db = dbRef.current;
    if (!db || !(await flush())) return false;
    try {
      await pendingRef.current;
      await deleteProject(db, id);
      if (currentRef.current.id === id) {
        const blank = createProject();
        generationRef.current += 1;
        currentRef.current = blank;
        savedRef.current = blank;
        assetsRef.current = new Map();
        rememberOpened(null);
        setHistory(createProjectHistory(blank));
        setSaveStatus('empty');
      }
      await refreshProjects(db);
      return true;
    } catch {
      setSaveStatus('error');
      setStorageMessage('Не удалось удалить работу. Повторите попытку.');
      return false;
    }
  };

  const retry = async () => {
    if (!dbRef.current) {
      try {
        const db = await openProjectDb();
        attachDatabase(db);
      } catch {
        setSaveStatus('error');
        setStorageMessage('Локальное хранилище недоступно. Рисунок не сохранён.');
        return;
      }
    }
    await persist(currentRef.current);
  };

  const loadPreview = useCallback(async (id: string) => {
    if (!dbRef.current) return null;
    return loadProject(dbRef.current, id);
  }, []);

  return { history, ready, saveStatus, storageMessage, migrationMessage, projects,
    apply, undo, redo, flush, open, createNew, remove, retry, loadPreview };
}
