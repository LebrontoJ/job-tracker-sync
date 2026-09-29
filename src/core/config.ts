import { isColumnLetter } from "./columns";
import type { Config, SheetMapping } from "./types";

export function defaultConfig(): Config {
  return {
    spreadsheetId: "",
    geminiApiKey: "",
    geminiModel: "",
    sheets: [],
    statusMapping: {
      applied: "Applied",
      rejection: "Rejected",
      interview: "Interview",
      assessment: "OA",
      offer: "Offer",
      other: null,
    },
    statusOrder: ["Applied", "OA", "Interview", "Offer"],
    enableCalendar: false,
  };
}

/** Fills in defaults for keys missing from an older or partial stored config. */
export function normalizeConfig(stored: Partial<Config> | undefined): Config {
  const base = defaultConfig();
  return {
    ...base,
    ...stored,
    statusMapping: { ...base.statusMapping, ...stored?.statusMapping },
    sheets: stored?.sheets ?? [],
    statusOrder: stored?.statusOrder ?? base.statusOrder,
  };
}

export function validateSheetMapping(sheet: SheetMapping): string[] {
  const errors: string[] = [];
  const label = `「${sheet.sheetTitle}」`;
  if (!Number.isInteger(sheet.headerRow) || sheet.headerRow < 1) {
    errors.push(`${label}表头行必须是 ≥ 1 的整数`);
  }
  for (const [name, value] of [
    ["公司列", sheet.companyCol],
    ["职位列", sheet.roleCol],
    ["状态列", sheet.statusCol],
  ] as const) {
    if (!isColumnLetter(value)) errors.push(`${label}${name}必须是列字母(如 B)`);
  }
  if (sheet.noteCol && !isColumnLetter(sheet.noteCol)) {
    errors.push(`${label}备注列必须是列字母`);
  }
  if (sheet.fillColor && !/^#[0-9a-fA-F]{6}$/.test(sheet.fillColor)) {
    errors.push(`${label}底色必须是 #RRGGBB`);
  }
  return errors;
}

/** Returns human-readable problems; an empty array means the config is usable. */
export function validateConfig(config: Config): string[] {
  const errors: string[] = [];
  if (!config.spreadsheetId) errors.push("尚未绑定表格");
  const enabled = config.sheets.filter((s) => s.enabled);
  if (enabled.length === 0) errors.push("至少启用一张子表");
  for (const sheet of enabled) errors.push(...validateSheetMapping(sheet));
  return errors;
}
