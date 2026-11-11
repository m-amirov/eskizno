import { useCallback, useEffect, useRef, useState } from 'react';

import { createProjectHistory, redoAction, undoAction, type ProjectHistory } from '../editor/history';
import { createProject, type DrawingProject, type ProjectAction } from '../editor/model';
import { guardedCommitAction, PROFESSIONAL_TOOL_ACCESS, type ToolAvailabilityContext } from '../editor/toolAccess';
import { FIRST_LESSON_ID, getLesson, isLessonStepSatisfied, learningLessonSteps } from '../learning/lessons';
import { completeLearningLesson, duplicateLessonProject, normalizeLearningProgress } from '../learning/progress';
import { addReferenceLayer } from '../editor/reference-mode';
import type { ImportedImage } from '../editor/import-image';
import {
  LEGACY_STORAGE_KEY, deleteProject, listProjects, loadLearningProgress, loadProject, migrateLegacyV1, openProjectDb,
  saveLearningProgress, saveProject,
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
  const [assets, setAssets] = useState<Map<string, Blob>>(() => new Map());
  const [learningProgress, setLearningProgress] = useState(() => normalizeLearningProgress(undefined));
  const [learningMessage, setLearningMessage] = useState<string | null>(null);
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
  const editRevisionRef = useRef(0);

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
        const [found, restoredLearningProgress] = await Promise.all([listProjects(db), loadLearningProgress(db)]);
        const preferred = found.find(({ id }) => id === lastOpened());
        const mostRecent = preferred ?? found[0];
        const restored = mostRecent ? await loadProject(db, mostRecent.id) : null;
        if (cancelled) return;
        setProjects(found);
        setLearningProgress(restoredLearningProgress);
        if (userEditedDuringBootRef.current) {
          // A quick first stroke must not be replaced by asynchronous startup restoration.
          savedRef.current = null;
          setSaveStatus('saving');
        } else if (restored) {
          currentRef.current = restored.project;
          savedRef.current = restored.project;
          writtenRef.current = restored.project;
          assetsRef.current = restored.assets;
          setAssets(restored.assets);
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

  const apply = (action: ProjectAction, access: ToolAvailabilityContext = PROFESSIONAL_TOOL_ACCESS) => {
    editRevisionRef.current += 1;
    if (!ready) userEditedDuringBootRef.current = true;
    setHistory((current) => guardedCommitAction(current, action, access));
  };
  const undo = () => {
    editRevisionRef.current += 1;
    if (!ready) userEditedDuringBootRef.current = true;
    setHistory(undoAction);
  };
  const redo = () => {
    editRevisionRef.current += 1;
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
      setAssets(loaded.assets);
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
    const revision = editRevisionRef.current;
    if (!(await flush())) return false;
    if (revision !== editRevisionRef.current) {
      setStorageMessage('Рисунок изменился во время сохранения. Новый холст не создан, ваши правки сохранены в студии.');
      return false;
    }
    const project = createProject();
    generationRef.current += 1;
    assetsRef.current = new Map();
    setAssets(assetsRef.current);
    savedRef.current = null;
    currentRef.current = project;
    setHistory(createProjectHistory(project));
    // A new canvas exists even when its first IndexedDB write fails; report that failure in the studio.
    void persist(project);
    return true;
  };

  const createWithReference = async (
    imported: ImportedImage, placement: 'overlay' | 'side', size: { width: number; height: number },
  ): Promise<boolean> => {
    const revision = editRevisionRef.current;
    if (!ready || !(await flush())) return false;
    if (revision !== editRevisionRef.current) {
      setStorageMessage('Рисунок изменился во время сохранения. Импорт отменён, ваши правки сохранены в студии.');
      return false;
    }
    const initial = createProject({ width: size.width, height: size.height });
    const assetId = crypto.randomUUID();
    const project = addReferenceLayer(initial, assetId, placement);
    const nextAssets = new Map([[assetId, imported.blob]]);
    generationRef.current += 1;
    assetsRef.current = nextAssets;
    setAssets(nextAssets);
    savedRef.current = null;
    currentRef.current = project;
    setHistory(createProjectHistory(project));
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
        setAssets(assetsRef.current);
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

  const startLesson = async (lessonId = FIRST_LESSON_ID): Promise<boolean> => {
    const db = dbRef.current;
    if (!ready || !db || (lessonId !== FIRST_LESSON_ID && !getLesson(lessonId))) return false;
    if (currentRef.current.lesson?.id === lessonId) return true;
    const revision = editRevisionRef.current;
    if (!(await flush())) return false;
    if (revision !== editRevisionRef.current) return false;
    const existing = projects.find((entry) => entry.lessonId === lessonId);
    if (existing) return open(existing.id);
    const project = createProject({ title: getLesson(lessonId)?.title ?? 'Линия и уверенность', lesson: {
      id: lessonId, audience: 'adult', mode: 'construct', step: 0,
    } });
    try {
      await saveProject(db, project, new Map());
      if (revision !== editRevisionRef.current) return false;
      generationRef.current += 1;
      currentRef.current = project;
      savedRef.current = project;
      writtenRef.current = project;
      assetsRef.current = new Map();
      setAssets(assetsRef.current);
      setHistory(createProjectHistory(project));
      rememberOpened(project.id);
      setSaveStatus('saved');
      setStorageMessage(null);
      setLearningMessage(null);
      await refreshProjects(db);
      return true;
    } catch {
      setLearningMessage('Не удалось создать урок. Текущий рисунок не изменён.');
      return false;
    }
  };

  const startPractice = async (lessonId: string): Promise<boolean> => {
    const db = dbRef.current;
    const lesson = getLesson(lessonId);
    if (!ready || !db || !lesson || currentRef.current.lesson?.id !== lessonId) return false;
    const revision = editRevisionRef.current;
    if (!(await flush()) || revision !== editRevisionRef.current) return false;
    const project = createProject({ title: lesson.practice });
    try {
      await saveProject(db, project, new Map());
      if (revision !== editRevisionRef.current) return false;
      generationRef.current += 1;
      currentRef.current = project;
      savedRef.current = project;
      writtenRef.current = project;
      assetsRef.current = new Map();
      setAssets(assetsRef.current);
      setHistory(createProjectHistory(project));
      rememberOpened(project.id);
      setSaveStatus('saved');
      setStorageMessage(null);
      setLearningMessage(null);
      await refreshProjects(db);
      return true;
    } catch {
      setLearningMessage('Не удалось создать самостоятельную практику. Учебный рисунок остался на месте.');
      return false;
    }
  };

  const openProfessionalWorkspace = async (): Promise<boolean> => {
    const db = dbRef.current;
    if (!ready || !db) return false;
    if (!currentRef.current.lesson) return true;
    const revision = editRevisionRef.current;
    if (!(await flush()) || revision !== editRevisionRef.current) return false;
    const lastProfessional = projects.find((entry) => !entry.lessonId);
    if (lastProfessional) return open(lastProfessional.id);
    const project = createProject();
    try {
      await saveProject(db, project, new Map());
      if (revision !== editRevisionRef.current) return false;
      generationRef.current += 1;
      currentRef.current = project;
      savedRef.current = project;
      writtenRef.current = project;
      assetsRef.current = new Map();
      setAssets(assetsRef.current);
      setHistory(createProjectHistory(project));
      rememberOpened(project.id);
      setSaveStatus('saved');
      setStorageMessage(null);
      await refreshProjects(db);
      return true;
    } catch {
      setStorageMessage('Не удалось открыть свободную студию. Учебный рисунок не изменён.');
      return false;
    }
  };

  const copyLessonToStudio = async (): Promise<boolean> => {
    const db = dbRef.current;
    if (!ready || !db || !currentRef.current.lesson) return false;
    const revision = editRevisionRef.current;
    if (!(await flush()) || revision !== editRevisionRef.current) return false;
    const source = currentRef.current;
    try {
      const copy = duplicateLessonProject(source);
      const copiedAssets = new Map(assetsRef.current);
      await saveProject(db, copy, copiedAssets);
      if (revision !== editRevisionRef.current) return false;
      generationRef.current += 1;
      currentRef.current = copy;
      savedRef.current = copy;
      writtenRef.current = copy;
      assetsRef.current = copiedAssets;
      setAssets(copiedAssets);
      setHistory(createProjectHistory(copy));
      rememberOpened(copy.id);
      setSaveStatus('saved');
      setStorageMessage(null);
      setLearningMessage(null);
      await refreshProjects(db);
      return true;
    } catch {
      setLearningMessage('Не удалось создать копию. Учебный рисунок остался на месте.');
      return false;
    }
  };

  const finishLesson = async (): Promise<boolean> => {
    const db = dbRef.current;
    const lessonId = currentRef.current.lesson?.id;
    const steps = lessonId === FIRST_LESSON_ID ? learningLessonSteps : getLesson(lessonId ?? '')?.steps;
    if (!ready || !db || !lessonId || !steps || currentRef.current.lesson!.step < steps.length
      || !steps.every((_, i) => isLessonStepSatisfied(currentRef.current, i))) return false;
    const revision = editRevisionRef.current;
    if (!(await flush()) || revision !== editRevisionRef.current) return false;
    const updated = completeLearningLesson(learningProgress, lessonId);
    try {
      await saveLearningProgress(db, updated);
      if (aliveRef.current) { setLearningProgress(updated); setLearningMessage(null); }
      return true;
    } catch {
      setLearningMessage('Не удалось сохранить завершение урока. Повторите попытку — доступ не изменён.');
      return false;
    }
  };

  return { history, ready, saveStatus, storageMessage, migrationMessage, projects, assets,
    learningProgress, learningMessage, startLesson, startPractice, openProfessionalWorkspace, copyLessonToStudio, finishLesson,
    apply, undo, redo, flush, open, createNew, createWithReference, remove, retry, loadPreview };
}
