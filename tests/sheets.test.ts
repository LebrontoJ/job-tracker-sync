import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/core/config";
import type { Config, MatchCandidate } from "../src/core/types";

vi.mock("../src/background/auth", () => ({ authedFetch: vi.fn() }));

import { authedFetch } from "../src/background/auth";
import {
  applyUpdate,
  getStatusOptions,
  invalidateRowCache,
  loadRows,
} from "../src/background/sheets";

const fetchMock = vi.mocked(authedFetch);

const config: Config = {
  ...defaultConfig(),
  spreadsheetId: "sheet123",
  sheets: [
    {
      sheetTitle: "2026",
      enabled: true,
      headerRow: 1,
      companyCol: "B",
      roleCol: "C",
      statusCol: "H",
      noteCol: "I",
    },
  ],
};

const candidate: MatchCandidate = {
  sheetTitle: "2026",
  rowIndex: 23,
  company: "Stripe",
  role: "SWE",
  currentStatus: "Applied",
  rowValues: [],
  score: 1,
  companyScore: 1,
  roleMismatch: false,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Routes fake responses by URL substring; first match wins. */
function route(routes: Array<[string, unknown | ((init?: RequestInit) => unknown)]>) {
  fetchMock.mockImplementation(async (url, init) => {
    const decoded = decodeURIComponent(String(url));
    for (const [needle, body] of routes) {
      if (decoded.includes(needle)) return json(typeof body === "function" ? body(init) : body);
    }
    throw new Error(`unexpected request: ${decoded}`);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  invalidateRowCache();
});

describe("loadRows", () => {
  const batch = {
    valueRanges: [
      { values: [["Stripe", "", "Google"]] },
      { values: [["SWE", "ignored", "Backend"]] },
      { values: [["Applied"]] },
    ],
  };

  it("aligns columns into rows and skips blank companies", async () => {
    route([["values:batchGet", batch]]);
    const rows = await loadRows(config);
    expect(rows).toEqual([
      { sheetTitle: "2026", rowIndex: 2, company: "Stripe", role: "SWE", currentStatus: "Applied" },
      { sheetTitle: "2026", rowIndex: 4, company: "Google", role: "Backend", currentStatus: "" },
    ]);
    const url = decodeURIComponent(String(fetchMock.mock.calls[0]?.[0]));
    expect(url).toContain("ranges='2026'!B2:B");
    expect(url).toContain("ranges='2026'!H2:H");
    expect(url).toContain("majorDimension=COLUMNS");
  });

  it("caches for 60 seconds until invalidated", async () => {
    route([["values:batchGet", batch]]);
    await loadRows(config);
    await loadRows(config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    invalidateRowCache();
    await loadRows(config);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses to run with an incomplete configuration", async () => {
    await expect(loadRows(defaultConfig())).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });
});

describe("getStatusOptions", () => {
  const validation = (condition: unknown) => ({
    sheets: [{ data: [{ rowData: [{ values: [{ dataValidation: { condition } }] }] }] }],
  });

  it("reads ONE_OF_LIST", async () => {
    route([
      [
        "fields=sheets.data.rowData.values.dataValidation",
        validation({
          type: "ONE_OF_LIST",
          values: [{ userEnteredValue: "Applied" }, { userEnteredValue: "Interview" }],
        }),
      ],
    ]);
    expect(await getStatusOptions(config, candidate)).toEqual({
      options: ["Applied", "Interview"],
      source: "list",
    });
    expect(decodeURIComponent(String(fetchMock.mock.calls[0]?.[0]))).toContain("ranges='2026'!H23");
  });

  it("follows ONE_OF_RANGE to the referenced cells", async () => {
    route([
      [
        "dataValidation",
        validation({ type: "ONE_OF_RANGE", values: [{ userEnteredValue: "='Lists'!A1:A3" }] }),
      ],
      ["/values/'Lists'!A1:A3", { values: [["Applied"], ["OA"], ["Applied"]] }],
    ]);
    expect(await getStatusOptions(config, candidate)).toEqual({
      options: ["Applied", "OA"],
      source: "range",
    });
  });

  it("falls back to distinct values in the column", async () => {
    route([
      ["dataValidation", { sheets: [{ data: [{ rowData: [{ values: [{}] }] }] }] }],
      ["values:batchGet", { valueRanges: [{ values: [["Applied", "Rejected", "Applied", ""]] }] }],
    ]);
    expect(await getStatusOptions(config, candidate)).toEqual({
      options: ["Applied", "Rejected"],
      source: "column",
    });
  });
});

describe("applyUpdate", () => {
  const cells = (company: string, role: string, note?: string) => ({
    valueRanges: [
      { values: [[company]] },
      { values: [[role]] },
      ...(note === undefined ? [] : [{ values: [[note]] }]),
    ],
  });

  it("aborts without writing when the row no longer matches", async () => {
    route([["values:batchGet", cells("Google", "SWE", "")]]);
    await expect(applyUpdate(config, { candidate, newStatus: "Interview" })).rejects.toMatchObject({
      code: "ROW_CHANGED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1); // the verification read only
  });

  it("writes status and appends to an existing note", async () => {
    let body:
      { valueInputOption: string; data: Array<{ range: string; values: string[][] }> } | undefined;
    route([
      ["values:batchGet", cells("Stripe", "SWE", "Referred by Sam")],
      [
        "values:batchUpdate",
        (init?: RequestInit) => {
          body = JSON.parse(String(init?.body));
          return {};
        },
      ],
    ]);

    await applyUpdate(config, {
      candidate,
      newStatus: "Interview",
      note: "面试时间:2026-10-08 14:00",
    });

    expect(body?.valueInputOption).toBe("USER_ENTERED");
    expect(body?.data).toEqual([
      { range: "'2026'!H23", values: [["Interview"]] },
      { range: "'2026'!I23", values: [["Referred by Sam\n面试时间:2026-10-08 14:00"]] },
    ]);
  });

  it("skips the note when the sheet has no note column", async () => {
    const noNote: Config = {
      ...config,
      sheets: [{ ...config.sheets[0]!, noteCol: undefined }],
    };
    let body: { data: unknown[] } | undefined;
    route([
      ["values:batchGet", cells("Stripe", "SWE")],
      ["values:batchUpdate", (init?: RequestInit) => ((body = JSON.parse(String(init?.body))), {})],
    ]);
    await applyUpdate(noNote, { candidate, newStatus: "Rejected", note: "ignored" });
    expect(body?.data).toHaveLength(1);
  });
});
