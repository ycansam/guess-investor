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
    if (!isIndexedDBAvailable()) {
      console.log('[Storage] IndexedDB no disponible, saltando guardado');
      return;
    }

    try {
      console.log('[Storage] Guardando en IndexedDB, key:', key);
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(JSON.stringify(data), key);

        request.onerror = () => {
          console.error('[Storage] Error al guardar:', request.error);
          db.close();
          reject(request.error);
        };

        transaction.oncomplete = () => {
          console.log('[Storage] Guardado exitoso en IndexedDB');
          db.close();
          resolve();
        };
      });
    } catch (error) {
      console.warn('[Storage] Error saving to IndexedDB:', error);
    }
  },

  /**
   * Cargar datos desde IndexedDB
   */
  load: async <T>(key: string): Promise<T | null> => {
    if (!isIndexedDBAvailable()) {
      console.log('[Storage] IndexedDB no disponible, saltando carga');
      return null;
    }

    try {
      console.log('[Storage] Cargando desde IndexedDB, key:', key);
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onerror = () => {
          console.error('[Storage] Error al cargar:', request.error);
          db.close();
          reject(request.error);
        };

        request.onsuccess = () => {
          db.close();
          const result = request.result;
          if (result) {
            try {
              const parsed = JSON.parse(result) as T;
              console.log('[Storage] Datos cargados correctamente');
              resolve(parsed);
            } catch {
              console.warn('[Storage] Error parseando JSON');
              resolve(null);
            }
          } else {
            console.log('[Storage] No hay datos guardados para esta key');
            resolve(null);
          }
        };
      });
    } catch (error) {
      console.warn('[Storage] Error loading from IndexedDB:', error);
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
