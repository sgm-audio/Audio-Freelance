const API = "/api/v1";

// ponytail: simple TTL cache — upgrade to React Query when traffic justifies it
type CacheEntry = { data: unknown; ts: number };
const _cache = new Map<string, CacheEntry>();
const _TTL = 30_000; // 30s

function _cacheGet<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < _TTL) return Promise.resolve(hit.data as T);
  return fetcher().then((data) => {
    _cache.set(key, { data, ts: Date.now() });
    return data;
  });
}

export function clearFetchCache() {
  _cache.clear();
}

async function get<T>(path: string, timeoutMs = 10000): Promise<T> {
  return _cacheGet(path, () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(`${API}${path}`, { signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error(`${res.status} ${res.statusText}`); return res.json(); })
      .finally(() => clearTimeout(timer));
  });
}

async function post<T>(path: string, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, { method: "POST", signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export interface LeadCounts {
  NEW?: number; HOT?: number; WARM?: number; COLD?: number;
  CONTACTED?: number; REPLIED?: number; PROPOSAL_SENT?: number;
  SKIPPED?: number; WON?: number; LOST?: number; DEAD?: number;
}

export interface StatusResponse {
  lead_counts: LeadCounts;
  ollama_available: boolean;
  timestamp: string;
}

export interface Lead {
  id: string; source: string; tier: number; title: string; company?: string;
  url: string; raw_text: string; niche: string; signals: Record<string, number>;
  score: number; verdict: "HOT" | "WARM" | "COLD" | "SKIP"; status: string;
  contact_path?: string; discovered_at: string; last_updated: string; notes?: string;
}

export interface HealthResponse {
  status: string; ollama: boolean; timestamp: string;
}

export interface TechTrend {
  technology: string; mentions: number; direction: "rising" | "stable" | "declining"; contexts: string[];
}

export interface PricingBenchmark {
  niche: string; contract_range_min: number; contract_range_max: number;
  hourly_min: number; hourly_max: number; sample_count: number;
}

export interface MarketSignal {
  category: string; source: string; title: string; url: string;
  snippet: string; relevance: number; tags: string[];
}

export interface MarketReport {
  scanned_at: string; summary: string; total_signals: number;
  signals: MarketSignal[]; tech_trends: TechTrend[]; pricing_benchmarks: PricingBenchmark[]; hot_opportunities: string[];
}

export interface ProspectResult {
  niche: string; total_candidates: number; total_leads: number;
  hot: number; warm: number; cold: number; skipped: number;
  archived: number; archive_path: string;
  hot_leads: Lead[]; warm_leads: Lead[]; errors: string[];
}

export interface TrackingEvent {
  at: string; type: string; data: Record<string, unknown>; lead_id?: string;
}

export interface ActivePursuit {
  lead: Lead;
  last_event: TrackingEvent | null;
  total_events: number;
}

export interface WonLostSummary {
  won: number; lost: number; active_pursuits: number; win_rate: number;
  by_niche: { won: Record<string, number>; lost: Record<string, number> };
  timestamp: string;
}

export interface ColdLeadsResponse {
  count: number; leads: Lead[];
}

export interface ColdStats {
  total_archived: number;
  by_niche: Record<string, number>;
  by_source: Record<string, number>;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return get("/health");
}

export async function fetchStatus(): Promise<StatusResponse> {
  return get("/status");
}

export async function fetchLeads(status?: string): Promise<{ count: number; leads: Lead[] }> {
  const qs = status ? `?status=${status}` : "";
  return get(`/leads${qs}`);
}

export async function fetchMarket(): Promise<MarketReport> {
  return get("/market", 60000);
}

export async function fetchMarketTrends(): Promise<{
  scanned_at: string; tech_trends: TechTrend[];
}> {
  return get("/market/trends", 60000);
}

export async function fetchMarketPricing(): Promise<{
  scanned_at: string; pricing_benchmarks: PricingBenchmark[];
}> {
  return get("/market/pricing", 60000);
}

export async function fetchMarketOpportunities(): Promise<{
  scanned_at: string; summary: string; opportunities: string[]; recent_signals: MarketSignal[];
}> {
  return get("/market/opportunities", 60000);
}

export async function prospectNiche(niche: string): Promise<ProspectResult> {
  return post(`/prospect/${niche}`, 120000);
}

export async function fetchColdLeads(days?: number, niche?: string): Promise<ColdLeadsResponse> {
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (niche) params.set("niche", niche);
  const qs = params.toString();
  return get(`/leads/cold${qs ? `?${qs}` : ""}`);
}

export async function fetchColdStats(): Promise<ColdStats> {
  return get("/leads/cold/stats");
}

export async function rotateColdLeads(days = 3): Promise<{ archived: number; deleted: number; message: string }> {
  return post(`/leads/rotate-cold?days=${days}`);
}

export async function fetchTracking(limit = 50): Promise<{ count: number; events: TrackingEvent[] }> {
  return get(`/tracking?limit=${limit}`);
}

export async function fetchLeadTracking(leadId: string): Promise<{
  lead_id: string; lead_title: string; lead_status: string; events: TrackingEvent[];
}> {
  return get(`/tracking/${leadId}`);
}

export async function fetchActivePursuits(): Promise<{ count: number; active: ActivePursuit[] }> {
  return get("/tracking/active");
}

export async function fetchWonLost(): Promise<WonLostSummary> {
  return get("/tracking/won-lost");
}

// ── Profile ──

export interface ProfileData {
  identity: { name: string; location: string; timezone: string; remote_ok: boolean; relocation_ok: boolean };
  skills: { languages: string[]; frameworks: string[]; domains: string[]; specializations: string[] };
  preferences: { niches: string[]; excluded_niches: string[]; dealbreakers: string[]; blocked_companies: string[]; rate_floor: number; hourly_floor: number; contract_types: string[] };
  experience: { years: number | null; seniority: string[] };
  portfolio: { github: string; website: string; notable_work: string[]; portfolio_files: { filename: string; path: string; type: string; uploaded_at: string }[] };
  completeness: number;
  is_empty: boolean;
}

export interface ProfileStatus { exists: boolean; is_empty: boolean; completeness: number; }

export async function fetchProfileStatus(): Promise<ProfileStatus> {
  return get("/profile/status");
}

export async function fetchProfile(): Promise<ProfileData> {
  return get("/profile");
}

export async function saveProfile(data: Record<string, unknown> | ProfileData): Promise<{ status: string; profile: ProfileData }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API}/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } finally { clearTimeout(timer); }
}

// ── Companies ──

export interface CompaniesData {
  greenhouse: string[]; lever: string[]; ashby: string[]; total: number;
}

export async function fetchCompanies(): Promise<CompaniesData> {
  return get("/companies");
}

export async function addCompany(ats: string, slug: string): Promise<{ status: string }> {
  return post(`/companies?ats=${ats}&slug=${encodeURIComponent(slug)}`);
}

export async function removeCompany(ats: string, slug: string): Promise<{ status: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API}/companies?ats=${ats}&slug=${encodeURIComponent(slug)}`, {
      method: "DELETE",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } finally { clearTimeout(timer); }
}

// ── Rotation status ──

export interface RotationStatus {
  last_rotation: string | null;
  hours_ago: number | null;
  rotation_due_days: number;
}

export async function fetchRotationStatus(): Promise<RotationStatus> {
  return get("/leads/rotation-status");
}

// ── Blocked companies ──

export async function fetchBlockedCompanies(): Promise<{ blocked_companies: string[] }> {
  return get("/profile/blocked");
}

export async function addBlockedCompany(company: string): Promise<{ status: string; blocked_companies: string[] }> {
  return post(`/profile/blocked?company=${encodeURIComponent(company)}`);
}

export async function removeBlockedCompany(company: string): Promise<{ status: string; blocked_companies: string[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API}/profile/blocked?company=${encodeURIComponent(company)}`, {
      method: "DELETE", signal: controller.signal,
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } finally { clearTimeout(timer); }
}
