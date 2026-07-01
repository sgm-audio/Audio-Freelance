"""Tier 2 — Weekly: broad remote/freelance platforms and HN."""

import contextlib

import httpx

from search.base import RawCandidate, web_search

QUERIES = {
    "plugin_dev": [
        'site:weworkremotely.com audio OR DSP OR "audio plugin"',
        "site:remoteok.com audio dsp plugin",
        "site:wellfound.com audio dsp contract",
        '"audio plugin developer" OR "dsp engineer" remote contract OR freelance OR hiring',
        # EU platforms
        'site:remotive.com audio OR dsp OR plugin developer OR engineer',
        'site:landing.jobs audio OR dsp OR plugin OR "audio developer"',
        'site:europeremotely.com audio OR dsp OR plugin developer',
        # Freelance platforms
        'site:upwork.com audio OR dsp OR plugin developer OR engineer',
        'site:freelancer.com audio processing OR dsp OR audio plugin',
        'site:peopleperhour.com audio OR dsp OR plugin audio engineer',
        'site:guru.com audio OR dsp OR plugin developer',
    ],
    "reaper_scripts": [
        'site:remoteok.com reaper OR "daw automation" OR "audio scripting"',
        'site:weworkremotely.com reaper OR daw OR "audio developer"',
        '"reaper developer" OR "reascript" OR "daw script" contract OR freelance OR remote',
        'site:upwork.com reaper OR reascript OR "audio automation" OR "daw scripting"',
        'site:freelancer.com reaper OR reascript OR "daw script"',
        'site:peopleperhour.com reaper OR reascript',
    ],
    "rust_audio": [
        "site:remoteok.com rust audio developer",
        "site:weworkremotely.com rust audio OR dsp",
        "site:wellfound.com rust audio contract",
        '"rust audio developer" OR "rust dsp" remote OR contract OR job',
        "site:remotive.com rust audio OR dsp",
        "site:landing.jobs rust audio OR dsp",
        'site:upwork.com rust audio OR dsp OR plugin',
    ],
    "audio_ml": [
        'site:weworkremotely.com "machine learning" audio OR music OR speech',
        'site:remoteok.com "machine learning" audio OR music',
        'site:wellfound.com "machine learning" audio OR music contract',
        '"ml engineer" OR "ai engineer" audio OR music OR speech remote OR contract',
        'site:remotive.com "machine learning" OR "ai" audio OR speech OR music',
        'site:landing.jobs machine learning audio OR speech OR music',
        'site:upwork.com machine learning audio OR speech OR music',
    ],
    "game_audio_dev": [
        'site:weworkremotely.com "game audio" OR "audio programmer"',
        'site:remoteok.com "game audio" OR "audio programmer"',
        '"audio programmer" OR "game audio engineer" game contract OR freelance OR remote',
        'site:gamesjobsdirect.com audio OR sound programmer OR engineer',
        'site:upwork.com game audio OR audio programmer OR sound designer',
        'site:remotive.com game audio OR audio programmer OR sound design',
    ],
}


async def _hn_algolia_search() -> list[RawCandidate]:
    """Query Hacker News 'Who is Hiring' via Algolia API."""
    url = "https://hn.algolia.com/api/v1/search_by_date"
    params = {
        "tags": "comment",
        "query": "audio OR DSP OR plugin OR REAPER OR Mamba OR rust",
        "hitsPerPage": 30,
    }
    candidates: list[RawCandidate] = []
    with contextlib.suppress(Exception):
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            for hit in data.get("hits", []):
                story_title = (hit.get("story_title", "") or "").lower()
                comment_text = hit.get("comment_text", "") or ""
                if "who is hiring" in story_title:
                    lower = comment_text.lower()
                    if any(kw in lower for kw in ["contract", "freelance", "part-time", "remote"]):
                        candidates.append(
                            RawCandidate(
                                source="hn_algolia",
                                title=story_title,
                                url=hit.get("story_url", "") or hit.get("url", ""),
                                snippet=comment_text[:500],
                                raw_text=comment_text[:500],
                                tier=2,
                            )
                        )
    return candidates


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
                    all_candidates.append(
                        RawCandidate(
                            source=r.source_api,
                            title=r.title,
                            url=r.url,
                            snippet=r.snippet,
                            raw_text=r.snippet,
                            tier=2,
                        )
                    )
        except Exception:  # noqa: S112
            # Ignore failed queries and continue with the next one
            continue

    hn = await _hn_algolia_search()
    for c in hn:
        if c.url not in seen_urls:
            seen_urls.add(c.url)
            all_candidates.append(c)

    return all_candidates
