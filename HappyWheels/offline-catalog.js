// The offline browser sorts and filters the complete locally available catalog.
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const metadata = new WeakMap(), catalogCache = new WeakMap();
  const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
  const details = level => {
    if (!metadata.has(level)) metadata.set(level, {date:Date.parse((level.attrs.dp || '')+'T00:00:00Z')||0, id:Number(level.attrs.id)||0, plays:Number(level.attrs.ps)||0, rating:Number(level.attrs.rg)||0, name:normalize(level.attrs.ln),author:normalize(level.attrs.un)});
    return metadata.get(level);
  };
  function select(levels, params, now = new Date()) {
    const sort = params.get('sortby') || 'plays', uploaded = params.get('uploaded') || 'anytime';
    const action=params.get('action'),term=normalize(params.get('sterm'));
    const searchField=action==='search_by_name'?'name':action==='search_by_user'?'author':null;
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = {today:0, week:7, month:30}[uploaded];
    const cutoff = days === undefined ? -Infinity : today - days * 86400000;
    let cache=catalogCache.get(levels);
    if (!cache) {cache=new Map();catalogCache.set(levels,cache);}
    const key=JSON.stringify([sort,uploaded,today,searchField,term]);
    let rows=cache.get(key);
    if (!rows) {
    rows = levels.filter(level => (!searchField||details(level)[searchField].includes(term)) && (days === undefined || (details(level).date >= cutoff && details(level).date <= today)));
    rows.sort((a, b) => {
      const aa=details(a),bb=details(b);
      let difference;
      if (sort === 'rating') difference = bb.rating-aa.rating;
      else if (sort === 'plays') difference = bb.plays-aa.plays;
      else if (sort === 'oldest') difference = aa.date-bb.date;
      else difference = bb.date-aa.date;
      return difference || (sort === 'oldest' ? aa.id-bb.id : bb.id-aa.id);
    });
    if(cache.size>=32)cache.clear();cache.set(key,rows);
    }
    const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));
    return {page, total:rows.length, levels:rows.slice((page-1)*100, page*100)};
  }
  function xml(levels, params, now) {
    const result = select(levels, params, now);
    const body = result.levels.map(level => '<lv ' + Object.entries(level.attrs).map(([key,value]) => key + '="' + escape(value) + '"').join(' ') + '><uc><![CDATA[' + String(level.description??'').replace(/\]\]>/g,']]]]><![CDATA[>') + ']]></uc></lv>').join('');
    return '<?xml version="1.0" encoding="UTF-8"?><lvs pg="' + result.page + '" pp="100">' + body + '</lvs>';
  }
  const favoriteKey='hw.offline.favorites.v1';
  function favoriteIds() {
    const value=JSON.parse(localStorage.getItem(favoriteKey)||'[]');
    return new Set(Array.isArray(value)?value.map(String).filter(id=>/^\d+$/.test(id)):[]);
  }
  function favoriteResponse(levels,params) {
    const action=params.get('action');
    try {
      const ids=favoriteIds();
      if(action==='set_favorite'||action==='delete_favorite') {
        const id=params.get('level_id');
        if(!/^\d+$/.test(id||'')||!levels.some(level=>level.attrs.id===id))return 'failure:bad_param';
        if(action==='set_favorite')ids.add(id);else ids.delete(id);
        localStorage.setItem(favoriteKey,JSON.stringify([...ids]));
        return 'success';
      }
      const own=action!=='get_fav_by_user'||String(params.get('user_id'))==='1';
      const favorites=own?levels.filter(level=>ids.has(level.attrs.id)):[];
      // The native list uses all returned IDs to mark existing favorites.
      return xml(favorites,new URLSearchParams({sortby:'newest',page:params.get('page')||'1'}));
    } catch {return 'failure:app_error';}
  }
  globalThis.HWOfflineCatalog = {select, xml, favoriteResponse};
})();
