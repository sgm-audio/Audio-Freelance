"use client";

import { useEffect, useState } from "react";
import { fetchProfile, saveProfile, ProfileData, fetchCompanies, CompaniesData, addCompany, removeCompany, fetchConfigStatus, updateSearchKeys, ConfigStatus } from "@/lib/api";

export default function PreferencesPage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [companies, setCompanies] = useState<CompaniesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newAts, setNewAts] = useState("greenhouse");
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [keys, setKeys] = useState({ tavily: "", serper: "", firecrawl: "" });
  const [keysSaving, setKeysSaving] = useState(false);
  const [keysMessage, setKeysMessage] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([fetchProfile(), fetchCompanies()]);
      setProfile(p); setCompanies(c);
    } catch {}
    // Config status is independent; a failure here must not blank the page.
    fetchConfigStatus().then(setConfigStatus).catch(() => {});
    setLoading(false);
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    setMessage("");
    try {
      await saveProfile(profile);
      setMessage("Saved.");
    } catch { setMessage("Save failed."); }
    setSaving(false);
    setTimeout(() => setMessage(""), 3000);
  }

  async function handleSaveKeys() {
    setKeysSaving(true);
    setKeysMessage("");
    try {
      const payload: Record<string, string> = {};
      if (keys.tavily.trim()) payload.tavily_api_key = keys.tavily.trim();
      if (keys.serper.trim()) payload.serper_api_key = keys.serper.trim();
      if (keys.firecrawl.trim()) payload.firecrawl_api_key = keys.firecrawl.trim();
      if (Object.keys(payload).length === 0) {
        setKeysMessage("Enter at least one key.");
        return;
      }
      await updateSearchKeys(payload);
      // Backend returns only configured flags, never the key itself.
      setKeys({ tavily: "", serper: "", firecrawl: "" });
      setConfigStatus(await fetchConfigStatus());
      setKeysMessage("Keys saved on the server.");
    } catch {
      setKeysMessage("Could not save keys. Is the backend running?");
    } finally {
      setKeysSaving(false);
    }
  }

  async function handleAddCompany() {
    if (!newSlug.trim()) return;
    try { await addCompany(newAts, newSlug.trim().toLowerCase()); setNewSlug(""); load(); }
    catch { setMessage("Failed to add company."); setTimeout(() => setMessage(""), 3000); }
  }

  async function handleRemove(ats: string, slug: string) {
    try { await removeCompany(ats, slug); load(); }
    catch { setMessage("Failed to remove company."); setTimeout(() => setMessage(""), 3000); }
  }

  if (loading) return <div className="flex justify-center h-64"><p className="text-muted-foreground animate-pulse mt-16">Loading...</p></div>;
  if (!profile) return <p className="text-muted-foreground mt-16">Backend not available.</p>;

  return (<div className="space-y-8 max-w-2xl">
    <div>
      <h1 className="text-2xl font-semibold">Preferences</h1>
      <p className="text-sm text-muted-foreground mt-1">Profile completeness: {profile.completeness}%</p>
    </div>

    {/* Skills */}
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Skills</h2>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Languages (comma separated)</p>
          <input value={profile.skills.languages.join(", ")} onChange={e=>setProfile({...profile, skills:{...profile.skills, languages:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}})}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" placeholder="c++, rust, python"/>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Frameworks</p>
          <input value={profile.skills.frameworks.join(", ")} onChange={e=>setProfile({...profile, skills:{...profile.skills, frameworks:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}})}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" placeholder="juce, nih-plug, clap-rs"/>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Domains</p>
          <input value={profile.skills.domains.join(", ")} onChange={e=>setProfile({...profile, skills:{...profile.skills, domains:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}})}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" placeholder="real-time audio dsp, plugin development"/>
        </div>
      </div>
    </section>

    {/* Rate & Preferences */}
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Rate & Filters</h2>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Min Project Rate (CAD)</p>
          <input type="number" value={profile.preferences.rate_floor||""} onChange={e=>setProfile({...profile, preferences:{...profile.preferences, rate_floor:parseInt(e.target.value)||0}})}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Min Hourly Rate (CAD)</p>
          <input type="number" value={profile.preferences.hourly_floor||""} onChange={e=>setProfile({...profile, preferences:{...profile.preferences, hourly_floor:parseInt(e.target.value)||0}})}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-xs text-muted-foreground mb-1">Seniority</p>
        <input value={profile.experience.seniority.join(", ")} onChange={e=>setProfile({...profile, experience:{...profile.experience, seniority:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}})}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" placeholder="senior, lead, staff"/>
      </div>
      <div className="mt-4">
        <p className="text-xs text-muted-foreground mb-1">Dealbreakers</p>
        <input value={profile.preferences.dealbreakers.join(", ")} onChange={e=>setProfile({...profile, preferences:{...profile.preferences, dealbreakers:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}})}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" placeholder="revenue share, equity only, unpaid"/>
      </div>
      <div className="mt-4">
        <p className="text-xs text-muted-foreground mb-1">Niches</p>
        <input value={profile.preferences.niches.join(", ")} onChange={e=>setProfile({...profile, preferences:{...profile.preferences, niches:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)}})}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm" placeholder="plugin_dev, rust_audio"/>
      </div>
    </section>

    {/* Portfolio */}
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Portfolio (optional)</h2>
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">GitHub URL</p>
          <input value={profile.portfolio.github} onChange={e=>setProfile({...profile, portfolio:{...profile.portfolio, github:e.target.value}})}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Website</p>
          <input value={profile.portfolio.website} onChange={e=>setProfile({...profile, portfolio:{...profile.portfolio, website:e.target.value}})}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"/>
        </div>
      </div>
    </section>

    {/* Portfolio Files */}
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Portfolio Files</h2>
      <p className="text-xs text-muted-foreground mb-3">Upload your resume or portfolio files (PDF, DOCX, images — max 10MB).</p>
      <div className="rounded-lg border-2 border-dashed border-border p-6 text-center mb-3">
        <p className="text-sm text-muted-foreground mb-2">Click to browse for files</p>
        <input type="file" accept=".pdf,.doc,.docx,image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const formData = new FormData();
            formData.append("file", file);
            formData.append("file_type", "resume");
            try {
              const res = await fetch("/api/v1/profile/upload", { method: "POST", body: formData });
              if (res.ok) {
                const data = await res.json();
                setProfile({
                  ...profile,
                  portfolio: {
                    ...profile.portfolio,
                    portfolio_files: [...(profile.portfolio.portfolio_files || []), data],
                  },
                });
              }
            } catch {}
          }}
          className="text-sm"
        />
      </div>
      {(profile.portfolio.portfolio_files || []).length > 0 && (
        <div className="space-y-1">
          {(profile.portfolio.portfolio_files || []).map((f, i) => (
            <div key={i} className="flex items-center justify-between text-sm bg-card border border-border rounded-md px-3 py-2">
              <span>{f.filename}</span>
              <button
                onClick={() => setProfile({
                  ...profile,
                  portfolio: {
                    ...profile.portfolio,
                    portfolio_files: (profile.portfolio.portfolio_files || []).filter((_, j) => j !== i),
                  },
                })}
                className="text-xs text-muted-foreground hover:text-red-400"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </section>

    {/* Companies */}
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Tracked Companies</h2>
      {companies && (
        <div className="space-y-4">
          {(["greenhouse","lever","ashby"] as const).map(ats => (
            <div key={ats}>
              <p className="text-xs text-muted-foreground capitalize mb-1">{ats} ({companies[ats]?.length||0})</p>
              <div className="flex flex-wrap gap-1">
                {companies[ats]?.map(slug => (
                  <span key={slug} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs bg-card">
                    {slug}
                    <button onClick={()=>handleRemove(ats,slug)} className="text-muted-foreground hover:text-red-400 ml-1">×</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <select value={newAts} onChange={e=>setNewAts(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1 text-xs">
              <option value="greenhouse">Greenhouse</option>
              <option value="lever">Lever</option>
              <option value="ashby">Ashby</option>
            </select>
            <input value={newSlug} onChange={e=>setNewSlug(e.target.value)}
              placeholder="company-slug" className="flex-1 rounded-md border border-border bg-card px-3 py-1 text-xs"/>
            <button onClick={handleAddCompany} className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-xs">Add</button>
          </div>
        </div>
      )}
    </section>

    {/* Blocked Companies */}
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Blocked Companies</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Leads mentioning these companies will be hidden from all search results.
        Block companies you don&apos;t want to see (e.g., past employers, competitors).
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {profile.preferences.blocked_companies?.map((c: string) => (
          <span key={c} className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-0.5 text-xs bg-red-500/10 text-red-400">
            {c}
            <button onClick={() => setProfile({...profile, preferences: {...profile.preferences, blocked_companies: profile.preferences.blocked_companies?.filter((x: string) => x !== c)}})}
              className="ml-1 hover:text-red-300">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input id="block-input"
          placeholder="Company name or domain" className="flex-1 rounded-md border border-border bg-card px-3 py-1 text-xs"
          onKeyDown={e => {
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value.trim().toLowerCase();
              if (val && !(profile.preferences.blocked_companies || []).includes(val)) {
                setProfile({...profile, preferences: {...profile.preferences, blocked_companies: [...(profile.preferences.blocked_companies || []), val]}});
              }
              (e.target as HTMLInputElement).value = "";
            }
          }}
        />
        <button onClick={() => {
          const input = document.getElementById("block-input") as HTMLInputElement;
          const val = input.value.trim().toLowerCase();
          if (val && !(profile.preferences.blocked_companies || []).includes(val)) {
            setProfile({...profile, preferences: {...profile.preferences, blocked_companies: [...(profile.preferences.blocked_companies || []), val]}});
          }
          input.value = "";
        }} className="rounded-md border border-red-500/30 text-red-400 px-3 py-1 text-xs hover:bg-red-500/10">Add</button>
      </div>
    </section>

    {/* Search API Keys */}
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Search API Keys</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Keys are stored on the backend and never sent to or shown in the browser. The backend&apos;s own
        <code className="text-foreground"> API_KEY</code> stays server-side and cannot be changed here.
        Web prospecting needs at least one of these; ATS company lists work without them.
      </p>
      <div className="space-y-4">
        {([
          { id: "tavily", label: "Tavily", configured: configStatus?.tavily, placeholder: "tvly-..." },
          { id: "serper", label: "Serper", configured: configStatus?.serper, placeholder: "..." },
          { id: "firecrawl", label: "Firecrawl", configured: configStatus?.firecrawl, placeholder: "..." },
        ] as const).map(({ id, label, configured, placeholder }) => (
          <div key={id}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase mb-1">{label} API key</p>
              <span className={`text-xs ${configured ? "text-green-400" : "text-muted-foreground"}`}>
                {configured ? "Configured" : "Not set"}
              </span>
            </div>
            <input
              type="password"
              value={keys[id]}
              onChange={e => setKeys({ ...keys, [id]: e.target.value })}
              placeholder={configured ? "Leave blank to keep current key" : placeholder}
              autoComplete="off"
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-4">
        <button onClick={handleSaveKeys} disabled={keysSaving}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
          {keysSaving ? "Saving..." : "Save Keys"}
        </button>
        {keysMessage && <span className="text-sm text-muted-foreground">{keysMessage}</span>}
      </div>
    </section>

    {/* Save */}
    
    <div className="flex items-center gap-4">
      <button onClick={handleSave} disabled={saving}
        className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-50">
        {saving ? "Saving..." : "Save Profile"}
      </button>
      {message && <span className={message.includes("failed")?"text-red-400 text-sm":"text-green-400 text-sm"}>{message}</span>}
    </div>
  </div>);
}
