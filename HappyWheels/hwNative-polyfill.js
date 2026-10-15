/* Browser adapter for the API exposed by electron/out/preload.js. */
(() => {
  'use strict';
  const noop = () => {};
  const memory = new Map();
  const read = key => { try { return localStorage.getItem(key); } catch { return memory.get(key) ?? null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch { memory.set(key, value); } return true; };
  const clamp = n => Math.min(2147483647, Math.max(-2147483648, n));
  let position = { x: 0, y: 0 }, dbPromise;
  window.addEventListener('pointermove', e => { position = { x: e.clientX, y: e.clientY }; }, { passive: true });
  function database() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('HappyWheelsDB', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [name, keyPath] of [['downloads', 'id'], ['progress', 'key'], ['userData', 'key']]) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
        }
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Close other game tabs to open local level storage.'));
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); dbPromise = null; };
        resolve(request.result);
      };
    }).catch(e => { dbPromise = null; throw e; });
    return dbPromise;
  }
  async function transaction(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('downloads', mode);
      const request = operation(tx.objectStore('downloads'));
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error || request.error || new Error('Local storage operation failed.'));
    });
  }
  function levelId(id) {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n <= 0 || n > 999999999) throw new Error('Invalid level ID');
    return n;
  }
  const steam = {
    getPlayerName: () => window.hwBrowser?.getUsername() || 'Player',
    getSteamId: () => ({ steamId64: '0', steamId32: 0, accountId: 0 }),
    getAvatar: () => null,
    openUserProfile: noop,
    openUserChat: noop,
    unlockAchievement: name => write('hw_achievement_' + name, '1'),
    isAchievementUnlocked: name => read('hw_achievement_' + name) === '1',
    getStat: name => { const n = Number(read('stat_' + name) ?? 0); return Number.isSafeInteger(n) ? n : 0; },
    setStat: (name, value) => Number.isSafeInteger(value) && write('stat_' + name, String(clamp(value))),
    addStat: (name, amount) => {
      if (!Number.isSafeInteger(amount)) return null;
      const next = clamp(steam.getStat(name) + amount);
      return steam.setStat(name, next) ? next : null;
    },
    storeStats: () => true,
    readProgress: () => read('cloud_achievement_progress.json'),
    writeProgress: value => typeof value === 'string' && value.length > 0 && write('cloud_achievement_progress.json', value)
  };
  let ready = false;
  window.hwNative = {
    steam: { call: async (method, ...args) => {
      if (!Object.hasOwn(steam, method)) throw new Error('Unknown native method: ' + method);
      return steam[method](...args);
    } },
    presence: { setState: noop },
    cursorPos: async () => ({ ...position }),
    exit: noop,
    loaded: () => { if (!ready) { ready = true; window.dispatchEvent(new Event('hw-ready')); } },
    deepLink: { pending: async () => null, onOpen: noop },
    overlay: { onActivated: noop },
    fullscreen: {
      set: enabled => {
        try {
          const result = enabled ? document.documentElement.requestFullscreen?.() : document.fullscreenElement ? document.exitFullscreen?.() : undefined;
          result?.catch(noop);
        } catch {}
      },
      get: () => Boolean(document.fullscreenElement),
      onChange: callback => document.addEventListener('fullscreenchange', () => callback(Boolean(document.fullscreenElement)))
    },
    auth: {
      login: async () => ({ outcome: 'error' }),
      getUser: async () => ({ user: {userId:1,username:window.hwBrowser?.getUsername() || 'Player',steamId:null}, offline: true }),
      logout: async () => {},
      steamLogin: async () => ({ outcome: 'unavailable' }),
      linkSteam: async () => 'not_logged_in'
    },
    friends: { online: async () => [], onChanged: noop, findByTjfName: async () => null, names: async () => [], onNamesChanged: noop },
    downloads: {
      list: async () => (await transaction('readonly', s => s.getAll())).map(({ record, ...meta }) => meta).sort((a, b) => b.downloadedAt - a.downloadedAt || b.id - a.id),
      save: async (id, metadata, record) => {
        id = levelId(id);
        if (!(record instanceof Uint8Array) || !record.byteLength || record.byteLength > 33554432) throw new Error('Invalid level record (maximum 32 MiB).');
        await transaction('readwrite', s => s.put({ ...metadata, id, record: record.slice(), bytes: record.byteLength, downloadedAt: Date.now() }));
      },
      load: async id => {
        const row = await transaction('readonly', s => s.get(levelId(id)));
        if (!row) throw new Error('Saved level not found.');
        return new Uint8Array(row.record);
      },
      delete: async id => { await transaction('readwrite', s => s.delete(levelId(id))); }
    }
  };
})();
