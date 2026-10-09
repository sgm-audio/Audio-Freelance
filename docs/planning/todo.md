# TODO: Audio / Automation / Custom User Types

## Phase 0: Setup
- [ ] /compact
- [ ] Save todo to agentmemory
- [ ] Write todo.md

## Phase 1: Backend foundation
- [ ] config.py: user_type + automation_niches (5 niches)
- [ ] scoring/profile.py: user_type field
- [ ] leads/schema.py: PREFERRED_NICHES union + relaxed validator

## Phase 2: Automation niches
- [ ] scoring/signals.py: 6 automation signals
- [ ] search/tier1.py: 5 automation query lists
- [ ] search/tier2.py: 5 automation query lists
- [ ] search/tier3.py: 5 automation query lists
- [ ] search/tier4.py: 5 automation query lists + seed companies
- [ ] generate/outreach.py: E_automation + F_ai_automation templates

## Phase 3: Custom niches
- [ ] search/base.py: generic_queries() helper
- [ ] tier1-4: fallback to generic_queries
- [ ] api/routes.py: _is_valid_nice() helper

## Phase 4: Frontend
- [ ] lib/api.ts: user_type in ProfileData
- [ ] setup/page.tsx: user type selector (skippable) + conditional options + custom disclaimer
- [ ] preferences/page.tsx: user type + custom disclaimer
- [ ] page.tsx: dynamic quick actions + custom disclaimer
- [ ] prospect/[niche]/page.tsx: custom niche disclaimer

## Phase 5: Tests + verification
- [ ] Update test_schema.py, test_score.py
- [ ] Add test_automation.py, test_custom_niche.py
- [ ] Full test suite
- [ ] ruff check
- [ ] next build