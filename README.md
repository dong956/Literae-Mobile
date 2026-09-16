# Literae Mobile

Literae Mobile is a lightweight, read-only companion for Literae. The first
prototype is an installable offline web app that imports a ZIP package created
by the desktop application and supports local text search.

## Run the prototype

From the `web` directory, start any static HTTP server, for example:

```bash
python3 -m http.server 8765
```

Then open `http://localhost:8765`. On iPhone or iPad, serve the directory over
HTTPS, open it in Safari, and choose **Add to Home Screen**.

## Current scope

- Import `Literae-Mobile-*.zip`
- Keep imported content in browser-local IndexedDB
- Search OCR text without a server
- Show document metadata, page number, highlighted context, and full page text
- Keep the previously imported library active if a new import fails

The prototype deliberately excludes PDF rendering, OCR, real-page mapping,
citations, library chat, API settings, and cloud synchronization.

## Next implementation step

The package format is platform-neutral. A production iOS/Android application
can replace the web storage and search layers with SQLite while retaining the
same ZIP files and user workflow. See `docs/package-format.md` and
`docs/roadmap.md`.
