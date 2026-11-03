# Over-Engineering Audit: TS Monorepo Packages vs Python Backend

**Audit scope:** pnpm monorepo packages/ (core, ingest, enrich, score, send, ops, draft, approve, followup, cli) vs Python backend (api/, graph/, scoring/, leads/, generate/, search/)

**Method:** Compared every TS package source file against every Python backend file, identifying duplicated pipeline stages, abstractions with one implementation, dead code, reimplemented stdlib, and logic squeezed across many files.

**Ponytail mode:** full — shortest working diff wins, stdlib and native first.

---

1. `delete packages/enrich/llm.ts (lines 96-127) duplicates DeepSeek/Ollama/fixture fallback in draft/llm.ts (lines 101-130). Delete enrich/llm.ts, re-export from draft/llm.ts. [packages/enrich/llm.ts]`

2. `delete packages/score/signals.ts (lines 1-85) duplicates regex signal extraction in scoring/signals.py (lines 1-238). Consolidate to Python module, delete TS version. [packages/score/signals.ts]`

3. `delete packages/core/schemas.ts Zod schemas (lines 1-134) overlap with leads/schema.py Pydantic models (lines 1-100) for Lead/Company/Contact/Fact. Import from Python models, delete TS schemas. [packages/core/schemas.ts]`

4. `delete packages/enrich/contacts.ts (lines 1-62) has email regex + contact extraction duplicated in search/base.py (lines 30-48). Consolidate to one implementation. [packages/enrich/contacts.ts]`

5. `shrink packages/enrich/run.ts (lines 1-186) implements 4-stage pipeline (scrape→LLM→facts→contacts) mirroring graph/pipeline.py (lines 65-213) search→dedup→fetch→score structure. Reduce to shared pipeline logic. [packages/enrich/run.ts]`

6. `delete packages/ingest/sources/ (4 parsers: appstore-auv3, salesnav-csv, upwork-rss, jobboards) and search/tier1-5.py (4-tier search with Tavily→Serper→Firecrawl fallbacks) both implement 4 discovery mechanisms for lead discovery. Ingest sources could subsume search tiers. [packages/ingest/]`

7. `delete packages/draft/validate.ts (lines 1-71) validates with ban list + claims allowlist + word limit while generate/outreach.py (line 147) uses verify_draft_claims against AssetRegistry. Consolidate LLM output validation. [packages/draft/validate.ts]`

8. `delete packages/core/claims.ts (lines 1-19) + draft/claims-lint.ts (lines 1-44) have allowlist mechanisms while generate/outreach.py (line 147) has verify_draft_claims; three implementations of anti-fabrication. Consolidate to one. [packages/core/claims.ts]`

9. `delete packages/core/repo.ts normalizeDomain (lines 28-38) and leads/store.py canonicalize_url (lines 49-69) both normalize URLs for dedupe. Consolidate to one URL normalization utility. [packages/core/repo.ts]`

10. `shrink packages/enrich/llm.ts extractFactsWithRetry (lines 157-201) and search/base.py _tavily_search/_serper_search/_firecrawl_search (lines 118-217) all use identical tenacity retry pattern (stop_after_attempt(3), wait_exponential). Share common retry utility. [packages/enrich/llm.ts]`

11. `delete packages/cli/enrich.ts loadFixtures (lines 33-41) and packages/enrich/run.ts fixtures parameter (lines 28-29) both support fixture-based offline mode. Consolidate fixture loading logic. [packages/cli/enrich.ts]`

12. `shrink packages/core/repo.ts getPipelineStatus (lines 272-314) and leads/store.py get_leads_by_status (lines 271-281) both track lead counts by state. Share status tracking logic. [packages/core/repo.ts]`

13. `delete packages/draft/llm.ts createDraftLlmClient (lines 101-130) and packages/enrich/llm.ts createLlmClient (lines 96-127) both have DeepSeek→Ollama→fixture fallback with same priority order. Delete one, re-export from the other. [packages/draft/llm.ts]`

14. `shrink packages/core/schemas.ts defines 15+ Zod schemas (lines 1-134) while leads/schema.py has fewer Pydantic models (lines 1-100). TS core could use fewer, more consolidated schemas. [packages/core/schemas.ts]`

15. `shrink packages/score/signals.ts scoreLeadInput (lines 42-56) fixed weights (+30 segment, +20 team, +20 shipping, +15 technical contact, +15 hiring, -50 no contact) and scoring/signals.py POSITIVE/NEGATIVE_SIGNALS tuples (lines 25-91) both define signal→points mappings; TS uses fixed code weights while Python uses configurable tuples. [packages/score/signals.ts]`