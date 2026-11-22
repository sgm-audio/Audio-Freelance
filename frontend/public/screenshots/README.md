# Screenshots

The gallery images in this folder (`dashboard.png`, `market.png`, `pipeline.png`)
are real 1280×800 captures of the running app in dark mode. They are referenced
from the README screenshot table.

## Refreshing them

Start the app first:

```bash
python run.py
```

Then capture each view in dark mode at 1280×800. With Chrome/Chromium headless:

```bash
google-chrome --headless=new --window-size=1280,800 --screenshot=frontend/public/screenshots/dashboard.png http://localhost:3000/
google-chrome --headless=new --window-size=1280,800 --screenshot=frontend/public/screenshots/market.png http://localhost:3000/market
google-chrome --headless=new --window-size=1280,800 --screenshot=frontend/public/screenshots/pipeline.png http://localhost:3000/tracking
```

Firefox equivalent:

```bash
firefox --screenshot frontend/public/screenshots/dashboard.png http://localhost:3000/ --window-size=1280,800
```

The dashboard now requires a reachable backend and a completed profile; if the
profile is empty, `/` redirects to `/setup` and the capture will show the wizard
instead. Complete setup (or route the profile status endpoint in a headless
harness) before capturing.
