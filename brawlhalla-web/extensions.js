(() => {
  function register(id, methods) {
    ruffleAir.putExtension(id, (name, args) => {
      const key = name.indexOf(id + '_') === 0 ? name.slice(id.length + 1) : name;
      const fn = methods[key];
      return fn ? fn(args) : null;
    });
  }

  globalThis.registerNative = (id, native) => {
    ruffleAir.putExtension(id, (name, args) => {
      try {
        return native.call(name, args);
      } catch (e) {
        console.error(id, name, e);
        return null;
      }
    });
  };

  register('DesktopExtension', {
    GetCommandLine: () => 'Brawlhalla.exe -forceoffline',
  });

  register('WindowsExtensionWrapper', {
    as_getRefreshRate: () => 60,
  });

  let steamCalls = 0;
  const steamOffline = {
    Init: () => true,
    GetLanguage: () => 'english',
    GetPersonaName: () => 'Player',
    GetPersonaID: () => '1',
    GetSteamID: () => '0',
    GetOrderID: () => '0',
    GetSteamOrder: () => [],
    IsSteamDeck: () => false,
    IsSteamInBigPicture: () => false,
    IsOverlayEnabled: () => false,
    IsSubscribedApp: () => true,
    BIsDLCInstalled: () => false,
    GetAchievement: () => false,
    RestartAppIfNecessary: () => false,
    ShowGamepadTextInput: () => false,
    GetEnteredGamepadTextInput: () => '',
    DevClearAchievements: () => false,
    RequestStats: () => true,
    StoreStats: () => true,
    SetAchievement: () => true,
    ActivateGameOverlay: () => {},
    SetRichPresence: () => true,
    ClearRichPresence: () => {},
    GetAuthSessionTicket: () => null,
    GetEncryptedAppTicket: () => null,
    GetFriendCount: () => 0,
    GetFriendByIndex: () => '0',
    GetFriendPersonaName: () => '',
    GetSmallFriendAvatar: () => null,
    GetFriendGamePlayed: () => false,

    RunCallbacks: () => {
      steamCalls += 1;
      if (steamCalls !== 2) return null;
      return {
        result: null,
        dispatch: [
          ['1', '3'],
        ],
      };
    },
  };
  register('SteamAir', steamOffline);

  const TABLES = ['GameModeTypes', 'ScoringTypes', 'LevelSetTypes', 'LevelTypes', 'ItemSpawnRuleSetTypes',
    'RegionTypes', 'HeroTypes', 'storeTypes'];
  function shareGameData(version) {
    const found = {};
    globalThis.onGameData = text => {
      const name = (/^\s*<(\w+)/.exec(text) || /^(\w+)\r?\n/.exec(text) || [])[1];
      if (!TABLES.includes(name) || found[name]) return;
      found[name] = text;
      if (Object.keys(found).length < TABLES.length) return;
      globalThis.onGameData = null;
      fetch('gamedata?version=' + encodeURIComponent(version), { method: 'POST', body: JSON.stringify(found) })
        .catch(() => {});
    };
  }

  globalThis.useOwnServers = (args, name, servers) => {
    if (servers && servers.needsData) shareGameData(servers.version);
    const stored = key => {
      try {
        return sessionStorage.getItem(key) || localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    };
    const keep = (key, value, store) => {
      try {
        store.setItem(key, value);
      } catch (e) {

      }
      return value;
    };
    const id = stored('bh.id') || keep('bh.id', String(Math.floor(Math.random() * 2 ** 31) + 1), sessionStorage);
    const persona = name || stored('bh.name') || keep('bh.name', 'Player' + (Math.floor(Math.random() * 9000) + 1000), localStorage);
    const marker = Array.from(new TextEncoder().encode('bh-web:' + id));
    let calls = 0;
    register('SteamAir', {
      ...steamOffline,
      GetPersonaName: () => persona,
      GetPersonaID: () => id,
      GetSteamID: () => id,
      GetEncryptedAppTicket: () => ({ vector: 'int', items: [...marker, marker.length] }),
      RunCallbacks: () => (++calls === 2 ? { result: null, dispatch: [['1', '1']] } : null),
    });
    register('DesktopExtension', {
      GetCommandLine: () => ['Brawlhalla.exe', ...args].join(' '),
    });
  };
})();
