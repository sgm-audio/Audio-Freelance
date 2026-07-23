import {
    ensureLead,
    insertContact,
    normalizeDomain,
    upsertCompany,
    type OutreachDb,
} from "@sgm-outreach/core";
import { IngestCandidateSchema, type IngestWriteResult } from "./types.js";

export function writeCandidates(
    db: OutreachDb,
    raw: unknown[],
): IngestWriteResult {
    const result = {
        companies_created: 0,
        companies_deduped: 0,
        contacts_created: 0,
        leads_created: 0,
        skipped_invalid: 0,
    };
    const run = db.transaction((items) => {
        for (const item of items) {
            const parsed = IngestCandidateSchema.safeParse(item);
            if (!parsed.success) {
                result.skipped_invalid += 1;
                continue;
            }
            const c = parsed.data;
            if (!normalizeDomain(c.domain)) {
                result.skipped_invalid += 1;
                continue;
            }
            const { company, created } = upsertCompany(db, {
                name: c.name,
                domain: c.domain,
                tier: c.tier,
                segment: c.segment,
                source: c.source,
            });
            if (created)
                result.companies_created += 1;
            else
                result.companies_deduped += 1;
            let contactId = null;
            if (c.contact) {
                const contact = insertContact(db, {
                    company_id: company.id,
                    name: c.contact.name,
                    role: c.contact.role ?? null,
                    email: c.contact.email ?? null,
                    linkedin_url: c.contact.linkedin_url ?? null,
                    email_source: c.source,
                });
                contactId = contact.id;
                result.contacts_created += 1;
            }
            const { created: leadCreated } = ensureLead(db, {
                company_id: company.id,
                contact_id: contactId,
                channel: c.channel,
            });
            if (leadCreated)
                result.leads_created += 1;
        }
    });
    run(raw);
    return result;
}
//# sourceMappingURL=write.js.map