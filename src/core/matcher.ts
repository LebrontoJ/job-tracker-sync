import { companyTokens, normalizeCompany, normalizeRole } from "./normalize";
import { isTokenSubset, jaroWinkler, tokenJaccard } from "./similarity";
import type { MatchCandidate, SheetRow } from "./types";

/** Hard gate: rows whose company score is below this never become candidates. */
export const COMPANY_THRESHOLD = 0.8;
/** A single candidate at or above this total is presented as a confident hit. */
export const CONFIDENT_TOTAL = 0.8;
/** Below this role score a candidate is flagged "role not quite matching". */
export const ROLE_MISMATCH_THRESHOLD = 0.5;

const COMPANY_WEIGHT = 0.65;
const ROLE_WEIGHT = 0.35;

export function companyScore(a: string, b: string): number {
  const na = normalizeCompany(a);
  const nb = normalizeCompany(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (isTokenSubset(companyTokens(a), companyTokens(b))) return 0.9;
  return jaroWinkler(na, nb);
}

/**
 * 0.6 * token Jaccard + 0.4 * Jaro-Winkler on the level-stripped role.
 * Seniority markers are compared separately: when both sides carry markers and
 * they share none ("Senior" vs "Intern"), the score is scaled down.
 */
export function roleScore(a: string, b: string): number {
  const ra = normalizeRole(a);
  const rb = normalizeRole(b);
  const base =
    0.6 * tokenJaccard(ra.tokens, rb.tokens) +
    0.4 * jaroWinkler(ra.tokens.join(" "), rb.tokens.join(" "));

  const levelsClash =
    ra.levels.length > 0 && rb.levels.length > 0 && !ra.levels.some((l) => rb.levels.includes(l));
  return levelsClash ? base * 0.75 : base;
}

export interface SearchQuery {
  company: string;
  role: string;
}

export interface MatchOptions {
  /** Statuses that mean "this application is over" (e.g. Rejected, Offer). */
  finishedStatuses?: readonly (string | null)[];
}

function isFinished(status: string, finished: readonly (string | null)[] | undefined): boolean {
  const s = status.trim().toLowerCase();
  return !!finished?.some((f) => f && f.trim().toLowerCase() === s);
}

/** Scores one row against the query; returns null if the company gate fails. */
export function scoreRow(row: SheetRow, query: SearchQuery): MatchCandidate | null {
  const cScore = companyScore(query.company, row.company);
  if (cScore < COMPANY_THRESHOLD) return null;

  const hasRole = query.role.trim().length > 0;
  const rScore = hasRole ? roleScore(query.role, row.role) : 1;
  const score = hasRole ? cScore * COMPANY_WEIGHT + rScore * ROLE_WEIGHT : cScore;

  return {
    ...row,
    rowValues: [],
    score,
    companyScore: cScore,
    roleMismatch: hasRole && rScore < ROLE_MISMATCH_THRESHOLD,
  };
}

/**
 * Returns candidates sorted best-first. When the query has no role, rows whose
 * application is still in progress are listed ahead of finished ones.
 */
export function findCandidates(
  rows: readonly SheetRow[],
  query: SearchQuery,
  options: MatchOptions = {},
): MatchCandidate[] {
  if (!query.company.trim()) return [];
  const hasRole = query.role.trim().length > 0;

  const candidates: MatchCandidate[] = [];
  for (const row of rows) {
    const c = scoreRow(row, query);
    if (c) candidates.push(c);
  }

  return candidates.sort((x, y) => {
    if (!hasRole) {
      const fx = isFinished(x.currentStatus, options.finishedStatuses) ? 1 : 0;
      const fy = isFinished(y.currentStatus, options.finishedStatuses) ? 1 : 0;
      if (fx !== fy) return fx - fy;
    }
    return y.score - x.score || x.sheetTitle.localeCompare(y.sheetTitle) || x.rowIndex - y.rowIndex;
  });
}

export type SearchOutcome = "NOT_FOUND" | "FOUND_ONE" | "FOUND_MULTI";

export function searchOutcome(candidates: readonly MatchCandidate[]): SearchOutcome {
  if (candidates.length === 0) return "NOT_FOUND";
  return candidates.length === 1 ? "FOUND_ONE" : "FOUND_MULTI";
}

/** Whether the lone candidate is confident enough to skip a "please verify" hint. */
export function isConfident(candidate: MatchCandidate): boolean {
  return candidate.score >= CONFIDENT_TOTAL && !candidate.roleMismatch;
}
