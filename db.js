const DB_NAME = 'pool-master-db';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_PLAYERS = 'players';

function openDB() {
  return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
      console.warn('IndexedDB not available, using fallback mode');
      reject(new Error('IndexedDB not supported'));
      return;
    }
    
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PLAYERS)) {
        db.createObjectStore(STORE_PLAYERS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function doTransaction(storeName, mode, callback) {
  return openDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = callback(store);

      tx.oncomplete = () => {
        db.close();
        resolve(result._result ?? result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };

      // Handle IDBRequest result
      if (result instanceof IDBRequest) {
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      }
    });
  });
}

// --- Sessions ---

export async function saveSession(sessionData) {
  const record = {
    ...sessionData,
    updatedAt: new Date().toISOString(),
  };
  return doTransaction(STORE_SESSIONS, 'readwrite', (store) => {
    return store.put(record);
  });
}

export async function getAllSessions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SESSIONS, 'readonly');
    const store = tx.objectStore(STORE_SESSIONS);
    const request = store.getAll();
    request.onsuccess = () => {
      db.close();
      // Sort by updatedAt descending
      const sessions = request.result.sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
      );
      resolve(sessions);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function getSession(id) {
  return doTransaction(STORE_SESSIONS, 'readonly', (store) => {
    return store.get(id);
  });
}

export async function deleteSession(id) {
  return doTransaction(STORE_SESSIONS, 'readwrite', (store) => {
    return store.delete(id);
  });
}

// --- Players (global list) ---

export async function saveAllPlayers(players) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLAYERS, 'readwrite');
    const store = tx.objectStore(STORE_PLAYERS);
    store.clear();
    players.forEach(p => store.put(p));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getAllPlayers() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PLAYERS, 'readonly');
    const store = tx.objectStore(STORE_PLAYERS);
    const request = store.getAll();
    request.onsuccess = () => { db.close(); resolve(request.result); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
