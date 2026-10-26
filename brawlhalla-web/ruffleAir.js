(function () {
  'use strict';

  const LIMIT = 128 << 20;

  let base = 'game/';
  let extensions = {};
  let argv = [];
  let log = () => {};

  const files = new Map();
  const dirs = new Set();
  const mem = new Map();
  const hot = new Map();
  const packed = new Map();
  let hotBytes = 0;
  let packBytes = 0;
  let packResident = 0;
  let misses = 0;
  const trace = [];
  const utf8 = new TextDecoder();
  const extSeen = new Map();

  let db = null;
  const pending = new Set();
  let timer = 0;

  const dirname = p => { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); };

  function markDirs(p) {
    for (let d = dirname(p); ; d = dirname(d)) {
      dirs.add(d);
      if (d === '/') break;
    }
  }

  function clean(p) {
    if (!p) return '/';
    p = String(p).replace(/\\/g, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
  }

  function children(p) {
    const prefix = p === '/' ? '/' : p + '/';
    const out = new Set();
    for (const key of files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf('/');
        out.add(slash < 0 ? rest : rest.slice(0, slash));
      }
    }
    for (const key of mem.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf('/');
        out.add(slash < 0 ? rest : rest.slice(0, slash));
      }
    }
    return Array.from(out);
  }

  function put(path, bytes) {
    if (hot.has(path)) hotBytes -= hot.get(path).length;
    hot.set(path, bytes);
    hotBytes += bytes.length;
    while (hotBytes > LIMIT) {
      const oldest = hot.keys().next().value;
      if (oldest === undefined || oldest === path) break;
      hotBytes -= hot.get(oldest).length;
      hot.delete(oldest);
    }
  }

  function fetchSync(url) {
    misses++;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.overrideMimeType('text/plain; charset=x-user-defined');
      xhr.send();
      if (xhr.status < 200 || xhr.status >= 300) return null;
      const text = xhr.responseText;
      const bytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
      return bytes;
    } catch (e) {
      log('read failed', url, e.message);
      return null;
    }
  }

  function flush() {
    timer = 0;
    if (!db || !pending.size) return;
    const store = db.transaction('data', 'readwrite').objectStore('data');
    for (const path of pending) {
      const bytes = mem.get(path);
      if (bytes) store.put(bytes, path);
      else store.delete(path);
    }
    pending.clear();
  }

  function queueSave(path) {
    pending.add(path);
    if (!timer) timer = setTimeout(flush, 250);
  }

  function readFile(path, memoryMB) {
    path = clean(path);
    if (trace.length < 4096) trace.push(path);
    log('read', path, Math.round(memoryMB || 0) + 'MB');
    if (packed.has(path)) {
      const entry = packed.get(path);
      let bytes;
      if (entry.parts.length === 1) {
        const part = entry.parts[0];
        bytes = part.chunk.bytes.subarray(part.offset, part.offset + part.length);
      } else {
        bytes = new Uint8Array(entry.size);
        let at = 0;
        for (const part of entry.parts) {
          bytes.set(part.chunk.bytes.subarray(part.offset, part.offset + part.length), at);
          at += part.length;
        }
      }
      packed.delete(path);
      packBytes -= entry.size;
      for (const part of entry.parts) {
        if (--part.chunk.refs === 0) {
          packResident -= part.chunk.bytes.length;
          part.chunk.bytes = null;
        }
      }
      return bytes;
    }
    if (hot.has(path)) {
      const bytes = hot.get(path);
      hot.delete(path);
      hotBytes -= bytes.length;
      return bytes;
    }
    if (mem.has(path)) return mem.get(path);
    if (!files.has(path)) return null;
    return fetchSync(base + path.slice(5));
  }

  function writeFile(path, data, append) {
    path = clean(path);
    if (path.indexOf('/app') === 0) return false;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer || data);
    if (append && mem.has(path)) {
      const prev = mem.get(path);
      const joined = new Uint8Array(prev.length + bytes.length);
      joined.set(prev);
      joined.set(bytes, prev.length);
      mem.set(path, joined);
    } else {
      mem.set(path, bytes.slice());
    }
    markDirs(path);
    queueSave(path);
    return true;
  }

  function kind(path) {
    path = clean(path);
    if (dirs.has(path)) return 2;
    if (files.has(path) || mem.has(path)) return 1;
    return 0;
  }

  function list(path) {
    return children(clean(path));
  }

  function mkdir(path) {
    path = clean(path);
    dirs.add(path);
    markDirs(path);
  }

  function remove(path) {
    path = clean(path);
    if (path.indexOf('/app') === 0) return;
    const prefix = path + '/';
    mem.delete(path);
    dirs.delete(path);
    for (const key of Array.from(mem.keys())) if (key.startsWith(prefix)) mem.delete(key);
    for (const key of Array.from(dirs)) if (key.startsWith(prefix)) dirs.delete(key);
    queueSave(path);
  }

  function hasExtension(id) {
    return Object.prototype.hasOwnProperty.call(extensions, id);
  }

  function callExtension(id, name, args) {
    const fn = extensions[id];
    if (!fn) {
      log('extension', id, name);
      return null;
    }
    if (id !== 'RawData') {
      const key = id + '.' + name;
      const seen = (extSeen.get(key) || 0) + 1;
      extSeen.set(key, seen);
      if (seen <= 2 || seen % 300 === 0) {
        let shape = '';
        try { shape = JSON.stringify(args).slice(0, 120); } catch (e) { shape = ''; }
        console.log('[ext]', key, shape, '#' + seen);
      }
    }
    try {
      const value = fn(name, args);
      return value === undefined ? null : value;
    } catch (e) {
      log('extension error', id, name, e.message);
      return null;
    }
  }

  function configure(opts) {
    if (opts.base) base = opts.base.endsWith('/') ? opts.base : opts.base + '/';
    if (opts.extensions) extensions = opts.extensions;
    if (opts.arguments) argv = opts.arguments;
    if (opts.log) log = opts.log;
    if (opts.udpRelay !== undefined) udpRelay = opts.udpRelay || '';
    return host;
  }

  async function load(manifestUrl) {
    const data = await (await fetch(manifestUrl)).json();
    const names = (Array.isArray(data) ? data : data.files).map(String);
    for (const name of names) {
      const path = '/app/' + name.replace(/^\/+/, '');
      files.set(path, 0);
      markDirs(path);
    }
    return names;
  }

  function open() {
    return new Promise(resolve => {
      const req = indexedDB.open('ruffleAir', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('data');
      req.onsuccess = () => { db = req.result; resolve(); };
      req.onerror = () => resolve();
    }).then(() => new Promise(resolve => {
      if (!db) return resolve();
      const store = db.transaction('data').objectStore('data');
      const keys = store.getAllKeys();
      const values = store.getAll();
      let waiting = 2;
      const done = () => {
        if (--waiting === 0 && keys.result && values.result) {
          for (let i = 0; i < keys.result.length; i++) {
            mem.set(keys.result[i], new Uint8Array(values.result[i]));
            markDirs(keys.result[i]);
          }
        }
        if (waiting === 0) resolve();
      };
      keys.onsuccess = values.onsuccess = done;
      keys.onerror = values.onerror = () => { waiting = 0; resolve(); };
    }));
  }

  async function loadPack(url, onProgress) {
    const readRange = async (start, end) => {
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch(url, { headers: { Range: 'bytes=' + start + '-' + end } });
          if (res.status !== 206) throw new Error('pack range ' + res.status);
          const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('Content-Range') || '');
          if (!range || Number(range[1]) !== start || Number(range[2]) !== end) throw new Error('pack range mismatch');
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.length !== end - start + 1) throw new Error('pack slice short');
          return { bytes, total: Number(range[3]) };
        } catch (e) {
          if (attempt === 5) throw e;
          await new Promise(ok => setTimeout(ok, 250 * (attempt + 1)));
        }
      }
    };
    const probe = await readRange(0, 3);
    const total = probe.total;
    if (!total || total > 700 << 20) throw new Error('invalid pack size: ' + total);
    const headerLength = new DataView(probe.bytes.buffer).getUint32(0, false);
    if (!headerLength || headerLength > 4 << 20 || headerLength + 4 > total) throw new Error('invalid pack header');
    const header = await readRange(4, 3 + headerLength);
    if (header.total !== total) throw new Error('pack changed during download');
    const entries = JSON.parse(utf8.decode(header.bytes));
    if (!Array.isArray(entries)) throw new Error('invalid pack index');
    const dataStart = 4 + headerLength;
    let span = 0;
    const names = new Set();
    for (const entry of entries) {
      if (typeof entry.n !== 'string' || entry.n.startsWith('/') || entry.n.split('/').includes('..') || names.has(entry.n) ||
          !Number.isSafeInteger(entry.o) || entry.o !== span || !Number.isSafeInteger(entry.s) || entry.s < 0) throw new Error('invalid pack entry');
      names.add(entry.n);
      span += entry.s;
    }
    if (span !== total - dataStart) throw new Error('pack index mismatch');

    const sliceSize = 8 << 20;
    const chunks = [];
    for (let start = dataStart; start < total; start += sliceSize) chunks.push({ start, bytes: null, refs: 0 });
    let next = 0;
    let done = dataStart;
    const worker = async () => {
      while (next < chunks.length) {
        const chunk = chunks[next++];
        const res = await readRange(chunk.start, Math.min(chunk.start + sliceSize, total) - 1);
        if (res.total !== total) throw new Error('pack changed during download');
        chunk.bytes = res.bytes;
        done += res.bytes.length;
        if (onProgress) onProgress(done, total);
      }
    };

    const results = await Promise.allSettled(Array.from({ length: 4 }, worker));
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    for (const entry of entries) {
      const path = '/app/' + entry.n;
      files.set(path, 0);
      markDirs(path);
      if (packed.has(path)) continue;
      const parts = [];
      let offset = entry.o;
      let left = entry.s;
      while (left) {
        const chunk = chunks[Math.floor(offset / sliceSize)];
        const inside = offset % sliceSize;
        const length = Math.min(left, chunk.bytes.length - inside);
        parts.push({ chunk, offset: inside, length });
        chunk.refs++;
        offset += length;
        left -= length;
      }
      packed.set(path, { parts, size: entry.s });
      packBytes += entry.s;
    }
    packResident += chunks.reduce((sum, chunk) => sum + (chunk.refs ? chunk.bytes.length : 0), 0);
    return entries.length;
  }

  async function warm(paths, onProgress) {    const queue = paths.slice();
    let done = 0;
    const worker = async () => {
      for (;;) {
        const name = queue.shift();
        if (!name) return;
        const path = name.indexOf('/app/') === 0 ? name : '/app/' + name.replace(/^\/+/, '');
        if (files.has(path) && !hot.has(path) && !packed.has(path)) {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const res = await fetch(base + path.slice(5));
              if (res.ok) {
                put(path, new Uint8Array(await res.arrayBuffer()));
                break;
              }
            } catch (e) {

            }
            await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
          }
        }
        done++;
        if (onProgress) onProgress(done, paths.length);
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    return done;
  }

  let udpRelay = '';
  const sockets = new Map();
  let nextSocket = 1;
  const utf8out = new TextEncoder();
  const INBOX = 2048;

  function frame(host, port, bytes) {
    const name = utf8out.encode(String(host));
    const out = new Uint8Array(3 + name.length + bytes.length);
    out[0] = name.length;
    out.set(name, 1);
    out[1 + name.length] = port >> 8;
    out[2 + name.length] = port & 255;
    out.set(bytes, 3 + name.length);
    return out;
  }

  function openSocket(port, address) {
    const id = nextSocket++;
    const entry = { state: 0, address: null, port: 0, outbox: [], inbox: [], ws: null };
    sockets.set(id, entry);
    let ws;
    try {
      ws = new WebSocket(udpRelay + '?address=' + encodeURIComponent(address || '0.0.0.0') + '&port=' + (port | 0));
    } catch (e) {
      entry.state = 2;
      return id;
    }
    ws.binaryType = 'arraybuffer';
    entry.ws = ws;
    ws.onmessage = event => {
      if (typeof event.data === 'string') {
        let info = {};
        try { info = JSON.parse(event.data); } catch (e) {  }
        if (info.error) {
          log('udp bind failed', info.error);
          entry.state = 2;
          return;
        }
        entry.address = info.address;
        entry.port = info.port;
        entry.state = 1;
        for (const message of entry.outbox) ws.send(message);
        entry.outbox.length = 0;
        return;
      }
      const data = new Uint8Array(event.data);
      if (data.length < 3 || entry.inbox.length >= INBOX * 3) return;
      const size = data[0];
      entry.inbox.push(
        data.slice(3 + size),
        utf8.decode(data.subarray(1, 1 + size)),
        (data[1 + size] << 8) | data[2 + size]);
    };
    ws.onclose = () => {
      entry.state = entry.state === 1 ? 3 : 2;
    };
    ws.onerror = () => {};
    return id;
  }

  function post(entry, message) {
    if (entry.state === 1) entry.ws.send(message);
    else if (entry.state === 0) entry.outbox.push(message);
  }

  function datagram(op, args) {
    if (op === 'supported') return !!udpRelay && typeof WebSocket === 'function';
    if (op === 'open') return udpRelay ? openSocket(args[0], args[1]) : 0;
    const entry = sockets.get(args[0]);
    if (!entry) return null;
    switch (op) {
      case 'connect':
        post(entry, JSON.stringify({ connect: [String(args[1]), args[2] | 0] }));
        return null;
      case 'send': {
        const [, bytes, offset, length, address, port] = args;
        if (!(bytes instanceof Uint8Array)) return null;
        post(entry, frame(address, port | 0, bytes.subarray(offset, offset + length)));
        return null;
      }
      case 'poll': {
        if (!entry.inbox.length) return null;
        const out = entry.inbox;
        entry.inbox = [];
        return out;
      }
      case 'info':
        return [entry.state, entry.address, entry.port];
      case 'close':
        sockets.delete(args[0]);
        if (entry.ws) try { entry.ws.close(); } catch (e) {  }
        return null;
    }
    return null;
  }

  const host = {
    configure, load, open, warm, flush, loadPack, datagram,
    readFile, writeFile, kind, list, mkdir, remove,
    hasExtension, callExtension,
    putExtension: (id, fn) => { extensions[id] = fn; },
    arguments: () => argv.slice(),
    stats: () => ({ hot: hotBytes, pack: packBytes, packResident, files: files.size, writes: mem.size, misses }),
    trace: () => trace.slice()
  };

  for (const root of ['/', '/app', '/storage', '/user', '/user/Documents', '/user/Desktop', '/cache', '/tmp']) dirs.add(root);
  addEventListener('pagehide', flush);

  globalThis.ruffleAir = host;
})();
