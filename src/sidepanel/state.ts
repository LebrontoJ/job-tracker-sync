import type { EmailType, MatchCandidate, ParseSource } from "../core/types";
import type { AiState, ApiMap } from "../shared/messages";

/** Mirrors the state machine in the design doc, plus DONE/ERROR handling. */
export type Phase =
  | "IDLE" // no email open
  | "PARSING"
  | "PARSED"
  | "SEARCHING"
  | "FOUND_ONE"
  | "FOUND_MULTI"
  | "NOT_FOUND"
  | "LOADING_OPTIONS"
  | "CHOOSING_STATUS"
  | "WRITING"
  | "DONE";

export type FieldName = "company" | "role" | "interviewTime";

export interface FormState {
  type: EmailType;
  company: string;
  role: string;
  interviewTime: string;
}

export interface StatusStep {
  options: string[];
  optionsSource: "list" | "range" | "column";
  chosen: string;
  /** The user has acknowledged the "moving backwards" warning. */
  regressionAck: boolean;
  /** Whether the note / calendar options are offered at all. */
  canNote: boolean;
  canEvent: boolean;
  canIcs: boolean;
  writeNote: boolean;
  createEvent: boolean;
  createIcs: boolean;
}

export interface State {
  phase: Phase;
  form: FormState;
  source: ParseSource;
  ai: AiState;
  aiMessage: string | null;
  candidates: MatchCandidate[];
  selected: number;
  step: StatusStep | null;
  error: string | null;
  doneMessage: string | null;
}

export const initialState: State = {
  phase: "IDLE",
  form: { type: "other", company: "", role: "", interviewTime: "" },
  source: "manual",
  ai: "skipped",
  aiMessage: null,
  candidates: [],
  selected: 0,
  step: null,
  error: null,
  doneMessage: null,
};

export type Action =
  | { t: "email"; hasEmail: boolean }
  | { t: "parsed"; res: ApiMap["email:parse"]["res"] }
  | { t: "edit"; field: keyof FormState; value: string }
  | { t: "searchStart" }
  | { t: "searchDone"; candidates: MatchCandidate[] }
  | { t: "select"; index: number }
  | { t: "optionsStart" }
  | {
      t: "optionsDone";
      options: string[];
      source: StatusStep["optionsSource"];
      suggested: string | null;
      canNote: boolean;
      canEvent: boolean;
      canIcs: boolean;
    }
  | { t: "step"; patch: Partial<StatusStep> }
  | { t: "writeStart" }
  | { t: "writeDone"; message: string }
  | { t: "fail"; message: string; back: Phase }
  | { t: "clearError" };

export function reducer(state: State, action: Action): State {
  switch (action.t) {
    case "email":
      return action.hasEmail
        ? { ...initialState, phase: "PARSING" }
        : { ...initialState, form: state.form, phase: "IDLE" };

    case "parsed": {
      const { parsed, ai, aiError } = action.res;
      return {
        ...state,
        phase: "PARSED",
        form: {
          type: parsed.type,
          company: parsed.company,
          role: parsed.role,
          interviewTime: parsed.interviewTime ?? "",
        },
        source: parsed.source,
        ai,
        aiMessage: aiError?.message ?? null,
      };
    }

    case "edit": {
      const form = { ...state.form, [action.field]: action.value };
      // Changing what is searched for invalidates earlier results.
      const stale =
        (action.field === "company" || action.field === "role") &&
        RESULT_PHASES.includes(state.phase);
      return {
        ...state,
        form,
        source: "manual",
        ...(stale ? { phase: "PARSED", candidates: [], step: null, selected: 0 } : {}),
      };
    }

    case "searchStart":
      return { ...state, phase: "SEARCHING", error: null, candidates: [], step: null, selected: 0 };

    case "searchDone":
      return {
        ...state,
        candidates: action.candidates,
        selected: 0,
        phase:
          action.candidates.length === 0
            ? "NOT_FOUND"
            : action.candidates.length === 1
              ? "FOUND_ONE"
              : "FOUND_MULTI",
      };

    case "select":
      return { ...state, selected: action.index };

    case "optionsStart":
      return { ...state, phase: "LOADING_OPTIONS", error: null };

    case "optionsDone":
      return {
        ...state,
        phase: "CHOOSING_STATUS",
        step: {
          options: action.options,
          optionsSource: action.source,
          chosen: action.suggested ?? "",
          regressionAck: false,
          canNote: action.canNote,
          canEvent: action.canEvent,
          canIcs: action.canIcs,
          writeNote: action.canNote,
          createEvent: action.canEvent,
          // Google Calendar synced to Calendar.app would make a .ics a duplicate,
          // so it is only pre-checked when Google Calendar is not in use.
          createIcs: action.canIcs && !action.canEvent,
        },
      };

    case "step":
      return state.step
        ? { ...state, step: { ...state.step, regressionAck: false, ...action.patch } }
        : state;

    case "writeStart":
      return { ...state, phase: "WRITING", error: null };

    case "writeDone":
      return { ...state, phase: "DONE", doneMessage: action.message };

    case "fail":
      return { ...state, phase: action.back, error: action.message };

    case "clearError":
      return { ...state, error: null };
  }
}

/** Phases in which search results (or later steps built on them) are on screen. */
const RESULT_PHASES: readonly Phase[] = [
  "FOUND_ONE",
  "FOUND_MULTI",
  "NOT_FOUND",
  "LOADING_OPTIONS",
  "CHOOSING_STATUS",
  "DONE",
];
