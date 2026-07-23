import {
    ensureLead,
    upsertCompany,
    type OutreachDb,
} from "@sgm-outreach/core";
import { z } from "zod";
export const AddCompanyInputSchema = z.object({
    name: z.string().min(1),
    domain: z.string().min(1),
    segment: z.string().min(1).default("music-tech"),
    tier: z.number().int().nonnegative().default(1),
    channel: z.enum(["email", "linkedin", "upwork"]).default("email"),
});
export type AddCompanyInput = z.infer<typeof AddCompanyInputSchema>;

export function addCompany(db: OutreachDb, raw: unknown): {
    created: boolean;
    company_id: string;
    lead_created: boolean;
} {
    const input = AddCompanyInputSchema.parse(raw);
    const { company, created } = upsertCompany(db, {
        name: input.name,
        domain: input.domain,
        segment: input.segment,
        tier: input.tier,
        source: "manual",
    });
    const { created: leadCreated } = ensureLead(db, {
        company_id: company.id,
        channel: input.channel,
    });
    return {
        created,
        company_id: company.id,
        lead_created: leadCreated,
    };
}
//# sourceMappingURL=add-company.js.map