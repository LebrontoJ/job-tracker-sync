import type { EmailContent } from "./types";

export interface RuleParseResult {
  company?: string;
  role?: string;
}

/** Applicant-tracking systems whose sender display name is the hiring company. */
const ATS_DOMAINS = [
  "myworkday.com",
  "workday.com",
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "ashbyhq.com",
  "icims.com",
  "smartrecruiters.com",
  "jobvite.com",
];

const ATS_NAMES = /^(greenhouse|workday|lever|ashby|icims|smartrecruiters|jobvite)$/i;

const ROLE_WORDS =
  /\b(engineer|developer|manager|analyst|designer|scientist|intern|internship|architect|consultant|specialist|associate|coordinator|administrator|researcher|director|lead|technician|swe|sde)\b/i;

export function senderDomain(from: string): string {
  const at = from.lastIndexOf("@");
  return at < 0
    ? ""
    : from
        .slice(at + 1)
        .toLowerCase()
        .replace(/[>\s]/g, "");
}

export function isAtsDomain(domain: string): boolean {
  return ATS_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function clean(raw: string): string | undefined {
  const text = raw
    .replace(/^["'“”‘’\s]+|["'“”‘’\s.,!:;-]+$/g, "")
    .replace(/^(?:the|joining)\s+/i, "")
    .replace(/\s+(?:position|role|team)$/i, "")
    .trim();
  if (!text || text.length > 80 || text.split(/\s+/).length > 9) return undefined;
  return text;
}

function looksLikeRole(text: string): boolean {
  return ROLE_WORDS.test(text);
}

/** Puts a single captured phrase into the role or company slot. */
function assign(out: RuleParseResult, raw: string | undefined): void {
  const text = raw && clean(raw);
  if (!text) return;
  if (looksLikeRole(text)) out.role ??= text;
  else out.company ??= text;
}

/** Patterns that capture (role, company) together. Tried on subject, then body. */
const ROLE_AT_COMPANY: RegExp[] = [
  /(?:application|applying|applied|interest)\s+(?:for|to|in)\s+(?:the\s+)?(.+?)\s+(?:position\s+|role\s+)?(?:at|with)\s+(.+?)(?:[.,!]|\s+-|$)/i,
  /position of (.+?) at (.+?)(?:[.,]|$)/i,
  /(?:for|as) (?:the |an? )?(.+?) (?:position|role) (?:at|with) (.+?)(?:[.,!]|$)/i,
];

/** Patterns that capture one phrase, which may be a company or a role. */
const SINGLE: RegExp[] = [
  /your application (?:to|for|at|with) (.+)$/i,
  /update on your (.+?) application/i,
  /thank(?:s| you) for applying (?:to|at|with) (.+?)(?:[.!,]|$)/i,
  /thank(?:s| you) for your interest in (.+?)(?:[.!,]|$)/i,
];

const SENDER_NOISE =
  /\b(?:university recruiting|recruiting|recruitment|careers?|talent acquisition|talent|hiring|jobs?|human resources|hr|team|notifications?|no-?reply|do not reply)\b|\(via [^)]*\)|\bvia \w+$/gi;

function companyFromSender(email: EmailContent): string | undefined {
  if (!isAtsDomain(senderDomain(email.from))) return undefined;
  const name = email.fromName.replace(SENDER_NOISE, " ").replace(/\s+/g, " ").trim();
  if (!name || ATS_NAMES.test(name) || name.includes("@")) return undefined;
  return clean(name);
}

/**
 * Template-based extraction of company and role. Pure heuristics: anything it
 * cannot determine confidently is left undefined so the AI fallback can fill it.
 * Sender display names are only trusted for known ATS domains; schedulers such
 * as Calendly or GoodTime say nothing about the employer.
 */
export function parseByRules(email: EmailContent): RuleParseResult {
  const out: RuleParseResult = {};
  const sources = [email.subject, email.body];

  for (const text of sources) {
    if (out.company && out.role) break;
    for (const pattern of ROLE_AT_COMPANY) {
      const m = pattern.exec(text);
      if (!m) continue;
      const role = m[1] && clean(m[1]);
      const company = m[2] && clean(m[2]);
      if (role && company && looksLikeRole(role)) {
        out.role ??= role;
        out.company ??= company;
        break;
      }
    }
  }

  for (const text of sources) {
    if (out.company && out.role) break;
    for (const pattern of SINGLE) {
      const m = pattern.exec(text);
      if (m) {
        assign(out, m[1]);
        break;
      }
    }
  }

  out.company ??= companyFromSender(email);
  return out;
}
