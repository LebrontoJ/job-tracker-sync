export type ErrorCode =
  | "NOT_CONFIGURED" // no spreadsheet / sheets set up yet
  | "AUTH" // not signed in or scope not granted
  | "SHEETS" // Sheets API error
  | "ROW_CHANGED" // write-time verification failed
  | "NO_AI_KEY"
  | "AI_RATE_LIMIT"
  | "AI_UNAVAILABLE"
  | "CALENDAR"
  | "UNKNOWN";

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

export interface SerializedError {
  code: ErrorCode;
  message: string;
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  return { code: "UNKNOWN", message: err instanceof Error ? err.message : String(err) };
}
