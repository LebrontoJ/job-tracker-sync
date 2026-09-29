import { cellRange, columnRange, quoteSheet, rowRange } from "../core/a1";
import { colToIndex } from "../core/columns";
import { validateConfig } from "../core/config";
import type { Config, MatchCandidate, SheetMapping, SheetRow } from "../core/types";
import { AppError } from "../shared/errors";
import type { SheetInfo, StatusOptions } from "../shared/messages";
import { authedFetch } from "./auth";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const CACHE_TTL_MS = 60_000;

interface GoogleErrorBody {
  error?: { message?: string };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(url, init);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as GoogleErrorBody).error?.message ?? detail;
    } catch {
      // Body was not JSON.
    }
    throw new AppError("SHEETS", `Google Sheets 请求失败(${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

function batchGetUrl(
  spreadsheetId: string,
  ranges: string[],
  extra = "majorDimension=COLUMNS",
): string {
  const query = ranges.map((r) => `ranges=${enc(r)}`).join("&");
  return `${API}/${spreadsheetId}/values:batchGet?${query}&${extra}`;
}

interface BatchGetResponse {
  valueRanges?: Array<{ values?: string[][] }>;
}

/** Column-major batchGet: result[i] is the i-th requested range's single column. */
async function batchGetColumns(spreadsheetId: string, ranges: string[]): Promise<string[][]> {
  const data = await request<BatchGetResponse>(batchGetUrl(spreadsheetId, ranges));
  return ranges.map((_, i) => data.valueRanges?.[i]?.values?.[0] ?? []);
}

export async function listSheets(
  spreadsheetId: string,
): Promise<{ title: string; sheets: SheetInfo[] }> {
  interface Meta {
    properties?: { title?: string };
    sheets?: Array<{ properties: { sheetId: number; title: string } }>;
  }
  const meta = await request<Meta>(
    `${API}/${spreadsheetId}?fields=properties.title,sheets.properties(sheetId,title)`,
  );
  return {
    title: meta.properties?.title ?? "",
    sheets: (meta.sheets ?? []).map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    })),
  };
}

export async function getHeaderRow(
  spreadsheetId: string,
  sheetTitle: string,
  headerRow: number,
): Promise<string[]> {
  const range = rowRange(sheetTitle, headerRow);
  const data = await request<{ values?: string[][] }>(
    `${API}/${spreadsheetId}/values/${enc(range)}`,
  );
  return data.values?.[0] ?? [];
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

let rowCache: { key: string; at: number; rows: SheetRow[] } | null = null;

export function invalidateRowCache(): void {
  rowCache = null;
}

function requireUsable(config: Config): SheetMapping[] {
  const problems = validateConfig(config);
  if (problems.length) throw new AppError("NOT_CONFIGURED", `请先完成设置:${problems[0]}`);
  return config.sheets.filter((s) => s.enabled);
}

/**
 * Reads company / role / status columns of every enabled sheet in one
 * batchGet and aligns them into rows. Cached for 60 seconds.
 */
export async function loadRows(config: Config): Promise<SheetRow[]> {
  const sheets = requireUsable(config);
  const key = JSON.stringify([config.spreadsheetId, sheets]);
  if (rowCache && rowCache.key === key && Date.now() - rowCache.at < CACHE_TTL_MS) {
    return rowCache.rows;
  }

  const ranges = sheets.flatMap((s) => [
    columnRange(s.sheetTitle, s.companyCol, s.headerRow + 1),
    columnRange(s.sheetTitle, s.roleCol, s.headerRow + 1),
    columnRange(s.sheetTitle, s.statusCol, s.headerRow + 1),
  ]);
  const columns = await batchGetColumns(config.spreadsheetId, ranges);

  const rows: SheetRow[] = [];
  sheets.forEach((sheet, i) => {
    const companies = columns[i * 3] ?? [];
    const roles = columns[i * 3 + 1] ?? [];
    const statuses = columns[i * 3 + 2] ?? [];
    for (let n = 0; n < companies.length; n++) {
      const company = (companies[n] ?? "").trim();
      if (!company) continue;
      rows.push({
        sheetTitle: sheet.sheetTitle,
        rowIndex: sheet.headerRow + 1 + n,
        company,
        role: (roles[n] ?? "").trim(),
        currentStatus: (statuses[n] ?? "").trim(),
      });
    }
  });

  rowCache = { key, at: Date.now(), rows };
  return rows;
}

/** Fills `rowValues` (the whole row) so the panel can show it for confirmation. */
export async function fillRowValues(
  spreadsheetId: string,
  candidates: MatchCandidate[],
): Promise<MatchCandidate[]> {
  if (candidates.length === 0) return candidates;
  const ranges = candidates.map((c) => `${quoteSheet(c.sheetTitle)}!${c.rowIndex}:${c.rowIndex}`);
  const data = await request<BatchGetResponse>(
    batchGetUrl(spreadsheetId, ranges, "majorDimension=ROWS"),
  );
  return candidates.map((c, i) => ({ ...c, rowValues: data.valueRanges?.[i]?.values?.[0] ?? [] }));
}

// ---------------------------------------------------------------------------
// Status dropdown options
// ---------------------------------------------------------------------------

interface ValidationResponse {
  sheets?: Array<{
    data?: Array<{
      rowData?: Array<{
        values?: Array<{
          dataValidation?: {
            condition?: { type?: string; values?: Array<{ userEnteredValue?: string }> };
          };
        }>;
      }>;
    }>;
  }>;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

export function sheetFor(config: Config, sheetTitle: string): SheetMapping {
  const sheet = config.sheets.find((s) => s.sheetTitle === sheetTitle);
  if (!sheet) throw new AppError("NOT_CONFIGURED", `找不到子表「${sheetTitle}」的配置`);
  return sheet;
}

/**
 * Options for the status column: the candidate cell's data validation
 * (ONE_OF_LIST, or ONE_OF_RANGE by reading the referenced range), else the
 * distinct values already present in the column.
 */
export async function getStatusOptions(
  config: Config,
  candidate: MatchCandidate,
): Promise<StatusOptions> {
  const sheet = sheetFor(config, candidate.sheetTitle);
  const cell = cellRange(sheet.sheetTitle, sheet.statusCol, candidate.rowIndex);

  const data = await request<ValidationResponse>(
    `${API}/${config.spreadsheetId}?ranges=${enc(cell)}&fields=sheets.data.rowData.values.dataValidation`,
  );
  const condition =
    data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]?.dataValidation?.condition;

  if (condition?.type === "ONE_OF_LIST") {
    const options = dedupe((condition.values ?? []).map((v) => v.userEnteredValue ?? ""));
    if (options.length) return { options, source: "list" };
  }

  if (condition?.type === "ONE_OF_RANGE") {
    const ref = condition.values?.[0]?.userEnteredValue?.replace(/^=/, "");
    if (ref) {
      const res = await request<{ values?: string[][] }>(
        `${API}/${config.spreadsheetId}/values/${enc(ref)}`,
      );
      const options = dedupe((res.values ?? []).flat());
      if (options.length) return { options, source: "range" };
    }
  }

  const [column] = await batchGetColumns(config.spreadsheetId, [
    columnRange(sheet.sheetTitle, sheet.statusCol, sheet.headerRow + 1),
  ]);
  return { options: dedupe(column ?? []), source: "column" };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const n = parseInt(hex.slice(1), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

/**
 * Re-reads the row's company / role (and note) cells and compares them with
 * what the search matched. A mismatch means rows moved since the search.
 */
async function verifyRow(
  config: Config,
  sheet: SheetMapping,
  candidate: MatchCandidate,
): Promise<{ existingNote: string }> {
  const ranges = [
    cellRange(sheet.sheetTitle, sheet.companyCol, candidate.rowIndex),
    cellRange(sheet.sheetTitle, sheet.roleCol, candidate.rowIndex),
    ...(sheet.noteCol ? [cellRange(sheet.sheetTitle, sheet.noteCol, candidate.rowIndex)] : []),
  ];
  const [company, role, note] = await batchGetColumns(config.spreadsheetId, ranges);
  if (
    (company?.[0] ?? "").trim() !== candidate.company ||
    (role?.[0] ?? "").trim() !== candidate.role
  ) {
    throw new AppError("ROW_CHANGED", "表格内容在查找后发生了变化(可能排序或插入了行),请重新查找");
  }
  return { existingNote: note?.[0] ?? "" };
}

export interface ApplyUpdateInput {
  candidate: MatchCandidate;
  newStatus: string;
  note?: string;
}

/** Verifies the row, writes status (+ note), then optionally paints the row. */
export async function applyUpdate(config: Config, input: ApplyUpdateInput): Promise<number> {
  const { candidate, newStatus, note } = input;
  const sheet = sheetFor(config, candidate.sheetTitle);
  const { existingNote } = await verifyRow(config, sheet, candidate);

  const data = [
    {
      range: cellRange(sheet.sheetTitle, sheet.statusCol, candidate.rowIndex),
      values: [[newStatus]],
    },
  ];
  if (note && sheet.noteCol) {
    data.push({
      range: cellRange(sheet.sheetTitle, sheet.noteCol, candidate.rowIndex),
      // Never clobber what the user already wrote in the note cell.
      values: [[existingNote ? `${existingNote}\n${note}` : note]],
    });
  }

  await request(`${API}/${config.spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });

  if (sheet.fillColor) await paintRow(config, sheet, candidate.rowIndex);
  invalidateRowCache();
  return data.length;
}

async function paintRow(config: Config, sheet: SheetMapping, rowIndex: number): Promise<void> {
  const { sheets } = await listSheets(config.spreadsheetId);
  const target = sheets.find((s) => s.title === sheet.sheetTitle);
  if (!target || !sheet.fillColor) return;

  const lastCol = Math.max(
    colToIndex(sheet.companyCol),
    colToIndex(sheet.roleCol),
    colToIndex(sheet.statusCol),
    sheet.noteCol ? colToIndex(sheet.noteCol) : 0,
  );
  await request(`${API}/${config.spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: target.sheetId,
              startRowIndex: rowIndex - 1,
              endRowIndex: rowIndex,
              startColumnIndex: 0,
              endColumnIndex: lastCol + 1,
            },
            cell: { userEnteredFormat: { backgroundColor: hexToRgb(sheet.fillColor) } },
            fields: "userEnteredFormat.backgroundColor",
          },
        },
      ],
    }),
  });
}
