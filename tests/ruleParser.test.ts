import { describe, expect, it } from "vitest";
import { parseByRules } from "../src/core/ruleParser";
import type { EmailContent } from "../src/core/types";

const email = (over: Partial<EmailContent>): EmailContent => ({
  subject: "",
  from: "",
  fromName: "",
  body: "",
  ...over,
});

describe("parseByRules", () => {
  it("extracts role and company from 'application for X at Y'", () => {
    expect(
      parseByRules(email({ subject: "Your application for Software Engineer at Stripe" })),
    ).toEqual({ company: "Stripe", role: "Software Engineer" });
  });

  it("extracts the company from 'your application to X'", () => {
    expect(parseByRules(email({ subject: "Your application to Stripe" }))).toEqual({
      company: "Stripe",
    });
  });

  it("classifies a captured phrase as role when it looks like one", () => {
    const r = parseByRules(
      email({ subject: "Update on your Software Engineer application", from: "x@y.com" }),
    );
    expect(r.role).toBe("Software Engineer");
    expect(r.company).toBeUndefined();
  });

  it("treats a captured brand as company", () => {
    expect(parseByRules(email({ subject: "An update on your Airbnb application" })).company).toBe(
      "Airbnb",
    );
  });

  it("handles 'thank you for applying to X.'", () => {
    expect(
      parseByRules(email({ subject: "Thanks", body: "Thank you for applying to Notion. We…" })),
    ).toEqual({ company: "Notion" });
  });

  it("reads 'position of X at Y' from the body", () => {
    expect(
      parseByRules(email({ body: "…regarding the position of Backend Engineer at Ramp, we…" })),
    ).toEqual({ company: "Ramp", role: "Backend Engineer" });
  });

  it("uses the sender name for ATS domains only", () => {
    expect(
      parseByRules(
        email({
          from: "no-reply@us.greenhouse-mail.io",
          fromName: "Figma Recruiting",
          subject: "Hi",
        }),
      ).company,
    ).toBe("Figma");
    expect(
      parseByRules(email({ from: "jane@calendly.com", fromName: "Jane Smith", subject: "Hi" }))
        .company,
    ).toBeUndefined();
  });

  it("ignores ATS vendor names as company", () => {
    expect(
      parseByRules(email({ from: "a@hire.lever.co", fromName: "Lever", subject: "Hi" })).company,
    ).toBeUndefined();
  });

  it("rejects implausibly long captures", () => {
    const long = "word ".repeat(20);
    expect(parseByRules(email({ subject: `Your application to ${long}` })).company).toBeUndefined();
  });
});
