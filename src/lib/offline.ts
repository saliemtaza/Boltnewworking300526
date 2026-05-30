import { supabase } from './supabase';

const DB_NAME = 'taza_offline_db';
const DB_VERSION = 2;
const STORES = {
  PRODUCTS: 'products_cache',
  CATEGORIES: 'categories_cache',
  SYNC_QUEUE: 'sync_queue',
  MANIFESTS: 'manifests_cache',
} as const;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
        db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
        db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const store = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.MANIFESTS)) {
        db.createObjectStore(STORES.MANIFESTS, { keyPath: 'date' });
      }
      void event;
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheProducts(products: unknown[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.PRODUCTS, 'readwrite');
    const store = tx.objectStore(STORES.PRODUCTS);
    store.clear();
    for (const p of products) {
      store.put(p);
    }
    tx.oncomplete = () => db.close();
  } catch { /* ignore */ }
}

export async function getCachedProducts(): Promise<unknown[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.PRODUCTS, 'readonly');
    const store = tx.objectStore(STORES.PRODUCTS);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch { return []; }
}

export async function cacheCategories(categories: unknown[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.CATEGORIES, 'readwrite');
    const store = tx.objectStore(STORES.CATEGORIES);
    store.clear();
    for (const c of categories) {
      store.put(c);
    }
    tx.oncomplete = () => db.close();
  } catch { /* ignore */ }
}

export async function getCachedCategories(): Promise<unknown[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.CATEGORIES, 'readonly');
    const store = tx.objectStore(STORES.CATEGORIES);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch { return []; }
}

export interface SyncQueueEntry {
  id?: number;
  type: 'order';
  payload: Record<string, unknown>;
  message: string;
  timestamp: number;
  synced: boolean;
}

export async function addToSyncQueue(entry: Omit<SyncQueueEntry, 'id' | 'synced'>): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    store.add({ ...entry, synced: false });
    tx.oncomplete = () => db.close();
  } catch { /* ignore */ }
}

export async function getSyncQueue(): Promise<SyncQueueEntry[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readonly');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        db.close();
        resolve((request.result as SyncQueueEntry[]).filter((e) => !e.synced));
      };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch { return []; }
}

export async function markSynced(id: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.SYNC_QUEUE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (entry) {
        entry.synced = true;
        store.put(entry);
      }
    };
    tx.oncomplete = () => db.close();
  } catch { /* ignore */ }
}

export async function processSyncQueue(): Promise<number> {
  const entries = await getSyncQueue();
  let processed = 0;
  for (const entry of entries) {
    if (entry.id && entry.type === 'order') {
      try {
        const { error } = await supabase.from('orders_log').insert(entry.payload);
        if (!error) {
          await markSynced(entry.id);
          processed++;
        }
      } catch { break; }
    }
  }
  return processed;
}

// ============================================================
// MANIFEST CACHE (driver route manifest, must be available offline by 10AM)
// ============================================================

export interface CachedManifest {
  date: string;
  allocations: Record<string, unknown[]>;
  createdAt: number;
}

export async function cacheManifest(manifest: CachedManifest): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.MANIFESTS, 'readwrite');
    const store = tx.objectStore(STORES.MANIFESTS);
    store.put(manifest);
    tx.oncomplete = () => db.close();
  } catch { /* ignore */ }
}

export async function getCachedManifest(date: string): Promise<CachedManifest | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.MANIFESTS, 'readonly');
    const store = tx.objectStore(STORES.MANIFESTS);
    return new Promise((resolve, reject) => {
      const request = store.get(date);
      request.onsuccess = () => { db.close(); resolve(request.result ?? null); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch { return null; }
}

export async function getAllCachedManifests(): Promise<CachedManifest[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.MANIFESTS, 'readonly');
    const store = tx.objectStore(STORES.MANIFESTS);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => { db.close(); resolve(request.result ?? []); };
      request.onerror = () => { db.close(); reject(request.error); };
    });
  } catch { return []; }
}

// ============================================================
// NETWORK UTILITIES
// ============================================================

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function onNetworkChange(callback: (online: boolean) => void): () => void {
  const goOnline = () => callback(true);
  const goOffline = () => callback(false);
  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);
  return () => {
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOffline);
  };
}
