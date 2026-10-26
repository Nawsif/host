(() => {
  const T_NULL = 0, T_BOOL = 1, T_NUMBER = 2, T_STRING = 3, T_BYTES = 4, T_ARRAY = 5;
  const utf8 = new TextDecoder();
  const enc = new TextEncoder();

  async function loadNative(createModule, wasmUrl) {
    let mod = await createModule({ locateFile: () => wasmUrl, print: () => {}, printErr: () => {} });
    const debug = /[?&]debug/.test(location.search);
    let idle = 0;
    const table = mod._pe_run() >>> 0;
    const base = mod._bh_mem() >>> 0;
    const mem = () => mod.HEAPU8;
    const view = () => new DataView(mod.HEAPU8.buffer, base);
    const u32 = a => view().getUint32(a, true);
    const u64 = a => Number(view().getBigUint64(a, true));
    const alloc = n => mod._bh_call(u64(table + 16), n, 0, 0, 0) >>> 0;
    const release = p => { if (p) mod._bh_call(u64(table + 24), p, 0, 0, 0); };

    const fns = {};
    let nativeCalls = 0;
    const list = u64(table + 8);
    for (let i = 0, n = u32(table); i < n; i++) {
      const entry = list + i * 24;
      let p = u64(entry), s = p;
      while (mem()[base + p]) p++;
      fns[utf8.decode(mem().subarray(base + s, base + p))] = [u64(entry + 16), u64(entry + 8)];
    }

    function toGuest(value, owned) {
      const o = alloc(24);
      owned.push(o);
      const v = view();
      if (value === null || value === undefined) {
        v.setUint32(o, T_NULL, true);
      } else if (typeof value === 'boolean') {
        v.setUint32(o, T_BOOL, true);
        v.setFloat64(o + 8, value ? 1 : 0, true);
      } else if (typeof value === 'number') {
        v.setUint32(o, T_NUMBER, true);
        v.setFloat64(o + 8, value, true);
      } else if (value instanceof Uint8Array || typeof value === 'string') {
        const bytes = typeof value === 'string' ? enc.encode(value) : value;
        const data = alloc(bytes.length + 1);
        owned.push(data);
        mem().set(bytes, base + data);
        const w = view();
        w.setUint32(o, typeof value === 'string' ? T_STRING : T_BYTES, true);
        w.setUint32(o + 4, bytes.length, true);
        w.setBigUint64(o + 16, BigInt(data), true);
      } else if (Array.isArray(value)) {
        const items = value.map(x => toGuest(x, owned));
        const data = alloc(items.length * 8);
        owned.push(data);
        const w = view();
        items.forEach((p, i) => w.setBigUint64(data + i * 8, BigInt(p), true));
        w.setUint32(o, T_ARRAY, true);
        w.setUint32(o + 4, items.length, true);
        w.setBigUint64(o + 16, BigInt(data), true);
      }
      return o;
    }

    function fromGuest(o) {
      if (!o) return null;
      const v = view();
      const type = v.getUint32(o, true), len = v.getUint32(o + 4, true);
      const num = v.getFloat64(o + 8, true), data = Number(v.getBigUint64(o + 16, true));
      switch (type) {
        case T_BOOL: return num !== 0;
        case T_NUMBER: return num;
        case T_STRING: return utf8.decode(mem().subarray(base + data, base + data + len));
        case T_BYTES: return mem().slice(base + data, base + data + len);
        case T_ARRAY: return Array.from({ length: len }, (_, i) => fromGuest(u64(data + i * 8)));
        default: return null;
      }
    }

    const PACKS = 4;
    let packs = 0;
    const drop = () => { mod = null; };

    function call(name, args) {
      const fn = fns[name];
      if (!fn) return null;
      if (!mod) {
        console.error('[native] ' + name + ' called after the module was released');
        return null;
      }
      clearTimeout(idle);
      if (/SetData$/.test(name)) packs++;
      if (packs >= PACKS) idle = setTimeout(drop, 30000);
      const owned = [];
      const argv = alloc(Math.max(1, args.length) * 8);
      owned.push(argv);
      const ptrs = args.map(a => toGuest(a, owned));
      const w = view();
      ptrs.forEach((p, i) => w.setBigUint64(argv + i * 8, BigInt(p), true));
      const result = mod._bh_call(fn[0], 1, fn[1], args.length, argv) >>> 0;
      const value = fromGuest(result);
      for (const p of owned) release(p);
      if (result) {
        const t = view().getUint32(result, true);
        if (t === T_STRING || t === T_BYTES) release(Number(view().getBigUint64(result + 16, true)));
        release(result);
      }
      if (typeof value === 'string' && globalThis.onGameData) globalThis.onGameData(value);
      nativeCalls += 1;
      if (debug && (nativeCalls <= 40 || nativeCalls % 50 === 0)) {
        const sizes = args.map(a => (a && a.byteLength !== undefined) ? a.byteLength : (typeof a === 'string' ? a.length : 0));
        const rs = (value && value.length !== undefined) ? value.length : 0;
        console.log('[native] #' + nativeCalls, name, 'args=' + sizes.join(','), 'res=' + rs, 'mem=' + Math.round(mod.HEAPU8.buffer.byteLength / (1 << 20)) + 'MB');
      }
      return value;
    }

    return { call, names: Object.keys(fns) };
  }

  globalThis.loadNative = loadNative;
})();
