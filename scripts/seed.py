"""Seed script: generates sample leads for demo purposes.

Uses entirely synthetic data — no real companies, URLs, or contacts.
"""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from leads.schema import Lead, LeadStatus
from leads.store import upsert_lead, ensure_collections_initialized

SAMPLE_LEADS = [
    {
        "source": "example",
        "tier": 1,
        "title": "Audio DSP Engineer — Example Corp",
        "company": "Example Corp",
        "url": "https://example.com/jobs/dsp-engineer",
        "raw_text": "Design and implement real-time audio DSP algorithms in C++. Plugin development, VST3/CLAP. Remote contract position.",
        "niche": "plugin_dev",
        "score": 15,
        "verdict": "HOT",
        "status": "NEW",
    },
    {
        "source": "example",
        "tier": 1,
        "title": "ML Audio Engineer — Acme Audio",
        "company": "Acme Audio",
        "url": "https://example.com/jobs/ml-audio",
        "raw_text": "Build on-device inference engine for audio processing. Mamba/SSM experience preferred. Model quantization, low-latency.",
        "niche": "audio_ml",
        "score": 20,
        "verdict": "HOT",
        "status": "NEW",
    },
    {
        "source": "example",
        "tier": 2,
        "title": "REAPER Scripting — Freelance",
        "company": None,
        "url": "https://example.com/gigs/reaper-automation",
        "raw_text": "Need Lua scripts for REAPER batch processing, rendering automation, and custom actions. Paid project.",
        "niche": "reaper_scripts",
        "score": 8,
        "verdict": "WARM",
        "status": "NEW",
    },
    {
        "source": "example",
        "tier": 1,
        "title": "Rust Audio Plugin Developer",
        "company": "AudioStartup.io",
        "url": "https://example.com/jobs/rust-audio",
        "raw_text": "Build CLAP plugins in Rust using nih-plug. Real-time audio processing, MIDI, GUI.",
        "niche": "rust_audio",
        "score": 12,
        "verdict": "WARM",
        "status": "NEW",
    },
    {
        "source": "example",
        "tier": 3,
        "title": "Game Audio Programmer",
        "company": "Studio X",
        "url": "https://example.com/jobs/game-audio",
        "raw_text": "Implement audio systems in Unreal Engine. Wwise integration, real-time mixing, DSP.",
        "niche": "game_audio_dev",
        "score": 10,
        "verdict": "WARM",
        "status": "NEW",
    },
]


def seed():
    ensure_collections_initialized()
    for data in SAMPLE_LEADS:
        lead = Lead(
            source=data["source"],
            tier=data["tier"],
            title=data["title"],
            company=data.get("company"),
            url=data["url"],
            raw_text=data["raw_text"],
            niche=data["niche"],
            signals={},
            score=data["score"],
            verdict=data["verdict"],
            status=LeadStatus(data["status"]),
        )
        try:
            upsert_lead(lead)
            print(f"  ✓ {lead.title[:60]}")
        except Exception as e:
            print(f"  ✗ {lead.title[:60]}: {e}")

    print(f"\nSeeded {len(SAMPLE_LEADS)} synthetic leads.")


if __name__ == "__main__":
    seed()
