# Screenshots

Replace these placeholders with actual screenshots using:

```bash
# Start the app first: ./run.sh

# Option A: Firefox (recommended — handles dark mode well)
firefox --screenshot dashboard.png http://localhost:3000/ --window-size=1280,800
firefox --screenshot market.png http://localhost:3000/market --window-size=1280,800
firefox --screenshot pipeline.png http://localhost:3000/tracking --window-size=1280,800

# Option B: Chrome/Chromium headless
google-chrome --headless=new --screenshot=dashboard.png --window-size=1280,800 http://localhost:3000/
```

Screenshots should be captured in dark mode for consistency. Recommended resolution: 1280×800.
