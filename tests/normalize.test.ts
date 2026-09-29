import { describe, expect, it } from "vitest";
import { normalizeCompany, normalizeRole } from "../src/core/normalize";
import { jaroWinkler, tokenJaccard } from "../src/core/similarity";

describe("normalizeCompany", () => {
  it.each([
    ["Stripe, Inc.", "stripe"],
    ["Acme Technologies LLC", "acme"],
    ["  Two   Sigma  ", "two sigma"],
    ["Johnson & Johnson", "johnson and johnson"],
    ["Labs", "labs"], // never reduced to nothing
    ["字节跳动", "字节跳动"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeCompany(input)).toBe(expected);
  });
});

describe("normalizeRole", () => {
  it("expands synonyms", () => {
    expect(normalizeRole("SWE").tokens).toEqual(["software", "engineer"]);
    expect(normalizeRole("Software Developer").tokens).toEqual(["software", "engineer"]);
    expect(normalizeRole("Sr. Software Engineer").levels).toEqual(["senior"]);
  });

  it("keeps level markers apart from core tokens", () => {
    const r = normalizeRole("Software Engineer II");
    expect(r.tokens).toEqual(["software", "engineer"]);
    expect(r.levels).toEqual(["ii"]);
  });
});

describe("similarity", () => {
  it("jaroWinkler is 1 for equal strings and 0 for disjoint ones", () => {
    expect(jaroWinkler("stripe", "stripe")).toBe(1);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });

  it("jaroWinkler matches the textbook value for MARTHA/MARHTA", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 3);
  });

  it("tokenJaccard", () => {
    expect(tokenJaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(tokenJaccard([], [])).toBe(1);
  });
});
