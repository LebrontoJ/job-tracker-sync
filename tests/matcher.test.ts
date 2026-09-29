import { describe, expect, it } from "vitest";
import {
  companyScore,
  findCandidates,
  isConfident,
  roleScore,
  searchOutcome,
} from "../src/core/matcher";
import type { SheetRow } from "../src/core/types";

const row = (
  rowIndex: number,
  company: string,
  role: string,
  currentStatus = "Applied",
): SheetRow => ({
  sheetTitle: "2026",
  rowIndex,
  company,
  role,
  currentStatus,
});

// A small stand-in for a real tracker.
const SHEET: SheetRow[] = [
  row(2, "Stripe", "Software Engineer"),
  row(3, "Stripe", "Data Scientist", "Rejected"),
  row(4, "Google", "Software Engineer, Backend"),
  row(5, "Meta Platforms, Inc.", "Software Engineer Intern"),
  row(6, "Amazon Web Services", "SDE II"),
  row(7, "Airbnb", "Senior Software Engineer"),
  row(8, "Databricks", "Sr. Software Developer"),
  row(9, "Two Sigma", "Quantitative Researcher"),
  row(10, "Jane Street Capital", "Software Engineer"),
  row(11, "Palantir Technologies", "Forward Deployed Engineer"),
  row(12, "Snowflake", "Software Engineer"),
  row(13, "Microsoft", "Software Engineer II"),
  row(14, "Apple", "Machine Learning Engineer"),
  row(15, "Netflix", "Senior Data Engineer"),
  row(16, "Uber", "Backend Engineer"),
  row(17, "Lyft", "Software Engineer"),
  row(18, "Coinbase", "Security Engineer"),
  row(19, "字节跳动", "后端开发工程师"),
  row(20, "OpenAI", "Research Engineer"),
];

describe("companyScore", () => {
  it("is 1 for equal names after normalisation", () => {
    expect(companyScore("Stripe, Inc.", "stripe")).toBe(1);
  });
  it("is 0.9 when one name's tokens contain the other's", () => {
    expect(companyScore("Amazon", "Amazon Web Services")).toBe(0.9);
  });
  it("is low for unrelated names", () => {
    expect(companyScore("Stripe", "Snowflake")).toBeLessThan(0.8);
  });
});

describe("roleScore", () => {
  it("treats SWE and Software Engineer as equal", () => {
    expect(roleScore("SWE", "Software Engineer")).toBeCloseTo(1);
  });
  it("penalises clashing levels", () => {
    expect(roleScore("Software Engineer Intern", "Senior Software Engineer")).toBeLessThan(
      roleScore("Software Engineer", "Senior Software Engineer"),
    );
  });
});

describe("findCandidates", () => {
  it("finds a single exact hit", () => {
    const hits = findCandidates(SHEET, { company: "Google", role: "Software Engineer" });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.rowIndex).toBe(4);
    expect(searchOutcome(hits)).toBe("FOUND_ONE");
    expect(isConfident(hits[0]!)).toBe(true);
  });

  it("handles suffix and case differences", () => {
    const hits = findCandidates(SHEET, { company: "META", role: "Software Engineer Intern" });
    expect(hits[0]?.rowIndex).toBe(5);
  });

  it("ranks the best role first among same-company rows", () => {
    const hits = findCandidates(SHEET, { company: "Stripe", role: "Data Scientist" });
    expect(hits.map((h) => h.rowIndex)).toEqual([3, 2]);
    expect(hits[1]?.roleMismatch).toBe(true);
    expect(searchOutcome(hits)).toBe("FOUND_MULTI");
  });

  it("matches on company alone when the role is empty, in-progress rows first", () => {
    const hits = findCandidates(
      SHEET,
      { company: "Stripe", role: "" },
      { finishedStatuses: ["Rejected", "Offer"] },
    );
    expect(hits.map((h) => h.rowIndex)).toEqual([2, 3]);
  });

  it("expands abbreviations in the role", () => {
    const hits = findCandidates(SHEET, { company: "Databricks", role: "Senior SWE" });
    expect(hits[0]?.rowIndex).toBe(8);
    expect(hits[0]?.roleMismatch).toBe(false);
  });

  it("matches CJK company names", () => {
    expect(findCandidates(SHEET, { company: "字节跳动", role: "" })[0]?.rowIndex).toBe(19);
  });

  it("applies the hard company gate", () => {
    expect(findCandidates(SHEET, { company: "Spotify", role: "Software Engineer" })).toEqual([]);
    expect(searchOutcome([])).toBe("NOT_FOUND");
  });

  it("returns nothing for an empty company", () => {
    expect(findCandidates(SHEET, { company: "  ", role: "x" })).toEqual([]);
  });
});
