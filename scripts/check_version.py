#!/usr/bin/env python3
"""Fail when public application surfaces drift from VERSION."""

from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$")


def json_version(path: str) -> str:
    return str(json.loads((ROOT / path).read_text(encoding="utf-8"))["version"])


def toml_version(path: str, section: str) -> str:
    data = tomllib.loads((ROOT / path).read_text(encoding="utf-8"))
    return str(data[section]["version"])


def cargo_lock_desktop_version() -> str:
    content = (ROOT / "desktop/src-tauri/Cargo.lock").read_text(encoding="utf-8")
    match = re.search(r'\[\[package\]\]\nname = "desktop"\nversion = "([^"]+)"', content)
    if not match:
        raise ValueError("desktop package missing from Cargo.lock")
    return match.group(1)


def compose_versions() -> set[str]:
    content = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    return set(re.findall(r"audio-freelance-(?:backend|frontend):([^}]+)}", content))


def main() -> int:
    if not SEMVER.fullmatch(VERSION):
        print(f"VERSION is not valid SemVer: {VERSION!r}", file=sys.stderr)
        return 1

    public = {
        "pyproject.toml": toml_version("pyproject.toml", "project"),
        "frontend/package.json": json_version("frontend/package.json"),
        "frontend/package-lock.json": json_version("frontend/package-lock.json"),
        "desktop/package.json": json_version("desktop/package.json"),
        "desktop/package-lock.json": json_version("desktop/package-lock.json"),
        "desktop/src-tauri/Cargo.toml": toml_version("desktop/src-tauri/Cargo.toml", "package"),
        "desktop/src-tauri/Cargo.lock": cargo_lock_desktop_version(),
        "desktop/src-tauri/tauri.conf.json": json_version("desktop/src-tauri/tauri.conf.json"),
    }
    failures = [f"{path}: {value}" for path, value in public.items() if value != VERSION]
    for value in compose_versions():
        if value != VERSION:
            failures.append(f"docker-compose.yml image default: {value}")

    for manifest in sorted((ROOT / "packages").glob("*/package.json")):
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if data.get("private") is not True or data.get("version") != "0.0.0":
            failures.append(f"{manifest.relative_to(ROOT)} must remain private at 0.0.0")

    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    if f"## [v{VERSION}]" not in changelog and f"## [{VERSION}]" not in changelog:
        failures.append(f"CHANGELOG.md has no section for {VERSION}")

    if failures:
        print("Version consistency check failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print(f"Version consistency check passed: {VERSION}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
