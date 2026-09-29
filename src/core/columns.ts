/** "A" -> 0, "B" -> 1, "AA" -> 26. */
export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function indexToCol(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function isColumnLetter(value: string): boolean {
  return /^[A-Za-z]{1,3}$/.test(value);
}

export interface GuessedColumns {
  companyCol?: string;
  roleCol?: string;
  statusCol?: string;
  noteCol?: string;
}

const HEADER_KEYWORDS: Array<[keyof GuessedColumns, string[]]> = [
  ["companyCol", ["company", "公司", "employer", "organization", "organisation"]],
  ["roleCol", ["position", "role", "title", "职位", "岗位"]],
  ["statusCol", ["status", "状态", "stage", "进度"]],
  ["noteCol", ["note", "备注", "comment"]],
];

/** Guesses which column is which from the header row's text. */
export function guessColumns(headers: readonly string[]): GuessedColumns {
  const result: GuessedColumns = {};
  const used = new Set<number>();
  const lowered = headers.map((h) => h.trim().toLowerCase());

  for (const [field, keywords] of HEADER_KEYWORDS) {
    // Prefer an exact header match, then a substring match.
    const exact = lowered.findIndex((h, i) => !used.has(i) && keywords.includes(h));
    const idx =
      exact >= 0
        ? exact
        : lowered.findIndex((h, i) => !used.has(i) && h && keywords.some((k) => h.includes(k)));
    if (idx >= 0) {
      used.add(idx);
      result[field] = indexToCol(idx);
    }
  }
  return result;
}
