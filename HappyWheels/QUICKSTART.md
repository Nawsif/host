# Quick start

1. Run `./webgl-build/build.sh` from the project, or run `build.sh` from its folder.
2. Upload the contents of `dist/` to GitHub Pages or another static HTTP host.
3. Open the hosted `index.html`.
4. For offline play, select **LEVEL EDITOR**, create or load an XML level, then
   choose **editor menu → Test Level**. Press **T** to end the test run.

Use the editor's **Save Level / Load Level** buttons for local XML files.
All 141 featured records and Car Thief are bundled. Browse lists captured
community entries whose records are locally available. Download more with
`python3 webgl-build/tools/download-levels.py --catalog community`, then rebuild.
Search, Steam, accounts, and online uploads remain unavailable.

For a terminal preview of the completed package:

```sh
python3 webgl-build/server.py
```

Then visit `http://localhost:8000`. Do not open the game through `file://`.

If port 8000 is busy, add `--port 8001` and open `http://localhost:8001`.

The preview server automatically fetches missing level IDs from the original
server and saves their metadata and binary records locally. Restart the preview
server after updating server.py. Internet access and original-server availability
are required for a missing level; cached levels stay local. Rebuild to include
newly fetched entries in the Browse catalog and static deployment.
This fallback requires this Python server; static GitHub Pages alone cannot run it.

Level-name and author searches use local matches first. Searches with no local
matches query the original server through this preview server, including later
result pages. Search responses are cached for five minutes; returned metadata is
saved locally. Selecting a remote level uses the missing-record download fallback.
