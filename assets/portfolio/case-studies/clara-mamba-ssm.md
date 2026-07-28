# Case study: CLARA — Mamba-3 SSM audio suite

**Status:** In progress (architecture shipping; commercial product incomplete)  
**Role:** Design + implementation (SGM Studios)  
**Stack:** C++17 · custom SSM inference · CLAP · VST3 (clap-wrapper) · ARA 2.0 scaffolding  
**Public writeup only** — full source and weights remain private. Architecture facts below are safe to cite.

---

## Problem

Most neural audio plugins lean on ONNX/LibTorch at runtime. That pulls heavy runtimes, allocator jitter, and latency budgets that break real-time DAW use. We needed a **CPU-only, real-time-safe** path for Selective State Space Model (Mamba-3) inference inside a plugin host.

## What shipped (engineering)

| Capability | State |
|---|---|
| Shared `SsmInferenceCore` (no ONNX Runtime) | Done |
| Flat `model.bin` weights via mmap at init | Done |
| CLAP effect (`MambaSuiteClap.clap`) | Builds / processes stereo |
| VST3 via clap-wrapper | Builds (Ableton-loadable target) |
| ARA 2.0 extension library | Scaffolding only |
| RT-safe audio thread (zero heap alloc) | Documented + tested intent |
| Click-free bypass (50 ms linear crossfade) | Done |
| Trained effect models beyond identity AE | Early / incomplete |
| Custom GUI | Deferred (generic host editor) |

**Current engine sketch:** Mamba-3 R=4 time-domain — d_model=128, d_state=32, 6 layers, multi-head MIMO rank 4, ~1.66M params. Per-sample processing on the audio path (STFT used in training loss only).

## Why it matters to clients

- Proof we can own the **inference core**, not just wrap someone else's runtime  
- Format fluency: **CLAP + VST3 + ARA** from one core  
- Explicit honesty about product completeness — useful when scoping contract work

## What we do *not* claim yet

- App Store / commercial release  
- Finished ARA real-time conditioning  
- Published sub-millisecond latency numbers (benchmark page is in progress)  
- Production-ready effect variants (saturator / compressor / denoiser planned)

## Client-shaped takeaway

If you need **on-device / CPU neural audio** inside a plugin or iOS audio engine, this is the class of system we build: deterministic audio-thread rules, custom C++ inference, host formats that ship.

**Proof link:** this case study in [sgm-audio/portfolio](https://github.com/sgm-audio/portfolio)
