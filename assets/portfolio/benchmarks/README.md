# RT inference benchmarks (in progress)

**Status:** Methodology drafted — **no frozen public numbers yet.**  
Do not cite sub-millisecond or "% CPU" figures in outreach until this page publishes measured results and this asset flips to `shipped` in `asset_registry.yml`.

## Intent

Publish reproducible CPU latency/CPU% measurements for Mamba/SSM-style inference used in CLARA-class plugins:

- Sample rates: 44.1 kHz / 48 kHz  
- Buffer sizes: 64 / 128 / 256 / 512  
- Metrics: mean / p95 process-block time, XRuns under load, RSS after warmup  
- Platforms: Windows + Linux first; macOS when CI catches up  

## Guarantees we *can* state today (architecture)

From the CLARA engineering case study (not a latency guarantee):

- Custom C++ inference core (no ONNX Runtime on the audio path)  
- Design goal: **zero heap allocation on the audio thread**  
- Click-free bypass via ~50 ms linear crossfade  

## When numbers land

Results will appear in this directory as CSV + a short markdown summary, with machine specs and commit SHA. Outreach templates will then be allowed to reference them via the asset registry.
