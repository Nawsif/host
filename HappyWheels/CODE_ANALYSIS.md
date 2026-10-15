# Source analysis and browser-port changes

## Evidence

This is an Electron application with a JavaScript/PixiJS renderer, not a Unity
project. There are no Unity scenes, materials, C# assemblies, or Unity project
settings to repair. The executable is not used by this port.

`resources/app.asar` contains `electron/out/main.js` and `electron/out/preload.js`.
The main process serves `resources/webroot` under a synthetic
`https://totaljerkface.com/__hw_app__/` address. Its generated HTML creates
`og-game-holder`, assigns `HW_SETTINGS.siteURL`, and loads dependencies.js before
index.js. The preload script exposes the `hwNative` methods listed in API.md.

`resources/webroot/js/dependencies.js` contains a webpack dependency chunk,
PixiJS renderer setup, Howler audio, GSAP animation, Sentry, browser compatibility
libraries, and the boot module. Its boot sequence starts auth/stat services,
loads local fonts, checks WebGL support, creates the app, attaches its canvas to
`og-game-holder`, and registers resize handling. Asset paths are relative to the
page and retain the `assets-99tnk64n1mubaoc8w` directory name.

`index.js` has a packed Function-constructor wrapper. The build script evaluates
only that unpacking layer in a VM context and captures the next Function body
without executing the renderer. The resulting renderer still contains its own
string-table obfuscation, webpack modules, original game logic, Box2D-style
physics classes, screen transitions, editor, and character controllers. This is
not a full source recovery or a claim that every code path has been audited.

## Confirmed portability blockers

An additional gameplay-session hostname check was found after a reported slowdown
and renderer crash. On localhost it schedules 15 delayed timer chains whose
callbacks exponentially concatenate strings and recursively register more
intervals. A bounded VM check (without executing those allocation callbacks)
confirmed 15 initial timers on localhost and zero on totaljerkface.com. The build
now disables that exact counted conditional. A regression check verifies that
the patched initializer schedules zero allocation timers. Live FPS and crash
recovery after this patch still require a browser retest.

1. The packed runtime expects its desktop virtual host.
2. An obfuscator host check redirects other origins to about:blank.
3. A second hashed-origin guard deletes enumerable window globals. This caused
   missing requestAnimationFrame and HW_SETTINGS during a browser test.
4. A session-entry hostname expression suppresses startup on other hosts.
5. An editor hostname predicate prevents canvas creation on other origins, causing
   a scaleX exception in its scroller constructor.
6. Electron's preload bridge is absent in a normal browser.
7. The earlier build copied assets into an extra directory that broke relative paths.
8. The community/featured level catalog and records are remote server data.

## Applied changes

The build preserves original resources and applies exact, counted replacements
only to the output renderer. It disables the host redirect, hashed-origin guard,
destructive cleanup, session hostname condition, and editor hostname predicate.
It restores console output and enables the editor's existing testing/file mode,
which binds Save/Load to local XML export/import. Unexpected wrapper formats or
missing patch sites fail the build instead of silently producing a partial patch.
The output dependency bundle has an empty Sentry host configuration.

The browser adapter implements local state, actual cursor coordinates, fullscreen
callbacks, and IndexedDB level transactions. Mutations resolve only after the
transaction commits. Download listings omit binary records. addStat returns the
resulting integer, matching the native main-process implementation.

The HTML loading overlay is dismissed by the actual native `loaded()` signal,
not a timer. It reports startup errors, keeps relative paths, and blocks external
connections. The offline transport serves captured featured catalogs and records, and returns
`failure:offline` for absent server
endpoints instead of allowing HTML error pages into the game's XML parser.

## Validation and limits

Observed in-browser: main menu/graphics, complete menu animation, editor startup,
shape placement, and a physics test with the original wheelchair character.
Local XML save/load bindings were inspected in recovered source; automated export
completion was blocked by a browser download confirmation. All characters, replay
formats, long play sessions, browser persistence, fullscreen, and alternate browsers
have not received comprehensive end-to-end coverage.

The supplied HAR recovered two original binary records and a 141-entry featured
catalog. Static response routing now serves those two records locally. Gameplay
compatibility of the captured records remains unverified. No Steam or remote account service is
emulated. No claim is made that online features work offline. The previous report's
unsupported “tested Chrome/Firefox/Safari” and “all gameplay working” assertions
have been removed.

## Latest HAR import

All 141 featured records are now stored. A later HAR added Car Thief (638095)
and 1,837 unique community listings. Browse routing serves captured sorted
catalogs filtered to available records. Individual metadata requests are local.
Search and uncaptured pagination are unavailable. Runtime gameplay of the
captured records still requires browser verification.

## Local favorites and menu workload

The adapter handles get_favorites/set_favorite/delete_favorite on user.hw and
get_fav_by_user for the synthetic local user. IDs persist in origin-local browser
storage. Browse response batches contain 100 records; the original browser
pageLength is patched from 50 to 20 with an exact counted replacement. Numeric
metadata and sorted catalogs are cached with bounded per-catalog cache entries.
Tests cover add/remove, persistence, invalid IDs, storage errors, routing and
pagination. Live menu smoothness remains to be measured.
