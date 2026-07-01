"""Tier 1 — Daily: actual job listings from dedicated job boards and career pages.

These queries target specific job listing pages, NOT forum discussions.
Each query is tuned to find contract/freelance/employment posts with pay info.

LinkedIn removed: anti-bot measures make scraping unreliable, signal-to-noise
too low. Rely on direct ATS APIs (tier5) + deep fetch from other sources.
"""

from search.base import RawCandidate, web_search

QUERIES = {
    "plugin_dev": [
        # Indeed: audio plugin development
        'site:indeed.com "audio plugin" OR "dsp engineer" OR "audio developer" contract OR freelance -intern',
        # ZipRecruiter: real audio DSP contracts
        'site:ziprecruiter.com "audio dsp" OR "plugin developer" contract OR freelance OR remote',
        # General: actual contract posts with budgets
        '"audio plugin" "budget" "$" "contract" OR "freelance" -forum -discussion -reddit',
        '"DSP engineer" OR "audio DSP" "$" "contract" OR "freelance" OR "remote" -forum -reddit -discussion',
    ],
    "reaper_scripts": [
        # Indeed: REAPER scripting
        'site:indeed.com REAPER OR reascript OR "audio automation" contract OR freelance',
        # Upwork-style: paid REAPER scripting (from any board)
        '"REAPER" OR "reascript" "paid" OR "commission" "script" OR "automation" -forum -reddit -discussion',
        # Cockos forum jobs section specifically
        'site:forum.cockos.com "jobs" OR "hiring" OR "commission" OR "paid" "script" OR "extension"',
    ],
    "rust_audio": [
        # Indeed: Rust audio
        'site:indeed.com "rust" "audio" OR "dsp" contract OR freelance',
        # GitHub: Rust audio bounty/contract issues
        'site:github.com "rust" "audio" OR "dsp" "bounty" OR "contract" OR "hiring"',
        # General Rust audio contracts
        '"rust" "audio" OR "dsp" "$" OR "contract" OR "freelance" OR "remote" -forum -reddit -discussion',
        # nih-plug / clap-rs specific
        '"nih-plug" OR "clap-rs" OR "rust vst" "contract" OR "freelance" OR "paid"',
    ],
    "audio_ml": [
        # Indeed: ML audio
        'site:indeed.com "machine learning" "audio" OR "speech" contract OR freelance',
        # Research/engineering: on-device ML, audio inference
        '"on-device" OR "edge" OR "cpu-only" "audio" OR "speech" "engineer" OR "developer" contract OR freelance',
        '"mamba" OR "state space" OR "neural audio" "audio" OR "dsp" "contract" OR "freelance" OR "hiring"',
        # Audio AI startups hiring
        '"audio AI" OR "music AI" OR "speech AI" "hiring" OR "contract" "engineer" -forum -reddit',
    ],
    "game_audio_dev": [
        # Indeed: game audio programming
        'site:indeed.com "audio programmer" OR "game audio" OR "wwise" OR "fmod" contract OR freelance',
        # GameAudio specific jobs
        '"game audio" "programmer" OR "developer" "contract" OR "freelance" OR "remote" -forum -reddit',
        # Wwise/FMOD contract work
        '"wwise" OR "fmod" OR "audio middleware" "contract" OR "freelance" "developer" OR "integrator"',
    ],
}

_FORUM_NOISE = [
    "discussion",
    "how to",
    "tutorial",
    "what is",
    "anyone else",
    "question",
    "help with",
    "thoughts on",
    "opinion",
    "should i",
    "vs",
    "versus",
    "which is better",
    "recommend",
    "suggestion",
]


def _is_forum_noise(text: str) -> bool:
    lower = text.lower()
    hiring_signals = [
        "hiring",
        "contract",
        "freelance",
        "paid",
        "job",
        "commission",
        "looking for",
        "we need",
        "we are looking",
        "budget",
        "rate",
        "$",
    ]
    has_hiring = any(s in lower for s in hiring_signals)
    if has_hiring:
        return False
    noise_count = sum(1 for p in _FORUM_NOISE if p in lower)
    return noise_count >= 1


async def run(niche: str) -> list[RawCandidate]:
    queries = QUERIES.get(niche, QUERIES.get("plugin_dev", []))
    all_candidates: list[RawCandidate] = []
    seen_urls: set[str] = set()

    for query in queries:
        try:
            results = await web_search(query, max_results=10)
            for r in results:
                if r.url not in seen_urls:
                    seen_urls.add(r.url)
                    snippet = r.snippet or ""
                    if _is_forum_noise(f"{r.title} {snippet}"):
                        continue
                    all_candidates.append(
                        RawCandidate(
                            source=r.source_api,
                            title=r.title,
                            url=r.url,
                            snippet=snippet,
                            raw_text=snippet,
                            tier=1,
                        )
                    )
        except Exception:  # noqa: S112
            # Ignore failed queries and continue with the next one
            continue

    return all_candidates
