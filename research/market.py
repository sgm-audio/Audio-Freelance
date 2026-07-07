"""Market intelligence: what's in demand, what people are paying, where the work is.

Architecture:
  research/sources/__init__.py   — query catalog + search functions
  research/market.py               — data types + extraction + orchestration
"""

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime

from research.sources import (
    FUNDING_QUERIES,
    HIRING_QUERIES,
    LAUNCH_QUERIES,
    PRICING_EXCLUDE_PATTERNS,
    PRICING_QUERIES,
    TRACKED_TECHNOLOGIES,
    TREND_QUERIES,
    search_github,
    search_web,
)

# ── Data types ──


@dataclass
class MarketSignal:
    category: str
    source: str
    title: str
    url: str
    snippet: str
    relevance_score: int = 0
    tags: list[str] = field(default_factory=list)


@dataclass
class TechTrend:
    technology: str
    mention_count: int = 0
    contexts: list[str] = field(default_factory=list)
    direction: str = "neutral"


@dataclass
class PricingBenchmark:
    niche: str
    contract_range_min: int = 0
    contract_range_max: int = 0
    hourly_min: int = 0
    hourly_max: int = 0
    sample_count: int = 0
    sources: list[str] = field(default_factory=list)


@dataclass
class MarketReport:
    scanned_at: str = field(default_factory=lambda: datetime.now(tz=UTC).isoformat())
    signals: list[MarketSignal] = field(default_factory=list)
    tech_trends: list[TechTrend] = field(default_factory=list)
    pricing_benchmarks: list[PricingBenchmark] = field(default_factory=list)
    hot_opportunities: list[str] = field(default_factory=list)
    summary: str = ""


# ── Technology trend extraction ──


def _count_tech_mentions(text: str) -> dict[str, int]:
    mentions: dict[str, int] = {}
    for name, pattern in TRACKED_TECHNOLOGIES.items():
        count = len(re.findall(pattern, text, re.IGNORECASE))
        if count > 0:
            mentions[name] = count
    return mentions


def extract_tech_trends(signals: list[MarketSignal]) -> list[TechTrend]:
    mention_counts: dict[str, int] = {}
    contexts: dict[str, list[str]] = {}

    for signal in signals:
        text = f"{signal.title} {signal.snippet}"
        mentions = _count_tech_mentions(text)
        for tech, count in mentions.items():
            mention_counts[tech] = mention_counts.get(tech, 0) + count
            if tech not in contexts:
                contexts[tech] = []
            if len(contexts[tech]) < 3:
                contexts[tech].append(signal.title[:100])

    trends = []
    for tech, count in sorted(mention_counts.items(), key=lambda x: -x[1]):
        trends.append(
            TechTrend(
                technology=tech,
                mention_count=count,
                contexts=contexts.get(tech, []),
                direction="rising" if count >= 3 else "stable",
            )
        )
    return trends


# ── Pricing extraction ──


def _is_price_noise(text: str) -> bool:
    return any(re.search(p, text, re.IGNORECASE) for p in PRICING_EXCLUDE_PATTERNS)


def _parse_rate(text: str) -> tuple[int, int] | None:
    """Extract (min, max) rate from text. Filters marketplace noise."""
    if _is_price_noise(text):
        return None

    # Contract ranges: $3,000 - $5,000
    m = re.search(r"\$(\d[\d,]*)\s*(?:-|to)\s*\$?(\d[\d,]*)", text)
    if m:
        lo, hi = int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))
        if hi >= 2000:
            return (lo, hi)

    # Single budget: Budget $5,000
    m = re.search(
        r"(?:budget|rate|total)\s*(?:of\s*)?[:$]?\s*\$?(\d[\d,]*)", text, re.IGNORECASE
    )
    if m:
        val = int(m.group(1).replace(",", ""))
        if 2000 <= val <= 200000:
            return (val, val)

    # Hourly: $150/hr
    m = re.search(r"\$(\d{2,3})\s*(?:/hr|/hour|per hour)", text, re.IGNORECASE)
    if m:
        hr = int(m.group(1))
        if hr >= 50:
            return (hr * 20, hr * 80)

    return None


def extract_pricing_benchmarks(signals: list[MarketSignal]) -> list[PricingBenchmark]:
    niches = {
        "plugin_dev": r"\b(?:VST|CLAP|AU|AAX|audio.?plugin|DSP)\b",
        "reaper_scripts": r"\b(?:REAPER|reascript|lua.?script|DAW.?automation)\b",
        "rust_audio": r"\b(?:rust|nih.?plug|clap.?rs)\b.*\b(?:audio|DSP)\b",
        "audio_ml": r"\b(?:ML|machine.?learning|neural|ONNX|inference)\b.*\b(?:audio|DSP|speech)\b",
        "game_audio_dev": r"\b(?:game|wwise|FMOD)\b.*\b(?:audio|sound)\b",
    }
    buckets: dict[str, list[tuple[int, int]]] = {n: [] for n in niches}

    for signal in signals:
        rate = _parse_rate(f"{signal.title} {signal.snippet}")
        if rate:
            for niche, pat in niches.items():
                if re.search(pat, signal.snippet, re.IGNORECASE):
                    buckets[niche].append(rate)

    benchmarks = []
    for niche, rates in buckets.items():
        if not rates:
            continue
        mins = [r[0] for r in rates]
        maxs = [r[1] for r in rates]
        hours = []
        for lo, hi in rates:
            if 0 < lo < hi and hi / lo < 5:
                hours.append(lo // 20)
                hours.append(hi // 80)
        benchmarks.append(
            PricingBenchmark(
                niche=niche,
                contract_range_min=min(mins),
                contract_range_max=max(maxs),
                hourly_min=min(hours) if hours else 0,
                hourly_max=max(hours) if hours else 0,
                sample_count=len(rates),
            )
        )

    return benchmarks


# ── Opportunity synthesis ──


def _synthesize(trends: list[TechTrend], pricing: list[PricingBenchmark]) -> list[str]:
    opps: list[str] = []
    for t in trends:
        if t.direction == "rising":
            opps.append(f"{t.technology} is trending ({t.mention_count} mentions).")
    for p in pricing:
        if p.contract_range_max > 5000:
            opps.append(
                f"{p.niche}: contracts ${p.contract_range_min:,}-${p.contract_range_max:,} "
                f"({p.sample_count} data points)."
            )
    return opps


# ── Main entry point ──


async def run_market_scan() -> MarketReport:
    import asyncio

    sources = [
        ("funding", FUNDING_QUERIES, "funding"),
        ("tech_trend", TREND_QUERIES, "tech_trend"),
        ("product_launch", LAUNCH_QUERIES, "product"),
        ("pricing", PRICING_QUERIES, "pricing"),
        ("hiring_signal", HIRING_QUERIES, "hiring"),
    ]

    tasks = []
    for cat, queries, tag in sources:
        tasks.append(search_web(queries, cat, tag))
    tasks.append(search_github())

    results = await asyncio.gather(*tasks, return_exceptions=True)

    signals: list[MarketSignal] = []
    errors: list[str] = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            errors.append(f"Source {i}: {result}")
        else:
            signals.extend(result)

    # Dedup
    seen: set[str] = set()
    unique: list[MarketSignal] = []
    for s in signals:
        if s.url not in seen:
            seen.add(s.url)
            unique.append(s)

    trends = extract_tech_trends(unique)
    pricing = extract_pricing_benchmarks(unique)
    opportunities = _synthesize(trends, pricing)

    parts = []
    rising = [t for t in trends if t.direction == "rising"][:5]
    if rising:
        parts.append(f"Rising: {', '.join(t.technology for t in rising)}")
    if pricing:
        top = sorted(pricing, key=lambda p: -p.contract_range_max)[:3]
        parts.append(
            f"Top pay: {', '.join(f'{p.niche} (${p.contract_range_max:,})' for p in top)}"
        )
    if opportunities:
        parts.append(f"{len(opportunities)} opportunities")
    summary = " | ".join(parts) if parts else "Scan complete."

    return MarketReport(
        signals=unique,
        tech_trends=trends,
        pricing_benchmarks=pricing,
        hot_opportunities=opportunities,
        summary=summary,
    )


async def generate_report() -> dict:
    report = await run_market_scan()
    return {
        "scanned_at": report.scanned_at,
        "summary": report.summary,
        "total_signals": len(report.signals),
        "signals": [
            {
                "category": s.category,
                "source": s.source,
                "title": s.title,
                "url": s.url,
                "snippet": s.snippet[:200],
                "relevance": s.relevance_score,
                "tags": s.tags,
            }
            for s in sorted(report.signals, key=lambda x: -x.relevance_score)[:50]
        ],
        "tech_trends": [
            {
                "technology": t.technology,
                "mentions": t.mention_count,
                "direction": t.direction,
                "contexts": t.contexts,
            }
            for t in sorted(report.tech_trends, key=lambda x: -x.mention_count)
        ],
        "pricing_benchmarks": [
            {
                "niche": p.niche,
                "contract_range_min": p.contract_range_min,
                "contract_range_max": p.contract_range_max,
                "hourly_min": p.hourly_min,
                "hourly_max": p.hourly_max,
                "sample_count": p.sample_count,
            }
            for p in sorted(
                report.pricing_benchmarks, key=lambda x: -x.contract_range_max
            )
        ],
        "hot_opportunities": report.hot_opportunities,
    }
