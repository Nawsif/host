// Replay captured level responses locally; unavailable APIs return protocol failures.
(() => {
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  const pending = new WeakMap();
  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    pending.delete(this);
    const target = new URL(url, document.baseURI);
    const base=new URL('./',document.baseURI);
    if (target.origin === base.origin && target.pathname.startsWith(base.pathname) && /\/(?:get_level|set_level|user|steam|replay)\.hw$/.test(target.pathname)) {
      pending.set(this, {path:target.pathname, args, query:target.search});
      return open.call(this, 'GET', new URL('./offline/unavailable.txt', document.baseURI).href, ...args);
    }
    return open.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const request = pending.get(this);
    if (!request) return send.call(this, body);
    pending.delete(this);
    const params = body instanceof FormData ? body : new URLSearchParams(typeof body === 'string' ? body : request.query);
    let file = './offline/unavailable.txt';
    let blobURL;
    const action=params.get('action'),levels=globalThis.HW_OFFLINE_LEVELS||[];
    const backend=globalThis.HW_BACKEND_URL?.replace(/\/$/,'');
    const stored=id=>levels.some(level=>level.attrs.id===id);
    if (['get_favorites','get_fav_by_user','set_favorite','delete_favorite'].includes(action) && /\/(?:user|get_level)\.hw$/.test(request.path)) {
      const result=HWOfflineCatalog.favoriteResponse(levels,params);
      blobURL=URL.createObjectURL(new Blob([result],{type:result.startsWith('<?xml')?'text/xml;charset=utf-8':'text/plain;charset=utf-8'}));
      file=blobURL;
    }
    if (request.path.endsWith('/get_level.hw')) {
      if (params.get('action') === 'get_featured') file = './offline/featured.xml';
      if (params.get('action') === 'get_record' && /^\d+$/.test(params.get('level_id') || '')) file = './offline/levels/' + params.get('level_id') + '.bin';
      if (params.get('action') === 'get_level' && /^\d+$/.test(params.get('level_id') || '')) file = './offline/details/' + params.get('level_id') + '.xml';
      if(backend&&/^\d+$/.test(params.get('level_id')||'')&&!stored(params.get('level_id'))) {
        if(action==='get_record')file=backend+'/level/'+params.get('level_id');
        if(action==='get_level')file=backend+'/level/'+params.get('level_id')+'/details';
      }
      if (['get_all','search_by_name','search_by_user'].includes(action)) {
        if (action!=='get_all' && HWOfflineCatalog.select(levels,params).total===0) {
          const query=new URLSearchParams();
          for(const key of ['action','sterm','page','sortby','uploaded'])if(params.get(key)!==null)query.set(key,params.get(key));
          file=(backend?backend+'/search':'./offline/search.hw')+'?'+query.toString();
        } else {
          const xml = HWOfflineCatalog.xml(levels, params);
          blobURL = URL.createObjectURL(new Blob([xml], {type:'text/xml;charset=utf-8'}));
          file = blobURL;
        }
      }
    }
    const responseType = this.responseType, timeout = this.timeout, withCredentials = this.withCredentials;
    open.call(this, 'GET', new URL(file, document.baseURI).href, ...request.args);
    this.responseType = responseType;
    this.timeout = timeout;
    this.withCredentials = new URL(file,document.baseURI).origin!==location.origin?false:withCredentials;
    if (blobURL) this.addEventListener('loadend', () => URL.revokeObjectURL(blobURL), {once:true});
    return send.call(this, null);
  };
})();
