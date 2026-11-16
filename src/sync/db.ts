import type { MissionData } from '../mission/types';

const memory = new Map<string, MissionData>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('suseak', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('missions')) request.result.createObjectStore('missions');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadMission(code: string): Promise<MissionData | null> {
  const cached = memory.get(code);
  if (cached) return cached;
  try {
    const db = await openDb();
    const stored = await new Promise<MissionData | null>((resolve, reject) => {
      const request = db.transaction('missions', 'readonly').objectStore('missions').get(code);
      request.onsuccess = () => resolve((request.result as MissionData | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (stored) memory.set(code, stored);
    return stored;
  } catch {
    return null;
  }
}

export async function saveMission(code: string, data: MissionData): Promise<void> {
  memory.set(code, data);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('missions', 'readwrite');
      tx.objectStore('missions').put(data, code);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // 이 브라우저의 메모리에는 남아 있다.
  }
}
