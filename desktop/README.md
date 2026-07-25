# Audio-Freelance desktop shell

Thin **Tauri 2** window around the existing FastAPI + Next stack. Does **not** bundle Python/Node.

## Prerequisites

- Same as the main app: Python 3.12+, Node 22+, `uv`, `frontend/node_modules`, `.env`
- [Rust](https://rustup.rs/) (stable)
- Windows WebView2 (usually already installed)

## Dev

```powershell
cd desktop
npm install
npm run tauri dev
```

Opens a native window, runs `python run.py` from the repo root, then loads `http://127.0.0.1:3000`. Closing the window runs `python run.py --shutdown`.

## Release exe (local)

```powershell
cd desktop
npm run tauri build
```

Exe under `src-tauri\target\release\Audio-Freelance.exe` (and NSIS under `bundle/` if generated).

Override repo root if needed: `AUDIO_FREELANCE_ROOT=C:\path\to\Audio-Freelance`
