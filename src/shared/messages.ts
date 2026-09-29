import type { SerializedError } from "./errors";
import type {
  EmailContent,
  EmailType,
  MatchCandidate,
  ParsedEmail,
  SheetMapping,
} from "../core/types";

export interface SheetInfo {
  sheetId: number;
  title: string;
}

export interface StatusOptions {
  options: string[];
  /** Where the options came from: the cell's dropdown, or values seen in the column. */
  source: "list" | "range" | "column";
}

export type AiState = "skipped" | "used" | "no_key" | "unavailable";

/** Requests sent to the background worker. */
export interface ApiMap {
  "auth:signIn": { req: { calendar?: boolean }; res: { signedIn: true } };
  "auth:signOut": { req: undefined; res: { signedOut: true } };
  "sheets:list": {
    req: { spreadsheetId: string };
    res: { title: string; sheets: SheetInfo[] };
  };
  "sheets:headers": {
    req: { spreadsheetId: string; sheetTitle: string; headerRow: number };
    res: { headers: string[] };
  };
  "email:parse": {
    req: { email: EmailContent };
    res: { parsed: ParsedEmail; ai: AiState; aiError?: SerializedError };
  };
  "match:search": {
    req: { company: string; role: string };
    res: { candidates: MatchCandidate[] };
  };
  "status:options": {
    req: { candidate: MatchCandidate; type: EmailType };
    /** `suggested` is the option to pre-select for this email type, if any. */
    res: StatusOptions & { suggested: string | null };
  };
  "status:apply": {
    req: {
      candidate: MatchCandidate;
      newStatus: string;
      /** Written to the sheet's note column when present. */
      note?: string;
    };
    res: { updatedCells: number };
  };
  "calendar:create": {
    req: { company: string; role: string; interviewTime: string; timeZone: string };
    res: { htmlLink: string };
  };
}

export type ApiType = keyof ApiMap;

export type ApiRequest = {
  [K in ApiType]: { type: K; payload: ApiMap[K]["req"] };
}[ApiType];

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: SerializedError };

/** Pushed by the Gmail content script to the side panel. */
export type ContentEvent =
  | { type: "email:changed"; email: EmailContent | null }
  | { type: "selection:changed"; text: string };

/** Side panel -> content script (via tabs.sendMessage). */
export interface ContentRequest {
  type: "email:get";
}

export type { SheetMapping };
