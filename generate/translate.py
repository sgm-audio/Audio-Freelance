"""Translate technical capability into client-facing value proposition.

Pre-flight validates against asset registry before returning claims.
"""

from assets.registry import AssetRegistry, load_registry, verify_draft_claims

_registry: AssetRegistry | None = None


def _get_registry() -> AssetRegistry:
    global _registry
    if _registry is None:
        _registry = load_registry()
    return _registry


def translate_capability(
    technical_description: str,
) -> dict:
    """Translate a technical capability into a client-facing pitch.

    Returns structured output with headline, pitch, bullets, and pricing anchor.
    """
    registry = _get_registry()

    headline = "Neural audio processing that runs on the user's CPU — no cloud, no per-call cost"
    pitch = (
        "I build real-time C++/Rust audio engines using state-space (Mamba/SSM) architectures. "
        "Public RT-safety benchmarks available (mamba-audio-rt-bench)."
    )
    bullets = [
        "Sub-1ms processing per 512-sample buffer @ 48kHz — benchmarked, not estimated",
        "Runs on any laptop CPU — no GPU dependency, no API costs",
        "Your model weights, your IP — nothing leaves the binary",
    ]
    pricing_anchor = "30-50% below a dedicated DSP-ML hire for a fixed-scope integration"

    result = {
        "input": technical_description,
        "headline": headline,
        "pitch": pitch,
        "bullets": bullets,
        "pricing_anchor": pricing_anchor,
    }

    # Pre-flight: check for unsafe claims
    combined_text = f"{headline} {pitch} {' '.join(bullets)}"
    violations = verify_draft_claims(combined_text, registry)
    if violations:
        result["warnings"] = violations

    return result
