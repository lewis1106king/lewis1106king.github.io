export type RpcJob = {
  id: string;
  kind: 'rpc';
  name: string;
  args: Record<string, unknown>;
  createdAt: string;
};

export type PhotoJob = {
  id: string;
  kind: 'photo';
  missionId: string;
  zoneId: string;
  memo: string;
  filename: string;
  blob: Blob;
  createdAt: string;
};

export type QueueJob = RpcJob | PhotoJob;

const DB_NAME = 'suseak-sync';
const STORE = 'jobs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('대기열을 열지 못했습니다.'));
  });
}

export async function listJobs(): Promise<QueueJob[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => {
        const jobs = (request.result as QueueJob[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        resolve(jobs);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function enqueue(job: QueueJob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(job);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function removeJob(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /failed to fetch|network|offline|load failed/i.test(message);
}
