import type { StoredFileMeta } from '../../types';

const DB_NAME = 'hydraroll-management-files';
const STORE_NAME = 'files';
export interface LocalStoredFile extends StoredFileMeta { blob: Blob }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listFiles(): Promise<LocalStoredFile[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as LocalStoredFile[]);
    request.onerror = () => reject(request.error);
  });
}

export async function addFiles(files: File[], category: string, equipment: string, notes: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    for (const file of files) store.put({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, category, equipment, notes, added: new Date().toISOString(), blob: file } satisfies LocalStoredFile);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function removeFile(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
