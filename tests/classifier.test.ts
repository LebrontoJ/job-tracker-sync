import { describe, expect, it } from "vitest";
import { classifyEmail } from "../src/core/classifier";

describe("classifyEmail", () => {
  it("detects rejections", () => {
    const r = classifyEmail(
      "Update on your application",
      "Unfortunately, we have decided to pursue other candidates.",
    );
    expect(r).toMatchObject({ type: "rejection", confidence: "high" });
  });

  it("detects interview invitations", () => {
    expect(classifyEmail("Schedule your interview", "Please share your availability.").type).toBe(
      "interview",
    );
  });

  it("detects assessments", () => {
    expect(classifyEmail("Next step", "Complete the HackerRank online assessment.").type).toBe(
      "assessment",
    );
  });

  it("detects offers", () => {
    expect(classifyEmail("Your offer", "We are pleased to offer you the role.").type).toBe("offer");
  });

  it("resolves conflicts by priority offer > rejection > interview > assessment, with low confidence", () => {
    const r = classifyEmail(
      "Next steps",
      "We are pleased to offer you… unfortunately the start date…",
    );
    expect(r).toMatchObject({ type: "offer", confidence: "low" });
    expect(classifyEmail("x", "online assessment, then schedule an interview").type).toBe(
      "interview",
    );
  });

  it("falls back to other with low confidence", () => {
    expect(classifyEmail("Thanks for applying", "We received your application.")).toMatchObject({
      type: "other",
      confidence: "low",
    });
  });
});
