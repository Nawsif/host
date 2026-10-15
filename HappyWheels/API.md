# Native bridge and browser adapter

The source contract is `electron/out/preload.js` inside `resources/app.asar`.
Return values were cross-checked against main.js, rather than inferred from names.
All Promise methods below remain asynchronous in the browser adapter.

| API | Browser behavior |
| --- | --- |
| `steam.call(name, ...args)` | Dispatches the local methods below; unknown names reject. |
| `presence.setState(state)` | No-op. |
| `cursorPos()` | Resolves `{x,y}` from the latest pointer position in viewport CSS pixels. |
| `exit()` | No-op; a normal tab cannot reliably close itself. |
| `loaded()` | Emits `hw-ready` once to dismiss the loading screen. |
| `deepLink.pending()` | Resolves null. |
| `deepLink.onOpen(callback)` | No-op. |
| `overlay.onActivated(callback)` | No-op. |
| `fullscreen.set(enabled)` | Requests/exits browser fullscreen; rejected requests are caught. |
| `fullscreen.get()` | Returns actual browser fullscreen state. |
| `fullscreen.onChange(callback)` | Calls back with a boolean on fullscreenchange. |
| `auth.login(email,password)` | Resolves `{outcome:'error'}`; no credentials are sent. |
| `auth.getUser()` | Resolves a synthetic local Player user and `offline:true`. |
| `auth.logout()` | No-op for the fixed local identity. |
| `auth.steamLogin(autoAttempt)` | Resolves `{outcome:'unavailable'}`. |
| `auth.linkSteam()` | Resolves `'not_logged_in'`. |
| `friends.online()` / `friends.names()` | Resolve empty arrays. |
| `friends.findByTjfName(name)` | Resolves null. |
| `friends.onChanged(callback)` / `friends.onNamesChanged(callback)` | No-op. |
| `downloads.list()` | Resolves metadata sorted newest first; excludes binary `record`. |
| `downloads.save(id,metadata,bytes)` | Commits a copied Uint8Array and metadata in IndexedDB. |
| `downloads.load(id)` | Resolves Uint8Array; rejects for a missing level. |
| `downloads.delete(id)` | Resolves after the IndexedDB transaction commits. |

## steam.call methods

| Method | Result |
| --- | --- |
| `getPlayerName` | `'Player'` |
| `getSteamId` | `{steamId64:'0',steamId32:0,accountId:0}`; a placeholder, not a real Steam ID |
| `getAvatar` | null |
| `openUserProfile`, `openUserChat` | No-op |
| `unlockAchievement(name)` | Stores a local flag, returns true |
| `isAchievementUnlocked(name)` | Returns local flag |
| `getStat(name)` | Integer, default 0 |
| `setStat(name,value)` | Boolean; rejects non-safe-integer values with false, clamps to signed 32-bit |
| `addStat(name,amount)` | New clamped integer, or null for invalid amount |
| `storeStats` | true; local writes are immediate |
| `readProgress` | Stored progress string or null |
| `writeProgress(string)` | Boolean; requires a nonempty string |

## Storage

The adapter retains the earlier `HappyWheelsDB` version 1 database with a
`downloads` object store keyed by id. Records add authoritative `id`, `bytes`,
`downloadedAt`, and binary `record` fields. IDs must be positive integers up to
999999999; record data must be a nonempty Uint8Array no larger than 32 MiB.
IndexedDB errors reject. The database-open Promise is shared and reset on failure.

localStorage keys are `stat_<name>`, `cloud_achievement_progress.json`, and
`hw_achievement_<name>`. Options and editor autosave use the game's own storage
implementation, separate from this adapter. Browser-origin changes produce
separate save stores. Deleting site data removes saves. The adapter falls back
to in-memory values if localStorage is denied; these do not survive reload.
