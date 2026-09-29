import type { Config, EmailType } from "./types";

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function isSameStatus(current: string, next: string): boolean {
  return current.trim() !== "" && eq(current, next);
}

/**
 * True when moving from `current` to `next` goes backwards along `order`.
 * Statuses outside `order` (e.g. "Rejected") are never considered regressions,
 * since a rejection can follow any stage.
 */
export function isRegression(current: string, next: string, order: readonly string[]): boolean {
  const from = order.findIndex((s) => eq(s, current));
  const to = order.findIndex((s) => eq(s, next));
  if (from < 0 || to < 0) return false;
  return to < from;
}

/** Fuzzy keywords per type. Short ASCII keywords must match a whole word. */
const TYPE_KEYWORDS: Record<EmailType, string[]> = {
  applied: ["applied", "submitted", "已投递", "已投"],
  interview: ["interview", "面试", "约面"],
  rejection: ["reject", "declin", "拒"],
  offer: ["offer"],
  assessment: ["oa", "assessment", "笔试", "online test", "coding test"],
  other: [],
};

function hasKeyword(option: string, keyword: string): boolean {
  const text = option.toLowerCase();
  if (/^[a-z]{1,3}$/.test(keyword)) {
    return text.split(/[^a-z0-9]+/).includes(keyword);
  }
  return text.includes(keyword);
}

/**
 * Picks the dropdown option to pre-select for an email type:
 * 1. the configured mapping, if it exists in the options (exact, then case-insensitive);
 * 2. keyword fuzzy match;
 * 3. null - let the user choose.
 */
export function suggestStatus(
  type: EmailType,
  options: readonly string[],
  statusMapping: Config["statusMapping"],
): string | null {
  const mapped = statusMapping[type];
  if (mapped) {
    const exact = options.find((o) => o === mapped) ?? options.find((o) => eq(o, mapped));
    if (exact) return exact;
  }
  const keywords = TYPE_KEYWORDS[type];
  if (keywords.length === 0) return null;
  return options.find((o) => keywords.some((k) => hasKeyword(o, k))) ?? null;
}
