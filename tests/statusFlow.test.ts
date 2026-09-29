import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/core/config";
import { isRegression, isSameStatus, suggestStatus } from "../src/core/statusFlow";

const ORDER = ["Applied", "OA", "Interview", "Offer"];

describe("isRegression", () => {
  it("flags moves backwards", () => {
    expect(isRegression("Interview", "OA", ORDER)).toBe(true);
    expect(isRegression("interview", "applied", ORDER)).toBe(true);
  });
  it("allows forward moves, same status and unknown statuses", () => {
    expect(isRegression("OA", "Interview", ORDER)).toBe(false);
    expect(isRegression("OA", "OA", ORDER)).toBe(false);
    expect(isRegression("Interview", "Rejected", ORDER)).toBe(false);
    expect(isRegression("Rejected", "Interview", ORDER)).toBe(false);
  });
});

describe("isSameStatus", () => {
  it("ignores case and whitespace, but never matches an empty status", () => {
    expect(isSameStatus(" interview ", "Interview")).toBe(true);
    expect(isSameStatus("", "")).toBe(false);
  });
});

describe("suggestStatus", () => {
  const mapping = defaultConfig().statusMapping;

  it("uses the configured mapping when present in the options", () => {
    expect(suggestStatus("interview", ["Applied", "Interview", "Rejected"], mapping)).toBe(
      "Interview",
    );
  });

  it("matches the mapping case-insensitively", () => {
    expect(suggestStatus("rejection", ["applied", "rejected"], mapping)).toBe("rejected");
  });

  it("falls back to keywords", () => {
    expect(suggestStatus("interview", ["已投递", "约面", "拒绝"], mapping)).toBe("约面");
    expect(suggestStatus("rejection", ["Applied", "Declined"], mapping)).toBe("Declined");
    expect(suggestStatus("assessment", ["Applied", "Online Assessment"], mapping)).toBe(
      "Online Assessment",
    );
  });

  it("matches short keywords as whole words only", () => {
    expect(suggestStatus("assessment", ["Goal set", "Applied"], mapping)).toBeNull();
    expect(
      suggestStatus("assessment", ["Applied", "OA sent"], { ...mapping, assessment: null }),
    ).toBe("OA sent");
  });

  it("suggests the applied status", () => {
    expect(suggestStatus("applied", ["Applied", "OA", "Interview"], mapping)).toBe("Applied");
    // Falls back to keywords when the sheet uses different wording.
    expect(suggestStatus("applied", ["待投递", "已投递", "面试中"], mapping)).toBe("已投递");
    expect(suggestStatus("applied", ["Backlog", "Interview"], mapping)).toBeNull();
  });

  it("returns null when nothing fits", () => {
    expect(suggestStatus("other", ["Applied"], mapping)).toBeNull();
    expect(suggestStatus("offer", ["Applied"], mapping)).toBeNull();
  });
});
