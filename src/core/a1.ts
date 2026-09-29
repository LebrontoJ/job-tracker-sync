/** Quotes a sheet title for A1 notation: My Sheet -> 'My Sheet'. */
export function quoteSheet(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

export function cellRange(sheetTitle: string, col: string, row: number): string {
  return `${quoteSheet(sheetTitle)}!${col}${row}`;
}

/** Open-ended column range from `startRow` down, e.g. 'Sheet'!B2:B. */
export function columnRange(sheetTitle: string, col: string, startRow: number): string {
  return `${quoteSheet(sheetTitle)}!${col}${startRow}:${col}`;
}

/** Whole header row, e.g. 'Sheet'!1:1. */
export function rowRange(sheetTitle: string, row: number): string {
  return `${quoteSheet(sheetTitle)}!${row}:${row}`;
}
