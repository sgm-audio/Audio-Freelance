"""Tier 4 — Outbound / Cold: target company discovery for cold outreach."""

from search.base import RawCandidate, web_search

SEED_COMPANIES = [
    ("iZotope", "izotope.com"),
    ("Output", "output.com"),
    ("Native Instruments", "native-instruments.com"),
    ("Arturia", "arturia.com"),
    ("u-he", "u-he.com"),
    ("Soundtoys", "soundtoys.com"),
    ("Eventide", "eventide.com"),
    ("FabFilter", "fabfilter.com"),
    ("Valhalla DSP", "valhalladsp.com"),
    ("Goodhertz", "goodhertz.com"),
    ("Kilohearts", "kilohearts.com"),
    ("Unfiltered Audio", "unfilteredaudio.com"),
    ("AudioThing", "audiothing.net"),
    ("Tokyo Dawn Records", "tokyodawn.net"),
    ("DMG Audio", "dmgaudio.com"),
]

TIER_4_QUERIES = {
    "plugin_dev": [
        '"audio plugin company" OR "pro audio company" careers OR jobs OR contract OR freelance',
        '"audio AI" OR "music AI" startup funding 2025 OR 2026 hiring OR jobs',
    ],
    "reaper_scripts": [
        '"reaper" OR "daw" "developer" OR "contractor" OR "freelance" jobs OR careers',
        '"audio software company" OR "music software company" reaper OR daw developer',
    ],
    "rust_audio": [
        '"rust" "audio" company OR startup hiring OR jobs OR careers',
        '"audio tooling" OR "audio infrastructure" rust hiring OR jobs',
    ],
    "audio_ml": [
        '"audio AI" OR "music AI" startup OR company hiring OR jobs OR careers',
        '"neural dsp" OR "ai audio" OR "ml audio" company OR startup hiring OR jobs',
    ],
    "game_audio_dev": [
        '"wwise" OR "fmod" OR "game audio" middleware company OR startup careers OR jobs',
        '"game audio" OR "audio programmer" company OR studio hiring OR contract',
    ],
}


async def _company_careers_search() -> list[RawCandidate]:
    candidates: list[RawCandidate] = []
    for name, domain in SEED_COMPANIES:
        try:
            results = await web_search(
                f"site:{domain} careers OR jobs OR contract OR freelance",
                max_results=3,
            )
            for r in results:
                candidates.append(
                    RawCandidate(
                        source="company_careers",
                        title=r.title,
                        url=r.url,
                        snippet=r.snippet,
                        company=name,
                        raw_text=r.snippet,
                        tier=4,
                    )
                )
        except Exception:  # noqa: S112
            # Ignore failed queries and continue with the next one
            continue
    return candidates


async def run(niche: str) -> list[RawCandidate]:
    queries = TIER_4_QUERIES.get(niche, TIER_4_QUERIES.get("plugin_dev", []))
    all_candidates: list[RawCandidate] = []
    seen_urls: set[str] = set()

    for query in queries:
        try:
            results = await web_search(query, max_results=10)
            for r in results:
                if r.url not in seen_urls:
                    seen_urls.add(r.url)
                    all_candidates.append(
                        RawCandidate(
                            source=r.source_api,
                            title=r.title,
                            url=r.url,
                            snippet=r.snippet,
                            raw_text=r.snippet,
                            tier=4,
                        )
                    )
        except Exception:  # noqa: S112
            # Ignore failed queries and continue with the next one
            continue

    for c in await _company_careers_search():
        if c.url not in seen_urls:
            seen_urls.add(c.url)
            all_candidates.append(c)

    return all_candidates
