# Ledger Book

Offline desktop double-entry-style ledger. React UI (Vite) wrapped in a native
window by **pywebview**, data in **SQLite**. Ships as a single Windows `.exe`.

## Stack

- Frontend: React 18 + Vite, recharts, lucide-react
- Window + backend bridge: Python `pywebview`
- Storage: stdlib `sqlite3` → `ledger.db` (saved next to the `.exe`)
- Packaging: PyInstaller onefile

## Layout

```
backend/kv.py    SQLite schema + load/save (bulk replace-all)
backend/app.py   pywebview window + Api bridge (window.pywebview.api)
src/App.jsx      React ledger UI (adapted from original template)
src/api.js       persistence: pywebview bridge, localStorage fallback for browser dev
```

## Develop

Frontend (browser, no Python needed):

```sh
npm install
npm run dev        # opens http://localhost:5173, data in localStorage
```

Backend + native window (needs Python 3.9+):

```sh
pip install -r backend/requirements.txt
python backend/app.py --dev     # loads the Vite dev server
```

Without `--dev`, loads the built UI from `dist/`.

## Build the .exe

```sh
npm run build                        # bundle React → dist/
pyinstaller LedgerBook.spec --noconfirm
dist/LedgerBook.exe
```

The exe is windowed (no console) and fully offline. `ledger.db` is created next
to `LedgerBook.exe` on first run — that file is your data; copy it to back up.

## Notes

- WebView2 runtime required on Windows (preinstalled with Win11 / Edge; small
  runtime installer for older Win10).
- `ledger.db` lives beside the exe, not inside the bundle, so it survives
  reinstall and update of the `.exe`.
