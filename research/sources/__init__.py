"""Source definitions for market intelligence scanning.

Each source module provides query lists and async functions that return MarketSignal lists.
"""

import httpx

from config import settings
from search.base import web_search

# ── Query catalog ──

FUNDING_QUERIES = [
    '"audio AI" OR "music AI" OR "neural audio" raised OR funding OR series',
    '"audio startup" OR "music tech startup" raised OR funding OR "series" OR seed',
    '"audio plugin" OR "VST" OR "CLAP" company funding OR acquisition OR raised',
    '"game audio" OR "audio middleware" OR "wwise" OR "fmod" funding OR acquisition',
    "site:ycombinator.com companies audio OR music OR speech OR sound",
]

TREND_QUERIES = [
    '"CLAP plugin" OR "clap-audio" adoption OR "now supports" OR migrating OR "switching to" -discussion',
    '"ARA 2" OR "ARA extension" OR "Audio Random Access" plugin OR DAW support',
    '"nih-plug" OR "clap-rs" OR "rust audio" new release OR update OR shipped',
    '"mamba" OR "state space" OR "SSM" audio OR DSP OR music new OR benchmark OR release',
    '"on-device" OR "edge" OR "CPU-only" "audio" OR "DSP" OR "inference" model OR engine OR framework',
    '"neural audio codec" OR "EnCodec" OR "SoundStream" OR "DAC" OR "descript audio codec"',
]

LAUNCH_QUERIES = [
    '"new audio plugin" OR "new VST" OR "new CLAP" release OR launched OR announced',
    '"DAW" OR "audio workstation" new feature OR update OR release "beta" OR "shipped"',
    '"open source" audio OR DSP OR plugin new release OR "just shipped" OR launched',
    '"AI music" OR "AI audio" tool OR product OR app launch OR released OR announced',
    '"REAPER" extension OR theme OR script OR tool new release OR update OR shipped',
]

PRICING_QUERIES = [
    '"audio DSP" OR "audio plugin" "budget" OR "rate" OR "$" contract OR freelance',
    '"REAPER" OR "reascript" OR "DAW" "budget" OR "rate" OR "$" contract OR freelance OR commission',
    '"rust audio" OR "nih-plug" "contract" OR "freelance" "$" OR "budget" OR "rate"',
    '"machine learning" audio OR music OR speech "contract" OR "freelance" "$" OR "rate"',
    '"freelance" OR "contract" "audio DSP" OR "plugin developer" rate OR "$" OR "charging" OR "per hour"',
]

HIRING_QUERIES = [
    '"hiring" "audio engineer" OR "DSP engineer" OR "audio programmer" -intern -junior',
    '"looking for" OR "we need" "audio developer" OR "DSP developer" OR "plugin developer"',
    '"audio team" OR "DSP team" growing OR building OR expanding OR hiring',
    'site:linkedin.com "audio" OR "DSP" OR "plugin" "hiring" OR "job" -intern -volunteer',
]

GITHUB_TOPICS = [
    "audio",
    "dsp",
    "plugin",
    "clap",
    "vst",
    "reaper",
    "music-information-retrieval",
    "audio-processing",
    "neural-audio",
    "music-ai",
    "audio-engine",
    "real-time-audio",
]

TRACKED_TECHNOLOGIES = {
    "CLAP": r"\bCLAP\b|clap-audio|clap-\w+",
    "ARA": r"\bARA 2\b|Audio Random Access|ARA extension",
    "Mamba/SSM": r"\bmamba\b|state.?space|SSM\b",
    "Rust Audio": r"nih.?plug|clap.?rs|rust.*audio",
    "ONNX": r"\bONNX\b|onnxruntime|onnx.?runtime",
    "LibTorch": r"\bLibTorch\b|libtorch|pytorch.*cpp",
    "REAPER": r"\bREAPER\b|reascript|SWS\b|ReaPack",
    "Web Audio": r"Web.?Audio|Audio.?Worklet|WASM.*audio",
    "Neural Audio Codecs": r"EnCodec|SoundStream|DAC\b|neural.*codec",
    "Source Separation": r"source.?separ|stem.*separ|Demucs|spleeter",
    "FAUST": r"\bFAUST\b|faust.*audio|functional.*audio",
    "JUCE": r"\bJUCE\b|juce.*framework",
    "RTNeural": r"\bRTNeural\b|rt.?neural|real.?time.*neural",
    "MIR": r"music.?information.?retrieval|MIR\b|audio.*analysis.*ml",
}

PRICING_EXCLUDE_PATTERNS = [
    r"fiverr\.com",
    r"upwork\.com",
    r"freelancer\.com",
    r"\$\d{1,2}\s*(?:/hr|per hour)",  # sub-$100/hr is usually marketplace noise
]


# ── Search functions ──


async def search_web(
    queries: list[str],
    category: str,
    tag: str,
    max_per_query: int = 5,
) -> list["MarketSignal"]:  # noqa: F821 — forward ref, resolved at runtime
    """Run web search queries and return MarketSignal list."""
    from research.market import MarketSignal

    signals: list[MarketSignal] = []
    seen_urls: set[str] = set()

    for query in queries:
        try:
            results = await web_search(query, max_results=max_per_query)
            for r in results:
                if r.url not in seen_urls:
                    seen_urls.add(r.url)
                    signals.append(
                        MarketSignal(
                            category=category,
                            source=r.source_api,
                            title=r.title,
                            url=r.url,
                            snippet=r.snippet,
                            relevance_score=5,
                            tags=[tag],
                        )
                    )
        except Exception:  # noqa: S112
            # Ignore failed queries and continue with the next one
            continue

    return signals


async def search_github() -> list["MarketSignal"]:  # noqa: F821
    """Search GitHub for trending audio-related repos."""
    from research.market import MarketSignal

    signals: list[MarketSignal] = []
    url = "https://api.github.com/search/repositories"
    headers = {}
    token = settings.github_token
    if token:
        headers["Authorization"] = f"Bearer {token}"

    for topic in GITHUB_TOPICS:
        params = {
            "q": f"topic:{topic} stars:>50 pushed:>2025-01-01",
            "sort": "stars",
            "per_page": 5,
            "order": "desc",
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, params=params, headers=headers)
                resp.raise_for_status()
                for item in resp.json().get("items", [])[:5]:
                    desc = (item.get("description") or "")[:300]
                    signals.append(
                        MarketSignal(
                            category="tech_trend",
                            source="github_trending",
                            title=item.get("full_name", ""),
                            url=item.get("html_url", ""),
                            snippet=desc,
                            relevance_score=min(
                                10, max(1, int(item.get("stargazers_count", 0) / 100))
                            ),
                            tags=[topic, "open_source"],
                        )
                    )
        except Exception:  # noqa: S112
            # Ignore failed queries and continue with the next one
            continue

    return signals
