export interface ExtractedContact {
  name: string;
  role: string | null;
  email: string;
  email_source: string;
}

const CONTACT_PATH = /\/(?:contact|about|team|support)(?:\/|$)/i;
const BLOCKED_LOCAL_PART =
  /^(?:no-?reply|donotreply|do-?not-?reply|mailer-daemon|bounce|postmaster|abuse)$/i;
const EMAIL_PATTERN =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;

function normalizeDomain(domain: string): string {
  const raw = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
}

function displayName(localPart: string): string {
  const cleaned = localPart.replace(/[._+-]+/g, " ").trim();
  if (
    !cleaned ||
    /^(?:info|hello|contact|support|sales|jobs|careers)$/i.test(cleaned)
  ) {
    return "Public contact";
  }
  return cleaned.replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Extract publicly posted company-domain addresses from contact-like pages. */
export function extractEmailsFromHtml(
  html: string,
  pageUrl: string,
  companyDomain: string,
): ExtractedContact[] {
  const url = new URL(pageUrl);
  if (!CONTACT_PATH.test(url.pathname)) return [];
  const domain = normalizeDomain(companyDomain);
  const emails = html.match(EMAIL_PATTERN) ?? [];
  const seen = new Set<string>();
  const contacts: ExtractedContact[] = [];
  for (const rawEmail of emails) {
    const email = rawEmail.toLowerCase().replace(/[),.;:]+$/, "");
    if (seen.has(email)) continue;
    const [localPart = "", emailDomain = ""] = email.split("@");
    if (
      !localPart ||
      BLOCKED_LOCAL_PART.test(localPart) ||
      (emailDomain !== domain && !emailDomain.endsWith(`.${domain}`))
    ) {
      continue;
    }
    seen.add(email);
    contacts.push({
      name: displayName(localPart),
      role: null,
      email,
      email_source: pageUrl,
    });
  }
  return contacts;
}
