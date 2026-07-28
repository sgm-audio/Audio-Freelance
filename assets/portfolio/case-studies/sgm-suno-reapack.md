# Case study: SGM Suno workflow — REAPER / ReaPack suite

**Status:** Shipped (public)  
**Role:** Author (SGM Studios / TrackClear branding on scripts)  
**Stack:** REAPER · Lua ReaScript · ReaPack `index.xml`  
**Repo:** https://github.com/SGM-Studios/sgm-suno-workflow

---

## Problem

Suno AI exports arrive as messy ZIPs — stems, odd filenames, no tempo map, uneven loudness. Producers need a **repeatable REAPER pipeline**, not a manual hour per song.

## What shipped

Six-script pipeline:

1. ZIP importer → tracks + markers + lyrics  
2. Metadata organizer → rename / color / regions  
3. Tempo mapper → BPM + tempo markers  
4. Dynamic splitter → section boundaries  
5. Loudness master → target integrated LUFS  
6. Stem aligner → mix-ready stem layout  

Installable via **ReaPack** by importing the SGM repository index:

`https://raw.githubusercontent.com/SGM-Studios/sgm-suno-workflow/main/index.xml`

## Why it matters to clients

- Demonstrates shipped **DAW automation** with a distribution channel (ReaPack), not gist scripts  
- Clear user docs (`INSTALL.md`, `CHANGELOG.md`, test cases)  
- Honest public surface for REAPER contract outreach

## Cite carefully

Prefer: *"SGM Suno workflow suite — installable via ReaPack from the SGM index."*  
Avoid implying a ReaTeam official listing unless/until that is true.

**Proof:** https://github.com/SGM-Studios/sgm-suno-workflow
