import { parseOfflineProject, type OfflineProject } from './model';

export type BoardMode = 'practice' | 'field';

export type BoardRead =
  | { status: 'empty' }
  | { status: 'ok'; project: OfflineProject }
  | { status: 'invalid'; message: string };

const DB_NAME = 's-question-board-v1';
const STORE = 'snapshots';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('브라우저 저장소를 열지 못했습니다.'));
  });
}

export async function readBoard(mode: BoardMode): Promise<BoardRead> {
  const db = await openDb();
  try {
    const stored = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(mode);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('저장된 기록을 읽지 못했습니다.'));
    });
    if (typeof stored !== 'string' || stored.length === 0) return { status: 'empty' };
    const parsed = parseOfflineProject(stored);
    if (!parsed.ok) return { status: 'invalid', message: parsed.message };
    return { status: 'ok', project: parsed.project };
  } finally {
    db.close();
  }
}

export async function writeBoard(mode: BoardMode, project: OfflineProject): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('이 기기에 기록을 저장하지 못했습니다.'));
      tx.onabort = () => reject(tx.error ?? new Error('이 기기에 기록을 저장하지 못했습니다.'));
      tx.objectStore(STORE).put(JSON.stringify(project), mode);
    });
  } finally {
    db.close();
  }
}
