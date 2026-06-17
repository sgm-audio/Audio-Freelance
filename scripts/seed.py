"""Seed script: pre-populates ChromaDB with sample leads for demo purposes."""

import asyncio
import uuid
from datetime import datetime, timezone

from leads.schema import Lead, LeadStatus
from leads.store import upsert_lead, ensure_collections_initialized

SAMPLE_LEADS = [
    {
        "source": "linkedin",
        "tier": 1,
        "title": "Audio DSP Engineer — Soundtoys",
        "company": "Soundtoys",
        "url": "https://www.soundtoys.com/audio-dsp-engineer",
        "raw_text": "Design, test, and implement new DSP algorithms for professional audio effects. C++, real-time audio, analog modeling. Full-time, Burlington VT.",
        "niche": "plugin_dev",
        "score": 18,
        "verdict": "HOT",
        "status": "NEW",
    },
    {
        "source": "linkedin",
        "tier": 1,
        "title": "Senior Audio / ML Engineer — VoiceWunder",
        "company": "VoiceWunder GmbH",
        "url": "https://forum.juce.com/t/senior-audio-ml-engineer-local-tts-on-device/68888",
        "raw_text": "Build local TTS engine to replace ElevenLabs. On-device inference, model optimization, quantization, Apple Silicon MLX. 8-month project, remote.",
        "niche": "audio_ml",
        "score": 22,
        "verdict": "HOT",
        "status": "NEW",
    },
    {
        "source": "juce_forum",
        "tier": 1,
        "title": "Audio Software Developer — RelicSoundLabs",
        "company": "RelicSoundLabs",
        "url": "https://forum.juce.com/t/audio-software-developer-project-based-fully-remote/67300",
        "raw_text": "Project-based JUCE developer for neural modeling and audio plugins. VST3/AU/AAX. Fully remote, flexible hours.",
        "niche": "plugin_dev",
        "score": 15,
        "verdict": "HOT",
        "status": "NEW",
    },
    {
        "source": "juce_forum",
        "tier": 1,
        "title": "Context-Aware Drum Quantization — BlackSalt Audio",
        "company": "BlackSalt Audio",
        "url": "https://forum.juce.com/t/context-aware-drum-quantization-looking-for-a-juce-ara-dev/68635",
        "raw_text": "Build ARA plugin for drum quantization with dynamic programming over onset sequences. JUCE, ARA, paid contract, remote.",
        "niche": "plugin_dev",
        "score": 14,
        "verdict": "WARM",
        "status": "NEW",
    },
    {
        "source": "market_intel",
        "tier": 4,
        "title": "Music AI (Moises) — $40M Series A",
        "company": "Music AI",
        "url": "https://pulse2.com/music-ai-music-and-audio-technology-company-raises-40-million-series-a",
        "raw_text": "On-device AI for music. Stem separation, MIR, generative AI. 50M+ users. Strategic priority: edge computing and on-device inference.",
        "niche": "audio_ml",
        "score": 16,
        "verdict": "HOT",
        "status": "NEW",
    },
    {
        "source": "market_intel",
        "tier": 4,
        "title": "ElevenLabs — $500M Series D ($11B valuation)",
        "company": "ElevenLabs",
        "url": "https://themusicnetwork.com/news/ai-audio-startup-elevenlabs-valuation-funding-round",
        "raw_text": "AI voice and audio. Massive hiring, TTS, voice cloning. Raised $500M at $11B valuation.",
        "niche": "audio_ml",
        "score": 20,
        "verdict": "HOT",
        "status": "NEW",
    },
    {
        "source": "juce_forum",
        "tier": 2,
        "title": "C++/JUCE Developer — GForce Software",
        "company": "GForce Software",
        "url": "https://www.gforcesoftware.com/blog/software-developer-2026-gforce-software/",
        "raw_text": "Full-time UK-remote C++/JUCE developer for virtual instrument plugins. DSP, synthesis, 2-3 years experience.",
        "niche": "plugin_dev",
        "score": 10,
        "verdict": "WARM",
        "status": "NEW",
    },
    {
        "source": "linkedin",
        "tier": 1,
        "title": "Senior Audio DSP Engineer — Triunity Software",
        "company": "Triunity Software",
        "url": "https://www.linkedin.com/jobs/view/senior-audio-dsp-engineer-at-triunity-software-inc-4259874221",
        "raw_text": "Senior Audio DSP Engineer (Contractor). Remote. Design and optimize audio pipelines.",
        "niche": "plugin_dev",
        "score": 8,
        "verdict": "WARM",
        "status": "NEW",
    },
    {
        "source": "juce_forum",
        "tier": 2,
        "title": "C++/JUCE Developer — Plugin Series",
        "company": None,
        "url": "https://forum.juce.com/t/looking-for-c-juce-developer/67196",
        "raw_text": "Seeking experienced C++/JUCE developer for professional audio plugin series. Long-term, possible cofounder. Netherlands-based, remote supported.",
        "niche": "plugin_dev",
        "score": 9,
        "verdict": "WARM",
        "status": "NEW",
    },
    {
        "source": "market_intel",
        "tier": 4,
        "title": "David AI — $50M Series B (Audio AI Data Layer)",
        "company": "David AI",
        "url": "https://www.linkedin.com/posts/cohen-tomer_david-ai-has-raised-a-50m-series-b-to-establish-activity-7381736552110063616-4Ea5",
        "raw_text": "Data layer for audio AI. Series B led by Meritech with NVIDIA. Building audio ML infrastructure.",
        "niche": "audio_ml",
        "score": 12,
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

    print(f"\nSeeded {len(SAMPLE_LEADS)} leads.")


if __name__ == "__main__":
    seed()
