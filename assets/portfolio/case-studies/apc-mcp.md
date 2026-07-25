# Case study: apc-mcp — agent tooling for plugin builds

**Status:** Shipped (public)  
**Role:** Author  
**Stack:** Node.js · MCP · CMake · ctest · clang-format · pluginval · clap-validator  
**Repo:** https://github.com/sgm-audio/apc-mcp

---

## Problem

Audio plugin projects die in the gap between "compiles on my machine" and "validated CLAP/VST3 artifact." Agents and humans both need a **stable tool surface** for configure → build → test → lint → validate without reinventing shell glue per repo.

## What shipped

- MCP server exposing build/test/lint/validate/scaffold tools for **JUCE / CLAP / VST3 / ARA** projects  
- Works with Claude Code, OpenCode, VS Code MCP, Continue.dev, and other MCP clients  
- Installable via `npx` from the GitHub repo (no separate publish required for trial)  
- CI + LICENSE + CONTRIBUTING present on the public repo

## Why it matters to clients

- Shows production mindset: **validators and CI**, not demo code  
- Speeds contract onboarding — same toolchain language from day one  
- Safe public proof link for cold outreach (no NDAs, no private IP)

## Client-shaped takeaway

Hiring for plugin work? We already automate the boring reliability layer. Your timeline goes to DSP and UX, not fighting CMake.

**Proof:** https://github.com/sgm-audio/apc-mcp
