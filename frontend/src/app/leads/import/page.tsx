"use client";

import { useCallback, useState } from "react";
import { bulkImportLeads, ManualLeadRequest } from "@/lib/api";

const NICHES = ["plugin_dev", "reaper_scripts", "rust_audio", "audio_ml", "game_audio_dev"];

interface ParsedLead {
  title: string;
  url: string;
  snippet: string;
  source: string;
  company: string;
  niche: string;
}

function parseCSV(text: string): ParsedLead[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const titleIdx = header.indexOf("title");
  const urlIdx = header.indexOf("url");
  const snippetIdx = header.indexOf("snippet");
  if (titleIdx === -1 || urlIdx === -1 || snippetIdx === -1) return [];

  const sourceIdx = header.indexOf("source");
  const companyIdx = header.indexOf("company");
  const nicheIdx = header.indexOf("niche");

  const leads: ParsedLead[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const title = cols[titleIdx];
    const url = cols[urlIdx];
    const snippet = cols[snippetIdx];
    if (!title || !url || !snippet) continue;
    leads.push({
      title,
      url,
      snippet,
      source: sourceIdx >= 0 ? cols[sourceIdx] || "manual" : "manual",
      company: companyIdx >= 0 ? cols[companyIdx] || "" : "",
      niche: nicheIdx >= 0 && NICHES.includes(cols[nicheIdx]) ? cols[nicheIdx] : "plugin_dev",
    });
  }
  return leads;
}

function parseJSON(text: string): ParsedLead[] {
  try {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : [data];
    return arr
      .filter((item: Record<string, unknown>) => item.title && item.url && item.snippet)
      .map((item: Record<string, unknown>) => ({
        title: String(item.title),
        url: String(item.url),
        snippet: String(item.snippet),
        source: String(item.source || "manual"),
        company: String(item.company || ""),
        niche: NICHES.includes(String(item.niche)) ? String(item.niche) : "plugin_dev",
      }));
  } catch {
    return [];
  }
}

export default function BulkImportPage() {
  const [input, setInput] = useState("");
  const [parsed, setParsed] = useState<ParsedLead[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: { title: string; error: string }[]; total: number } | null>(null);
  const [parseError, setParseError] = useState("");

  const handleParse = useCallback(() => {
    setParseError("");
    setResult(null);
    if (!input.trim()) {
      setParsed([]);
      return;
    }

    // Try JSON first, then CSV
    let leads = parseJSON(input);
    if (leads.length === 0) {
      leads = parseCSV(input);
    }
    if (leads.length === 0) {
      setParseError("Could not parse input. Provide a JSON array or CSV with title,url,snippet columns.");
      setParsed([]);
      return;
    }
    setParsed(leads);
  }, [input]);

  const handleImport = useCallback(async () => {
    if (parsed.length === 0) return;
    setImporting(true);
    setResult(null);
    try {
      const leads: ManualLeadRequest[] = parsed.map((p) => ({
        title: p.title,
        url: p.url,
        snippet: p.snippet,
        source: p.source,
        company: p.company || undefined,
        niche: p.niche,
      }));
      const res = await bulkImportLeads(leads);
      setResult(res);
    } catch (e: unknown) {
      setResult({ imported: 0, errors: [{ title: "Request failed", error: (e as Error).message || "Unknown error" }], total: parsed.length });
    }
    setImporting(false);
  }, [parsed]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setInput(String(reader.result || ""));
    };
    reader.readAsText(file);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bulk Import</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Paste JSON or CSV to import multiple leads at once. Max 100 per batch.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-accent cursor-pointer">
            Upload CSV/JSON
            <input type="file" accept=".csv,.json" onChange={handleFile} className="hidden" />
          </label>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Paste JSON array:\n[{"title":"C++ DSP Developer","url":"https://...","snippet":"Need C++ developer...","source":"upwork","niche":"plugin_dev"}]\n\nOr CSV:\ntitle,url,snippet,source,niche\n"C++ DSP Developer","https://...","Need C++ developer...","upwork","plugin_dev"`}
          rows={12}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y"
        />

        <button
          type="button"
          onClick={handleParse}
          disabled={!input.trim()}
          className="rounded-md border border-border bg-card px-4 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
        >
          Parse
        </button>
      </div>

      {parseError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 text-red-400 px-4 py-3 text-sm">
          {parseError}
        </div>
      )}

      {parsed.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{parsed.length} leads parsed</p>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {importing ? "Importing..." : `Import ${parsed.length} Leads`}
            </button>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-3 py-2 text-xs text-muted-foreground">Title</th>
                  <th className="text-left px-3 py-2 text-xs text-muted-foreground">Source</th>
                  <th className="text-left px-3 py-2 text-xs text-muted-foreground">Niche</th>
                  <th className="text-left px-3 py-2 text-xs text-muted-foreground">Company</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 20).map((lead, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-2 truncate max-w-xs">{lead.title}</td>
                    <td className="px-3 py-2 text-muted-foreground">{lead.source}</td>
                    <td className="px-3 py-2 text-muted-foreground">{lead.niche}</td>
                    <td className="px-3 py-2 text-muted-foreground">{lead.company || "—"}</td>
                  </tr>
                ))}
                {parsed.length > 20 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-muted-foreground text-center">
                      ...and {parsed.length - 20} more
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className={`rounded-lg border p-4 ${result.errors.length > 0 ? "border-amber-500/30 bg-amber-500/10" : "border-green-500/30 bg-green-500/10"}`}>
          <p className="font-semibold">
            Imported {result.imported} of {result.total} leads
          </p>
          {result.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-sm text-amber-400">{result.errors.length} errors:</p>
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  <span className="font-medium">{err.title}</span>: {err.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}