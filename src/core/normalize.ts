const COMPANY_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "plc",
  "gmbh",
  "technologies",
  "technology",
  "tech",
  "labs",
  "lab",
  "group",
  "holdings",
]);

/** Words that describe seniority. Kept apart from the role's "core" tokens. */
const LEVEL_WORDS = new Set([
  "junior",
  "senior",
  "staff",
  "principal",
  "lead",
  "intern",
  "internship",
  "graduate",
  "i",
  "ii",
  "iii",
  "iv",
  "v",
]);

/** Multi-word phrases are rewritten before tokenising. Order matters. */
const ROLE_PHRASES: Array<[RegExp, string]> = [
  [/\bsoftware (?:development )?engineer(?:ing)?\b/g, "software engineer"],
  [/\bsoftware developer\b/g, "software engineer"],
  [/\bsoftware dev\b/g, "software engineer"],
  [/\bnew grad(?:uate)?\b/g, "graduate"],
];

const ROLE_WORDS: Record<string, string> = {
  swe: "software engineer",
  sde: "software engineer",
  sr: "senior",
  jr: "junior",
  eng: "engineer",
  engineering: "engineer",
  developer: "engineer",
  "1": "i",
  "2": "ii",
  "3": "iii",
};

function baseClean(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lower-case, strip punctuation, drop trailing corporate suffixes. */
export function normalizeCompany(input: string): string {
  const tokens = baseClean(input).split(" ").filter(Boolean);
  // Strip suffixes from the end, but never reduce the name to nothing.
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1] as string)) {
    tokens.pop();
  }
  return tokens.join(" ");
}

export function companyTokens(input: string): string[] {
  return normalizeCompany(input).split(" ").filter(Boolean);
}

export interface NormalizedRole {
  /** Role words without level markers, e.g. ["software", "engineer"]. */
  tokens: string[];
  /** Seniority markers, e.g. ["senior"], ["ii"], ["intern"]. */
  levels: string[];
}

export function normalizeRole(input: string): NormalizedRole {
  let text = baseClean(input);
  for (const [pattern, replacement] of ROLE_PHRASES) text = text.replace(pattern, replacement);

  const tokens: string[] = [];
  const levels: string[] = [];
  for (const raw of text.split(" ").filter(Boolean)) {
    // A synonym may expand to several words ("swe" -> "software engineer").
    for (const word of (ROLE_WORDS[raw] ?? raw).split(" ")) {
      if (LEVEL_WORDS.has(word) || /^l\d$/.test(word)) levels.push(word);
      else tokens.push(word);
    }
  }
  return { tokens, levels };
}
