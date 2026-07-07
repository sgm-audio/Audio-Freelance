"""Tier 1 — Daily: actual job listings from dedicated job boards and career pages.

These queries target specific job listing pages, NOT forum discussions.
Each query is tuned to find contract/freelance/employment posts with pay info.

LinkedIn removed: anti-bot measures make scraping unreliable, signal-to-noise
too low. Rely on direct ATS APIs (tier5) + deep fetch from other sources.
"""

from search.base import RawCandidate, web_search

QUERIES = {
    "plugin_dev": [
        # US job boards
        'site:indeed.com "audio plugin" OR "dsp engineer" OR "audio developer" contract OR freelance -intern',
        'site:ziprecruiter.com "audio dsp" OR "plugin developer" contract OR freelance OR remote',
        'site:craigslist.org "audio" OR "dsp" OR "plugin" contract OR freelance OR gig',
        # European job boards
        'site:indeed.co.uk "audio dsp" OR "audio plugin" OR "audio engineer" contract OR freelance',
        'site:indeed.de "audio dsp" OR "audio entwicklung" OR "plugin entwickler" OR "dsp ingenieur"',
        "site:indeed.fr ingenieur OR developpeur audio OR dsp OR plugin freelance OR contrat",
        'site:reed.co.uk "audio software" OR "dsp" OR "plugin" contract OR freelance',
        # Canadian/Australian boards
        'site:ca.indeed.com "audio" OR "dsp" OR "plugin" contract OR freelance',
        'site:seek.com.au "audio engineer" OR "audio developer" OR "dsp" contract OR freelance',
        # Niche audio job boards
        "site:theaudioprogrammer.com job OR contract OR freelance OR hiring",
        "site:kvr.com forum job OR hiring OR commission OR contract OR freelance audio plugin",
        "site:forum.cockos.com job OR hiring OR commission OR paid script OR extension OR plugin",
        "site:vi-control.net forum job OR hiring OR commission OR freelance audio OR composer OR plugin",
        # Worldwide remote contracts
        'remote "audio dsp" OR "audio software" OR "plugin developer" contract OR freelance NOT us NOT uk',
        '"audio dsp consultant" OR "audio freelance engineer" OR "contract audio programmer"',
        # General with budgets
        '"audio plugin" "budget" "$" "contract" OR "freelance" -forum -discussion -reddit',
        '"DSP engineer" OR "audio DSP" "$" "contract" OR "freelance" OR "remote" -forum -reddit -discussion',
    ],
    "reaper_scripts": [
        # Primary boards
        'site:indeed.com REAPER OR reascript OR "audio automation" contract OR freelance',
        # Cockos forum
        'site:forum.cockos.com "jobs" OR "hiring" OR "commission" OR "paid" "script" OR "extension"',
        # Worldwide REAPER
        '"REAPER" OR "reascript" "paid" OR "commission" "script" OR "automation" -forum -reddit -discussion',
        'site:vi-control.net REAPER OR reascript OR "daw automation" job OR commission OR paid',
        'remote REAPER OR reascript OR "daw automation" developer OR contractor OR freelance',
        # EU/AU specific
        'site:indeed.co.uk REAPER OR reascript OR "daw script" contract OR freelance',
        'site:seek.com.au REAPER OR reascript OR "daw automation"',
    ],
    "rust_audio": [
        # Primary boards
        'site:indeed.com "rust" "audio" OR "dsp" contract OR freelance',
        'site:github.com "rust" "audio" OR "dsp" "bounty" OR "contract" OR "hiring"',
        # Worldwide
        '"rust" "audio" OR "dsp" "$" OR "contract" OR "freelance" OR "remote" -forum -reddit -discussion',
        'remote "rust" "audio" OR "dsp" OR "plugin" contract OR freelance OR job',
        '"nih-plug" OR "clap-rs" OR "rust vst" "contract" OR "freelance" OR "paid"',
        # EU/AU specific
        'site:indeed.co.uk "rust" "audio" OR "dsp" contract OR freelance',
        'site:reed.co.uk "rust" "audio" OR "dsp"',
        'site:seek.com.au "rust" "audio" OR "dsp"',
        # EU job sites
        'site:stackoverflow.com/jobs "rust" "audio" OR "dsp" OR "plugin"',
        "site:remoteok.com rust audio OR dsp OR plugin",
    ],
    "audio_ml": [
        # Primary boards
        'site:indeed.com "machine learning" "audio" OR "speech" contract OR freelance',
        # Research/engineering
        '"on-device" OR "edge" OR "cpu-only" "audio" OR "speech" "engineer" OR "developer" contract OR freelance',
        '"mamba" OR "state space" OR "neural audio" "audio" OR "dsp" "contract" OR "freelance" OR "hiring"',
        # Audio AI startups
        '"audio AI" OR "music AI" OR "speech AI" "hiring" OR "contract" "engineer" -forum -reddit',
        # Worldwide
        'remote "audio machine learning" OR "audio AI" OR "speech ML" engineer OR developer contract',
        'site:indeed.co.uk "machine learning" audio OR speech OR music contract OR freelance',
        'site:indeed.de "machine learning" OR "kuenstliche intelligenz" audio OR sprache OR musik',
        'site:seek.com.au "machine learning" audio OR speech OR music',
        'site:stackoverflow.com/jobs "machine learning" audio OR speech',
        # Conference job boards
        "site:adc2025.org job OR hiring OR career",
    ],
    "game_audio_dev": [
        # Primary boards
        'site:indeed.com "audio programmer" OR "game audio" OR "wwise" OR "fmod" contract OR freelance',
        '"game audio" "programmer" OR "developer" "contract" OR "freelance" OR "remote" -forum -reddit',
        '"wwise" OR "fmod" OR "audio middleware" "contract" OR "freelance" "developer" OR "integrator"',
        # Worldwide - European game studios
        'site:gamesjobsdirect.com "audio" OR "sound" programmer OR designer OR engineer',
        'site:indeed.co.uk "audio programmer" OR "game audio" OR "sound designer" contract OR freelance',
        'site:indeed.de "audio programmer" OR "game audio" OR "sound designer"',
        # Asia/Pacific game audio
        'site:seek.com.au "audio programmer" OR "game audio" OR "sound designer"',
        'site:jobin.co.jp "audio" OR "sound" game OR video',
        # Remote game audio
        'remote "game audio" OR "audio programmer" OR "wwise" OR "fmod" contract OR freelance',
        # Indie game audio
        '"indie game" "audio" OR "sound" "contract" OR "freelance" OR "hiring" -forum -reddit',
        "site:itch.io job OR hiring OR contract audio OR sound OR composer",
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
