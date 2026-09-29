import { findCandidates } from "../core/matcher";
import { suggestStatus } from "../core/statusFlow";
import { serializeError } from "../shared/errors";
import type { ApiMap, ApiRequest, ApiResponse, ApiType } from "../shared/messages";
import { loadConfig } from "../shared/storage";
import { getToken, signOut } from "./auth";
import { createInterviewEvent } from "./calendar";
import { parseEmail } from "./parse";
import {
  applyUpdate,
  fillRowValues,
  getHeaderRow,
  getStatusOptions,
  listSheets,
  loadRows,
} from "./sheets";

/** How many candidates get their full row loaded for the confirmation view. */
const ROW_PREVIEW_LIMIT = 5;

type Handlers = {
  [K in ApiType]: (payload: ApiMap[K]["req"]) => Promise<ApiMap[K]["res"]>;
};

// The worker is stateless (it may be suspended at any time): every request
// carries what it needs and config is re-read from storage.
const handlers: Handlers = {
  "auth:signIn": async ({ calendar }) => {
    await getToken({ interactive: true, calendar });
    return { signedIn: true };
  },

  "auth:signOut": async () => {
    await signOut();
    return { signedOut: true };
  },

  "sheets:list": ({ spreadsheetId }) => listSheets(spreadsheetId),

  "sheets:headers": async ({ spreadsheetId, sheetTitle, headerRow }) => ({
    headers: await getHeaderRow(spreadsheetId, sheetTitle, headerRow),
  }),

  "email:parse": async ({ email }) => parseEmail(await loadConfig(), email),

  "match:search": async ({ company, role }) => {
    const config = await loadConfig();
    const rows = await loadRows(config);
    const found = findCandidates(
      rows,
      { company, role },
      { finishedStatuses: [config.statusMapping.rejection, config.statusMapping.offer] },
    );
    const withRows = await fillRowValues(config.spreadsheetId, found.slice(0, ROW_PREVIEW_LIMIT));
    return { candidates: [...withRows, ...found.slice(ROW_PREVIEW_LIMIT)] };
  },

  "status:options": async ({ candidate, type }) => {
    const config = await loadConfig();
    const { options, source } = await getStatusOptions(config, candidate);
    return { options, source, suggested: suggestStatus(type, options, config.statusMapping) };
  },

  "status:apply": async (input) => {
    const config = await loadConfig();
    return { updatedCells: await applyUpdate(config, input) };
  },

  "calendar:create": (input) => createInterviewEvent(input),
};

async function handle(request: ApiRequest): Promise<ApiResponse<unknown>> {
  try {
    const handler = handlers[request.type] as (payload: unknown) => Promise<unknown>;
    return { ok: true, data: await handler(request.payload) };
  } catch (err) {
    console.error(`[job-tracker-sync] ${request.type} failed`, err);
    return { ok: false, error: serializeError(err) };
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only our own extension contexts may call the API.
  if (sender.id !== chrome.runtime.id) return false;
  const type = (message as { type?: string } | null)?.type;
  if (!type || !Object.hasOwn(handlers, type)) return false; // e.g. content -> panel events
  void handle(message as ApiRequest).then(sendResponse);
  return true; // keep the channel open for the async response
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
