export const EMAIL_TYPES = [
  "applied",
  "rejection",
  "interview",
  "assessment",
  "offer",
  "other",
] as const;
export type EmailType = (typeof EMAIL_TYPES)[number];

export interface SheetMapping {
  /** Sub-sheet (tab) name. */
  sheetTitle: string;
  /** Whether this sheet takes part in searches. */
  enabled: boolean;
  /** 1-based row that holds the header. */
  headerRow: number;
  /** Column letters, e.g. "B". */
  companyCol: string;
  roleCol: string;
  statusCol: string;
  /** Optional: column that receives the interview time. */
  noteCol?: string;
  /** Optional: hex colour (#RRGGBB) applied to the whole row after an update. */
  fillColor?: string;
}

export interface Config {
  spreadsheetId: string;
  geminiApiKey: string;
  /** Gemini model id; falls back to DEFAULT_GEMINI_MODEL when empty. */
  geminiModel?: string;
  sheets: SheetMapping[];
  statusMapping: Record<EmailType, string | null>;
  /** Progress order used for regression protection, earliest first. */
  statusOrder: string[];
  /** Optional M8: offer to create a Google Calendar event for interviews. */
  enableCalendar?: boolean;
}

export type ParseSource = "rule" | "ai" | "manual";

export interface ParsedEmail {
  company: string;
  /** May be empty (interview emails often omit the role). */
  role: string;
  type: EmailType;
  /** ISO 8601 with offset when the AI could determine it. */
  interviewTime?: string;
  source: ParseSource;
}

/** Raw content pulled from the Gmail DOM. */
export interface EmailContent {
  subject: string;
  /** Sender address. */
  from: string;
  /** Sender display name. */
  fromName: string;
  /** Body text, already truncated to BODY_LIMIT. */
  body: string;
}

/** One sheet row as read for matching. */
export interface SheetRow {
  sheetTitle: string;
  /** 1-based actual row number. */
  rowIndex: number;
  company: string;
  role: string;
  currentStatus: string;
}

export interface MatchCandidate extends SheetRow {
  /** Whole row for display; filled in lazily by the background worker. */
  rowValues: string[];
  /** 0~1 */
  score: number;
  companyScore: number;
  /** True when a role was given but it does not resemble this row's role. */
  roleMismatch: boolean;
}

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
/** Only the subject + this many body characters ever leave the machine. */
export const BODY_LIMIT = 1500;
