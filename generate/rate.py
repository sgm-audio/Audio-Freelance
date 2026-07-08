"""Rate generator — pricing tiers with floor check."""

from config import settings

MIN_RATE_CAD = settings.min_rate_cad
HOURLY_FLOOR_CAD = settings.hourly_floor_cad


def generate_rate(
    task_description: str,
    estimated_hours: int,
) -> dict:
    """Generate rate tiers for a given task.

    Returns dict with premium/standard/mvp rates and anchor text.
    """
    total_min = estimated_hours * HOURLY_FLOOR_CAD

    if total_min < MIN_RATE_CAD:
        return {
            "task": task_description,
            "hours": estimated_hours,
            "below_floor": True,
            "message": (
                f"Estimated total (${total_min}) is below minimum of ${MIN_RATE_CAD}. "
                f"Consider productizing as a standalone tool (Gumroad) instead of custom contract."
            ),
            "tiers": None,
        }

    tiers = {
        "mvp": {
            "rate": round(HOURLY_FLOOR_CAD * 0.7),
            "total": round(estimated_hours * HOURLY_FLOOR_CAD * 0.7),
            "description": "Proof of concept only",
        },
        "standard": {
            "rate": HOURLY_FLOOR_CAD,
            "total": total_min,
            "description": "Includes 7d support",
        },
        "premium": {
            "rate": round(HOURLY_FLOOR_CAD * 1.5),
            "total": round(estimated_hours * HOURLY_FLOOR_CAD * 1.5),
            "description": "Includes 30d support, docs, source",
        },
    }

    agency_est = round(total_min * 2.5)
    your_est = tiers["standard"]["total"]

    return {
        "task": task_description,
        "hours": estimated_hours,
        "below_floor": False,
        "tiers": tiers,
        "anchor": (
            f"Traditional agency: ~${agency_est}. "
            f"I can do ${your_est} because the inference engine/benchmark already exists."
        ),
    }
