#!/usr/bin/env python3
"""Update every public application version; private workspaces remain 0.0.0."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$")


def update_json(path: Path, version: str) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    data["version"] = version
    if path.name == "package-lock.json" and "" in data.get("packages", {}):
        data["packages"][""]["version"] = version
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def replace_once(path: Path, pattern: str, replacement: str) -> None:
    content = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, content, count=1)
    if count != 1:
        raise ValueError(f"expected exactly one version match in {path}")
    path.write_text(updated, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("version", help="SemVer without a leading v")
    args = parser.parse_args()
    version = args.version
    if not SEMVER.fullmatch(version):
        parser.error("version must be SemVer without a leading v")

    (ROOT / "VERSION").write_text(version + "\n", encoding="utf-8")
    for relative in [
        "frontend/package.json",
        "frontend/package-lock.json",
        "desktop/package.json",
        "desktop/package-lock.json",
        "desktop/src-tauri/tauri.conf.json",
    ]:
        update_json(ROOT / relative, version)

    replace_once(
        ROOT / "pyproject.toml",
        r'(?m)^(version = ")[^"]+("\s*)$',
        rf"\g<1>{version}\g<2>",
    )
    replace_once(
        ROOT / "desktop/src-tauri/Cargo.toml",
        r'(?m)^(version = ")[^"]+("\s*)$',
        rf"\g<1>{version}\g<2>",
    )
    replace_once(
        ROOT / "desktop/src-tauri/Cargo.lock",
        r'(\[\[package\]\]\nname = "desktop"\nversion = ")[^"]+("\s*)',
        rf"\g<1>{version}\g<2>",
    )
    compose = ROOT / "docker-compose.yml"
    content = compose.read_text(encoding="utf-8")
    content, count = re.subn(
        r"(audio-freelance-(?:backend|frontend):)[^}]+(})",
        rf"\g<1>{version}\g<2>",
        content,
    )
    if count != 2:
        raise ValueError("expected backend and frontend image defaults")
    compose.write_text(content, encoding="utf-8")

    print(f"Updated public application surfaces to {version}.")
    print("Promote the CHANGELOG Unreleased section, then run scripts/check_version.py.")


if __name__ == "__main__":
    main()
