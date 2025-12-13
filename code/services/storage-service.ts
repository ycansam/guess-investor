import { Platform } from 'react-native';

const DB_NAME = 'guess-investor-db';
const STORE_NAME = 'predictions';
const DB_VERSION = 1;

// Verificar si IndexedDB está disponible
const isIndexedDBAvailable = (): boolean => {
  if (Platform.OS !== 'web') return false;
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
};

// Abrir la base de datos
const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

/**
 * Servicio de almacenamiento usando IndexedDB (solo web)
 */
export const storageService = {
  /**
   * Guardar datos en IndexedDB
   */
  save: async <T>(key: string, data: T): Promise<void> => {
    if (!isIndexedDBAvailable()) return;

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(JSON.stringify(data), key);

        request.onerror = () => {
          db.close();
          reject(request.error);
        };

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
      });
    } catch (error) {
      console.warn('Error saving to IndexedDB:', error);
    }
  },

  /**
   * Cargar datos desde IndexedDB
   */
  load: async <T>(key: string): Promise<T | null> => {
    if (!isIndexedDBAvailable()) return null;

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onerror = () => {
          db.close();
          reject(request.error);
        };

        request.onsuccess = () => {
          db.close();
          const result = request.result;
          if (result) {
            try {
              resolve(JSON.parse(result) as T);
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
      });
    } catch (error) {
      console.warn('Error loading from IndexedDB:', error);
      return null;
    }
  },

  /**
   * Eliminar datos de IndexedDB
   */
  remove: async (key: string): Promise<void> => {
    if (!isIndexedDBAvailable()) return;

    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onerror = () => {
          db.close();
          reject(request.error);
        };

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
      });
    } catch (error) {
      console.warn('Error removing from IndexedDB:', error);
    }
  },
};
