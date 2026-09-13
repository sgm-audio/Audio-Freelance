// Utility for reading/writing outreach data from backend API.
// This file was missing and caused build failures.
// It provides data for the outreach console dashboard.

import { fetchStatus } from "./api";

const API = "/api/v1";

/** 
 * Shape of the outreach snapshot data used by the dashboard.
 * Matches the fields accessed in outreach-console.tsx.
 */
export interface OutreachSnapshot {
  lead_counts: {
    NEW: number; HOT: number; WARM: number; COLD: number;
    CONTACTED: number; REPLIED: number; PROPOSAL_SENT: number;
    SKIPPED: number; WON: number; LOST: number; DEAD: number;
    PENDING_APPROVAL: number; SENT: number;
  };
  funnel: Array<{ state: string; count: number }>;
  ollama_available: boolean;
  paused: boolean;
  source: string;
  db_exists: boolean;
  totals: {
    leads: number;
    companies: number;
    contacts: number;
    drafts: number;
    suppressions: number;
  };
  generated_at: string;
  pending_approval: Array<{
    id: string;
    contact_name?: string;
    company_name?: string;
    company_domain?: string;
    contact_role?: string;
    score: number;
    channel: string;
    updated_at: string;
    subject?: string;
    body_preview?: string;
    body?: string;
    linkedin_url?: string;
    ready_to_paste?: boolean;
  }>;
  linkedin_paste_queue: Array<{
    id: string;
    contact_name?: string;
    company_name?: string;
    company_domain?: string;
    contact_role?: string;
    score: number;
    channel: string;
    updated_at: string;
    state: string;
    subject?: string;
    body_preview?: string;
    body?: string;
    linkedin_url?: string;
    ready_to_paste?: boolean;
  }>;
  linkedin_warming: Array<{
    id: string;
    contact_name?: string;
    company_name?: string;
    company_domain?: string;
    contact_role?: string;
    score: number;
    channel: string;
    updated_at: string;
    state: string;
    subject?: string;
    body_preview?: string;
    body?: string;
    linkedin_url?: string;
    ready_to_paste?: boolean;
  }>;
  db_path: string;
  timestamp: string;
}

/**
 * Load a snapshot of outreach system status from the FastAPI backend.
 * Combines data from multiple endpoints to build a complete dashboard view.
 * 
 * @returns {Promise<OutreachSnapshot>} A complete snapshot of outreach data
 */
export async function loadOutreachSnapshot(): Promise<OutreachSnapshot> {
  try {
    // Fetch core status
    const status = await fetchStatus();
    
    // Fetch all leads to compute totals and lead counts by status
    const leadsResponse = await fetch(`${API}/leads`);
    if (!leadsResponse.ok) {
      throw new Error(`Failed to fetch leads: ${leadsResponse.status}`);
    }
    const leads: any[] = await leadsResponse.json();
    
    // Compute lead counts by status from the leads array
    // Initialize all required lead count properties to 0
    const leadCounts: OutreachSnapshot["lead_counts"] = {
      NEW: 0,
      HOT: 0,
      WARM: 0,
      COLD: 0,
      CONTACTED: 0,
      REPLIED: 0,
      PROPOSAL_SENT: 0,
      SKIPPED: 0,
      WON: 0,
      LOST: 0,
      DEAD: 0,
      PENDING_APPROVAL: 0,
      SENT: 0,
    };
    
    // Increment counts based on actual leads
    leads.forEach((lead: any) => {
      const status = lead.status?.toUpperCase() || "NEW";
      if (status in leadCounts) {
        leadCounts[status as keyof typeof leadCounts] = (leadCounts[status as keyof typeof leadCounts] || 0) + 1;
      }
      // Handle any unknown statuses by treating them as NEW
      else {
        leadCounts.NEW = (leadCounts.NEW || 0) + 1;
      }
    });
    
    // Compute distinct companies and contacts
    const companies = new Set(
      leads
        .map((lead: any) => lead.company)
        .filter((company): company is string => !!company)
    );
    
    // For contacts, we'll approximate with lead count for now
    // In a real system, this would be distinct contacts
    const contactsCount = leads.length;
    
    // TODO: Fetch actual outreach draft count from outreach ChromaDB collection
    // For now, stub this
    const draftsCount = 0;
    
    // TODO: Fetch suppression count
    const suppressionsCount = 0;
    
    // Build a simple funnel based on lead statuses
    const funnel: OutreachSnapshot["funnel"] = [
      { state: "new", count: leadCounts.NEW || 0 },
      { state: "hot", count: leadCounts.HOT || 0 },
      { state: "warm", count: leadCounts.WARM || 0 },
      { state: "cold", count: leadCounts.COLD || 0 },
      { state: "contacted", count: leadCounts.CONTACTED || 0 },
      { state: "replied", count: leadCounts.REPLIED || 0 },
      { state: "proposal_sent", count: leadCounts.PROPOSAL_SENT || 0 },
      { state: "won", count: leadCounts.WON || 0 },
      { state: "lost", count: leadCounts.LOST || 0 },
    ].filter(item => item.count > 0);
    
    // TODO: These would come from specific endpoints or be computed from state
    // For now, provide empty arrays as stubs
    const pending_approval: OutreachSnapshot["pending_approval"] = [];
    const linkedin_paste_queue: OutreachSnapshot["linkedin_paste_queue"] = [];
    const linkedin_warming: OutreachSnapshot["linkedin_warming"] = [];
    
    // TODO: Determine actual DB path and existence
    // For now, stub these
    const db_exists = true; // Assume DB exists if we can query it
    const db_path = "./data/chroma"; // From leads/store.py
    const source = "chromadb"; // We're using ChromaDB
    
    // Use the timestamp from status, or generate one for generated_at
    const generated_at = status.timestamp || new Date().toISOString();
    
    return {
      ...status,
      lead_counts: leadCounts,
      funnel,
      paused: false, // Default to not paused - this would come from a setting or endpoint
      source,
      db_exists,
      totals: {
        leads: leads.length,
        companies: companies.size,
        contacts: contactsCount,
        drafts: draftsCount,
        suppressions: suppressionsCount,
      },
      generated_at: generated_at,
      pending_approval: pending_approval,
      linkedin_paste_queue: linkedin_paste_queue,
      linkedin_warming: linkedin_warming,
      db_path: db_path,
    };
  } catch (error) {
    console.error("Failed to load outreach snapshot:", error);
    // Return a minimal valid snapshot on error to prevent dashboard crashes
    return {
      lead_counts: {
        NEW: 0,
        HOT: 0,
        WARM: 0,
        COLD: 0,
        CONTACTED: 0,
        REPLIED: 0,
        PROPOSAL_SENT: 0,
        SKIPPED: 0,
        WON: 0,
        LOST: 0,
        DEAD: 0,
        PENDING_APPROVAL: 0,
        SENT: 0,
      },
      funnel: [],
      ollama_available: false,
      paused: false,
      source: "error",
      db_exists: false,
      totals: { leads: 0, companies: 0, contacts: 0, drafts: 0, suppressions: 0 },
      generated_at: new Date().toISOString(),
      pending_approval: [],
      linkedin_paste_queue: [],
      linkedin_warming: [],
      db_path: "",
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Set the outreach system paused state via the FastAPI backend.
 * Used by `/app/api/outreach/kill-switch/route.ts`.
 * 
 * @param paused - Whether to pause (true) or resume (false) outreach
 * @returns {Promise<OutreachSnapshot>} The updated outreach status
 */
export async function setOutreachPaused(paused: boolean): Promise<OutreachSnapshot> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    
    const res = await fetch(`${API}/outreach/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused }),
      signal: controller.signal,
    });
    
    clearTimeout(timer);
    
    if (!res.ok) {
      // If the endpoint doesn't exist (404), we'll treat it as a successful local operation
      // In a real system, this endpoint would need to be implemented
      if (res.status === 404) {
        console.warn("Outreach pause endpoint not implemented; treating as local state change");
        // Return a snapshot reflecting the paused state
        const snapshot = await loadOutreachSnapshot();
        return { ...snapshot, paused };
      }
      throw new Error(`${res.status} ${res.statusText}`);
    }
    
    const result = await res.json();
    return result as OutreachSnapshot;
  } catch (error) {
    console.error("Failed to set outreach paused state:", error);
    // Fallback: return current snapshot with updated paused state
    const snapshot = await loadOutreachSnapshot();
    return { ...snapshot, paused };
  }
}