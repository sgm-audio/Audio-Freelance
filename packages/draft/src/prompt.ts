import type { Channel, Contact, Fact } from "@sgm-outreach/core";

export const OFFER_SENTENCE =
  "I build real-time audio DSP engines (C++/Rust) for iOS apps, plugins, and embedded hardware — on-device ML included; fixed-scope or retainer.";

export const CREDIBILITY_LINE =
  "Currently shipping a portamento engine for an iOS synth client; TrackClear is live on ReaPack.";

export function buildDraftPrompt(input: {
  channel: Channel;
  contact: Contact;
  companyName: string;
  fact: Fact;
  claimsTexts: string[];
}): string {
  const wordMax =
    input.channel === "email"
      ? 120
      : input.channel === "linkedin"
        ? 80
        : 200;
  return `You write cold outreach for Scott (SGM Studios). Return JSON only:
{"subject":"...optional for email...","body":"...","fact_used":"...","risk_flags":[]}

Rules:
- Channel: ${input.channel}. Body ≤${wordMax} words.
- Structure: observation (must use the fact) → credibility → offer → 20-min call CTA.
- Fact (must use): ${input.fact.fact}
- Evidence URL (do not invent): ${input.fact.evidence_url}
- Contact: ${input.contact.name}${input.contact.role ? ` (${input.contact.role})` : ""} at ${input.companyName}
- Credibility must only use these allowlisted claims: ${input.claimsTexts.join(" | ")}
- Offer: ${OFFER_SENTENCE}
- Ban: "I hope this finds you well", "I came across", "synergy", em-dash chains.
- Do NOT invent credentials. Temperature intent: concise, concrete.
- CASL footer is appended later — do not include unsubscribe/legal footer.`;
}

/** Offline fixture draft when no LLM is available. */
export function fixtureDraftOutput(input: {
  channel: Channel;
  contact: Contact;
  companyName: string;
  fact: Fact;
}): {
  subject?: string;
  body: string;
  fact_used: string;
  risk_flags: string[];
} {
  const first = input.contact.name.split(/\s+/)[0] ?? input.contact.name;
  const body = [
    `Hi ${first} — noticed ${input.fact.fact} at ${input.companyName}.`,
    CREDIBILITY_LINE,
    OFFER_SENTENCE.replace(" — ", "; ").replace("—", "-"),
    "Open to a 20-minute call next week?",
  ].join(" ");

  const out: {
    subject?: string;
    body: string;
    fact_used: string;
    risk_flags: string[];
  } = {
    body,
    fact_used: input.fact.fact,
    risk_flags: [],
  };
  if (input.channel === "email") {
    out.subject = `${input.companyName} + real-time DSP`;
  }
  return out;
}
