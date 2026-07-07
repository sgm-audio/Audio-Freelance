"""Asset registry — source of truth for portfolio claims in outreach.

Every generation function must load the registry and refuse to emit
'shipped'-tier claims for any asset marked 'in_progress' or 'broken'.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import yaml

_DEFAULT_REGISTRY_PATH = Path(__file__).resolve().parent.parent / "asset_registry.yml"


@dataclass
class Asset:
    id: str
    status: str  # shipped | in_progress | broken
    description: str
    proof: str
    pitch_value: str


class AssetRegistry:
    """Loads and queries the asset registry YAML."""

    def __init__(self, path: str | Path = _DEFAULT_REGISTRY_PATH):
        self.path = Path(path)
        self._assets: dict[str, Asset] = {}
        self._loaded_at: datetime | None = None
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            self._assets = {}
            return

        with open(self.path) as f:
            data = yaml.safe_load(f)

        self._loaded_at = datetime.now(tz=UTC)

        if not data or "assets" not in data:
            self._assets = {}
            return

        for item in data["assets"]:
            asset = Asset(
                id=item.get("id", ""),
                status=item.get("status", "broken"),
                description=item.get("description", ""),
                proof=item.get("proof", ""),
                pitch_value=item.get("pitch_value", ""),
            )
            self._assets[asset.id] = asset

    def get(self, asset_id: str) -> Asset | None:
        return self._assets.get(asset_id)

    def all(self) -> dict[str, Asset]:
        return dict(self._assets)

    def shipped_ids(self) -> set[str]:
        return {aid for aid, a in self._assets.items() if a.status == "shipped"}

    def is_safe_to_claim(self, asset_id: str) -> bool:
        """Return True if the asset can be claimed as shipped in outreach."""
        asset = self.get(asset_id)
        if asset is None:
            return False
        return asset.status == "shipped"

    def status(self) -> str:
        when = self._loaded_at.isoformat() if self._loaded_at else "never"
        return f"Loaded {len(self._assets)} assets at {when}"


def load_registry(
    path: str | Path | None = None,
) -> AssetRegistry:
    """Convenience factory."""
    return AssetRegistry(path or _DEFAULT_REGISTRY_PATH)


def verify_draft_claims(
    draft_text: str,
    registry: AssetRegistry,
) -> list[str]:
    """Scan draft text for asset ID references and verify their status.

    Returns a list of violation messages. Empty list = safe to send.
    """
    violations: list[str] = []

    # Find all asset IDs mentioned in the draft
    for asset_id, asset in registry.all().items():
        if asset_id.lower() in draft_text.lower() and not registry.is_safe_to_claim(asset_id):
            violations.append(
                f"Asset '{asset_id}' is '{asset.status}' but draft references it as shipped. "
                f"Blocking until status is 'shipped'."
            )

    return violations
