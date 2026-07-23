import {
  findContactByEmail,
  getCompanyById,
  insertContact,
  insertFact,
  listLeadsByState,
  transitionLead,
  type OutreachDb,
} from "@sgm-outreach/core";
import { extractEmailsFromHtml, type ExtractedContact } from "./contacts.js";
import {
  createLlmClient,
  extractFactsWithRetry,
  LlmValidationError,
  type LlmClient,
} from "./llm.js";
import { scrapeCompanySite, type ScrapedPage } from "./scraper.js";

export interface CompanyEnrichFixture {
  pages: Record<string, string> | ScrapedPage[];
  facts?: unknown;
  robotsTxt?: string;
}

export interface RunEnrichOptions {
  db: OutreachDb;
  limit?: number;
  fixtures?: Record<string, CompanyEnrichFixture>;
  fixtureFacts?: Record<string, unknown>;
  live?: boolean;
  llmClient?: LlmClient;
}

export interface RunEnrichStats {
  selected: number;
  enriched: number;
  manual: number;
  failed: number;
  facts_added: number;
  contacts_added: number;
  errors: Array<{ lead_id: string; error: string }>;
}

function fixturePages(
  domain: string,
  fixture: CompanyEnrichFixture,
): ScrapedPage[] {
  if (Array.isArray(fixture.pages)) return fixture.pages;
  return Object.entries(fixture.pages)
    .slice(0, 3)
    .map(([rawPath, html]) => {
      const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
      return {
        url: new URL(path, `https://${domain}`).toString(),
        path,
        html,
      };
    });
}

/** Enrich NEW leads atomically so interrupted runs can safely resume. */
export async function runEnrich(
  options: RunEnrichOptions,
): Promise<RunEnrichStats> {
  const leads = listLeadsByState(options.db, "NEW", options.limit ?? 100);
  const stats: RunEnrichStats = {
    selected: leads.length,
    enriched: 0,
    manual: 0,
    failed: 0,
    facts_added: 0,
    contacts_added: 0,
    errors: [],
  };
  let sharedClient = options.llmClient;
  for (const lead of leads) {
    const company = getCompanyById(options.db, lead.company_id);
    if (!company) {
      stats.failed += 1;
      stats.errors.push({ lead_id: lead.id, error: "Company not found" });
      continue;
    }
    try {
      const fixture = options.fixtures?.[company.domain];
      const pages = fixture
        ? fixturePages(company.domain, fixture)
        : options.live === true
          ? await scrapeCompanySite({ domain: company.domain })
          : [];
      if (pages.length === 0) {
        throw new Error(
          `No fixture pages for ${company.domain}; enable live enrichment`,
        );
      }
      const contacts: ExtractedContact[] = pages.flatMap((page) =>
        extractEmailsFromHtml(page.html, page.url, company.domain),
      );
      const uniqueContacts = [
        ...new Map(contacts.map((contact) => [contact.email, contact])).values(),
      ];
      const fixtureFacts =
        options.fixtureFacts?.[company.domain] ?? fixture?.facts;
      const client =
        fixtureFacts !== undefined
          ? await createLlmClient({ fixture: fixtureFacts })
          : (sharedClient ??= await createLlmClient());
      try {
        const extracted = await extractFactsWithRetry(pages, { client });
        let factsAdded = 0;
        let contactsAdded = 0;
        options.db.transaction(() => {
          for (const fact of extracted.facts) {
            insertFact(options.db, {
              company_id: company.id,
              fact: fact.fact,
              evidence_url: fact.evidence_url,
            });
            factsAdded += 1;
          }
          for (const contact of uniqueContacts) {
            if (findContactByEmail(options.db, contact.email)) continue;
            insertContact(options.db, {
              company_id: company.id,
              name: contact.name,
              role: contact.role,
              email: contact.email,
              email_source: contact.email_source,
            });
            contactsAdded += 1;
          }
          transitionLead(options.db, lead.id, "ENRICHED", {
            enrichment: {
              provider: client.kind,
              pages: pages.map((page) => page.url),
              signals: extracted.signals,
              needs_manual: extracted.needs_manual ?? false,
              fact_count: factsAdded,
              contact_count: contactsAdded,
            },
          });
        })();
        stats.enriched += 1;
        if (extracted.needs_manual === true) stats.manual += 1;
        stats.facts_added += factsAdded;
        stats.contacts_added += contactsAdded;
      } catch (error) {
        if (!(error instanceof LlmValidationError)) throw error;
        let contactsAdded = 0;
        options.db.transaction(() => {
          for (const contact of uniqueContacts) {
            if (findContactByEmail(options.db, contact.email)) continue;
            insertContact(options.db, {
              company_id: company.id,
              name: contact.name,
              role: contact.role,
              email: contact.email,
              email_source: contact.email_source,
            });
            contactsAdded += 1;
          }
          transitionLead(options.db, lead.id, "ENRICHED", {
            enrichment: {
              provider: client.kind,
              pages: pages.map((page) => page.url),
              signals: {},
              needs_manual: true,
              validation_errors: error.issues,
              fact_count: 0,
              contact_count: contactsAdded,
            },
          });
        })();
        stats.enriched += 1;
        stats.manual += 1;
        stats.contacts_added += contactsAdded;
      }
    } catch (error) {
      stats.failed += 1;
      stats.errors.push({
        lead_id: lead.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return stats;
}
