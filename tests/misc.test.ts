import { describe, expect, it } from "vitest";
import { columnRange, quoteSheet } from "../src/core/a1";
import { buildAiUserPrompt, parseAiResponse } from "../src/core/aiSchema";
import { buildIcs, icsFileName } from "../src/core/ics";
import { colToIndex, guessColumns, indexToCol } from "../src/core/columns";
import { defaultConfig, normalizeConfig, validateConfig } from "../src/core/config";
import { EMAIL_TYPES } from "../src/core/types";
import type { Config } from "../src/core/types";
import { buildCalendarEvent, formatInterviewTime } from "../src/core/interviewTime";
import { mergeParsed, needsAi } from "../src/core/mergeParsed";
import { extractSpreadsheetId } from "../src/core/sheetUrl";
import type { Classification } from "../src/core/classifier";

describe("columns", () => {
  it("converts between letters and indexes", () => {
    expect(colToIndex("A")).toBe(0);
    expect(colToIndex("AA")).toBe(26);
    expect(indexToCol(0)).toBe("A");
    expect(indexToCol(25)).toBe("Z");
    expect(indexToCol(26)).toBe("AA");
    expect(indexToCol(colToIndex("AZ"))).toBe("AZ");
  });

  it("guesses columns from English and Chinese headers", () => {
    expect(guessColumns(["Date", "Company", "Position", "Link", "Notes", "Status"])).toEqual({
      companyCol: "B",
      roleCol: "C",
      statusCol: "F",
      noteCol: "E",
    });
    expect(guessColumns(["日期", "公司", "职位", "状态", "备注"])).toEqual({
      companyCol: "B",
      roleCol: "C",
      statusCol: "D",
      noteCol: "E",
    });
  });

  it("does not assign one column to two fields", () => {
    expect(guessColumns(["Job Title"]).roleCol).toBe("A");
    expect(guessColumns(["Job Title"]).companyCol).toBeUndefined();
  });
});

describe("a1", () => {
  it("quotes sheet titles", () => {
    expect(quoteSheet("Bob's 2026")).toBe("'Bob''s 2026'");
    expect(columnRange("2026", "B", 2)).toBe("'2026'!B2:B");
  });
});

describe("extractSpreadsheetId", () => {
  const id = "1AbC-dEf_GhIjKlMnOpQrStUvWxYz0123456789";
  it("extracts from URLs and bare ids", () => {
    expect(extractSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`)).toBe(
      id,
    );
    expect(extractSpreadsheetId(id)).toBe(id);
  });
  it("rejects garbage", () => {
    expect(extractSpreadsheetId("hello")).toBeNull();
    expect(extractSpreadsheetId("")).toBeNull();
  });
});

describe("parseAiResponse", () => {
  it("parses plain and fenced JSON", () => {
    const body = { company: " Stripe ", role: "SWE", type: "Interview", interviewTime: "" };
    expect(parseAiResponse(JSON.stringify(body))).toEqual({
      company: "Stripe",
      role: "SWE",
      type: "interview",
      interviewTime: "",
    });
    expect(parseAiResponse("```json\n" + JSON.stringify(body) + "\n```").company).toBe("Stripe");
  });
  it("maps unknown types to other and rejects non-JSON", () => {
    expect(parseAiResponse('{"type":"spam"}').type).toBe("other");
    expect(() => parseAiResponse("nope")).toThrow();
    expect(() => parseAiResponse("42")).toThrow();
  });
  it("truncates the body in the prompt", () => {
    const prompt = buildAiUserPrompt({
      subject: "s",
      from: "f",
      fromName: "",
      body: "x".repeat(5000),
    });
    expect(prompt.length).toBeLessThan(1600);
  });
});

describe("mergeParsed", () => {
  const high: Classification = { type: "rejection", confidence: "high", hits: {} };
  const low: Classification = { type: "other", confidence: "low", hits: {} };

  it("skips AI when rules are complete and the classifier is confident", () => {
    expect(needsAi(high, { company: "A", role: "B" })).toBe(false);
    expect(needsAi(high, { company: "A" })).toBe(true);
    expect(needsAi(low, { company: "A", role: "B" })).toBe(true);
  });

  it("marks rule-only results", () => {
    expect(mergeParsed(high, { company: "A", role: "B" })).toEqual({
      company: "A",
      role: "B",
      type: "rejection",
      source: "rule",
    });
  });

  it("lets rules win and AI fill gaps", () => {
    const ai = {
      company: "Wrong",
      role: "SWE",
      type: "interview" as const,
      interviewTime: "2026-10-08T14:00:00-04:00",
    };
    expect(mergeParsed(low, { company: "Stripe" }, ai)).toEqual({
      company: "Stripe",
      role: "SWE",
      type: "interview",
      interviewTime: "2026-10-08T14:00:00-04:00",
      source: "ai",
    });
  });

  it("keeps the classifier's type when it is confident", () => {
    const ai = { company: "", role: "", type: "offer" as const, interviewTime: "" };
    expect(mergeParsed(high, { company: "A" }, ai).type).toBe("rejection");
  });
});

describe("interview time", () => {
  it("formats keeping the offset", () => {
    expect(formatInterviewTime("2026-10-08T14:00:00-04:00")).toBe("2026-10-08 14:00 (UTC-04:00)");
    expect(formatInterviewTime("2026-10-08T14:00:00Z")).toBe("2026-10-08 14:00 (UTC)");
    expect(formatInterviewTime("2026-10-08 14:00")).toBe("2026-10-08 14:00");
    expect(formatInterviewTime("next Tuesday")).toBe("next Tuesday");
  });

  it("builds calendar events with offset", () => {
    const e = buildCalendarEvent({
      company: "Stripe",
      role: "SWE",
      interviewTime: "2026-10-08T14:00:00-04:00",
      fallbackTimeZone: "America/New_York",
    });
    expect(e?.summary).toBe("面试 - Stripe - SWE");
    expect(e?.start.dateTime).toBe("2026-10-08T14:00:00-04:00");
    expect(e?.end.dateTime).toBe("2026-10-08T19:00:00.000Z");
  });

  it("uses the fallback zone when the time has no offset", () => {
    const e = buildCalendarEvent({
      company: "Stripe",
      role: "",
      interviewTime: "2026-10-08 23:30",
      durationMinutes: 45,
      fallbackTimeZone: "Asia/Shanghai",
    });
    expect(e?.start).toEqual({ dateTime: "2026-10-08T23:30:00", timeZone: "Asia/Shanghai" });
    expect(e?.end).toEqual({ dateTime: "2026-10-09T00:15:00", timeZone: "Asia/Shanghai" });
    expect(e?.summary).toBe("面试 - Stripe");
  });

  it("returns null for unparseable times", () => {
    expect(
      buildCalendarEvent({
        company: "A",
        role: "",
        interviewTime: "soon",
        fallbackTimeZone: "UTC",
      }),
    ).toBeNull();
  });
});

describe("defaultConfig", () => {
  it("maps every email type, with applied -> Applied", () => {
    expect(defaultConfig().statusMapping.applied).toBe("Applied");
    expect(Object.keys(defaultConfig().statusMapping).sort()).toEqual([...EMAIL_TYPES].sort());
  });

  it("fills the new applied mapping into configs saved before it existed", () => {
    const old = { statusMapping: { rejection: "已拒" } } as Partial<Config>;
    expect(normalizeConfig(old).statusMapping).toMatchObject({
      applied: "Applied",
      rejection: "已拒",
    });
  });
});

describe("validateConfig", () => {
  it("requires a spreadsheet and an enabled sheet", () => {
    expect(validateConfig(defaultConfig())).toHaveLength(2);
  });
  it("validates column letters", () => {
    const config = {
      ...defaultConfig(),
      spreadsheetId: "x",
      sheets: [
        {
          sheetTitle: "S",
          enabled: true,
          headerRow: 1,
          companyCol: "B",
          roleCol: "3",
          statusCol: "H",
        },
      ],
    };
    expect(validateConfig(config)).toEqual(["「S」职位列必须是列字母(如 B)"]);
  });
});

describe("buildIcs", () => {
  const base = {
    company: "Stripe",
    role: "SWE; Backend, Sr",
    uid: "abc@job-tracker-sync",
    now: new Date("2026-09-29T12:00:00Z"),
  };

  it("converts a time with offset to UTC", () => {
    const ics = buildIcs({ ...base, interviewTime: "2026-10-08T14:00:00-04:00" })!;
    expect(ics).toContain("DTSTART:20261008T180000Z\r\n");
    expect(ics).toContain("DTEND:20261008T190000Z\r\n");
    expect(ics).toContain("DTSTAMP:20260929T120000Z\r\n");
    expect(ics).toContain("SUMMARY:面试 - Stripe - SWE\\; Backend\\, Sr");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("uses floating local time when there is no offset", () => {
    const ics = buildIcs({ ...base, interviewTime: "2026-10-08 23:30", durationMinutes: 45 })!;
    expect(ics).toContain("DTSTART:20261008T233000\r\n");
    expect(ics).toContain("DTEND:20261009T001500\r\n");
  });

  it("returns null for unparseable times and builds safe file names", () => {
    expect(buildIcs({ ...base, interviewTime: "sometime" })).toBeNull();
    expect(icsFileName("Two Sigma / NYC")).toBe("interview-Two-Sigma-NYC.ics");
    expect(icsFileName("///")).toBe("interview-event.ics");
  });
});
