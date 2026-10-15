# Happy Wheels browser build

This packages the supplied PixiJS game for a static HTTP host without Electron,
Steam DLLs, Steam login, or an external API connection. Original source resources
are left intact. Upload **the contents of `dist/`** to your static host.

## Verified

The original main menu and animated graphics render in the browser. The level
editor opens, creates shapes, and runs an editor test using the original character
and physics engine. Browser checks were performed in the Codex in-app browser on
2026-10-14. This is not a complete playthrough or an all-browser certification.

## Offline play

Choose **LEVEL EDITOR**, create a level, and choose **editor menu → Test Level**.
Press **T** to return to editing. Editor **Save Level** and **Load Level** are wired
to the game's existing XML file export/import mode. A native browser download
confirmation prevented automated verification of the export completion.

The featured catalog contains **141 locally stored levels**. A second HAR also
supplied **Car Thief** (638095), plus **1,837 unique community listings** from the
first pages of newest, most played, highest rated, and oldest sorts. Captured
community listings are filtered to records available locally in Browse Levels.
The binary records and metadata are served from static files without Steam or a
live game server. Gameplay compatibility of these records remains unverified.

Download records for the captured community listings from the project folder:

```sh
python3 webgl-build/tools/download-levels.py --catalog community
./webgl-build/build.sh
```

The downloader skips completed files and stops on access errors or rate limits.
It uses trusted TLS certificates via certifi when installed, without login cookies
or credentials. These captured pages are not a complete community database.
Browse sorts the union of all locally stored catalog entries by newest, oldest,
plays, or rating. Catalog responses contain 100 entries per batch; the Browse
menu renders 20 rows per visible page. Sorted results and parsed numeric metadata
are cached for page changes. Upload filters use today, the past
7 days, the past 30 days, or anytime, based on the browser calendar date.
Favorites can be added, removed, and listed locally using browser storage. They
belong to the hosting origin and do not synchronize with the original site.
Search, ratings submission, uploads, accounts, and cloud synchronization remain
unavailable.

Import another HAR with
`python3 webgl-build/tools/import-har.py path/to/capture.har`, then rebuild.
Compatible local XML files can also be loaded through the editor.

## Build again

Requires Node.js and Python 3, with no npm dependencies:

```sh
./webgl-build/build.sh
```

The command works from any current directory and writes to `dist/` beside
`webgl-build/`. For a local preview, serve `dist/` using your usual HTTP server;
opening `index.html` as `file://` does not support the asset-loading workflow.
GitHub Pages works with a project subdirectory because assets use relative paths.
No server is installed or left running as part of the build.

## Storage and privacy

Options/editor autosave use the game's original browser storage. The adapter
stores statistics and achievement progress in localStorage and downloaded records
in IndexedDB. Storage belongs to the browser origin and can be cleared by the
browser. If localStorage is unavailable, adapter statistics use session memory.
IndexedDB failures are reported instead of pretending a level was saved.

A synthetic local `Player` identity enables editing; it is not an authenticated
Totaljerkface or Steam account. The adapter never sends credentials. The copied
Sentry configuration is disabled, the page blocks external network connections,
and native bridge operations stay local. Existing outbound profile/help links may
still open when explicitly clicked.

## Files

- `tools/build.cjs`: copies assets, unwraps the renderer, and applies narrow patches.
- `hwNative-polyfill.js`: local replacement for the original preload API.
- `offline-api.js`: converts requests for absent server APIs into static failure responses.
- `API.md`: adapter contract and original bridge surface.
- `CODE_ANALYSIS.md`: source-grounded architecture and patch details.
- `QUICKSTART.md`: hosting and offline play instructions.

Copyright in the original game and bundled assets remains with its owners.
Original JavaScript license notices are preserved in `dist/js/`.
