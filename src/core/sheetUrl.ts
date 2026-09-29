/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function extractSpreadsheetId(input: string): string | null {
  const text = input.trim();
  const fromUrl = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(text);
  if (fromUrl?.[1]) return fromUrl[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(text) ? text : null;
}
