// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { extractEmail } from "../src/content/extract";

// Minimal replica of the Gmail selectors the extractor relies on.
const openMessage = (subject: string, senders: string[], bodies: string[]) => `
  <h2 class="hP">${subject}</h2>
  ${senders.map((s, i) => `<span class="gD" email="${s}" name="Sender ${i}">Sender ${i}</span>`).join("")}
  ${bodies.map((b) => `<div class="a3s aiL">${b}</div>`).join("")}
`;

describe("extractEmail", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.title = "Inbox (3) - me@gmail.com - Gmail";
  });

  it("returns null in the inbox list view", () => {
    document.body.innerHTML = "<table><tr><td>list</td></tr></table>";
    expect(extractEmail()).toBeNull();
  });

  it("reads subject, sender and body", () => {
    document.body.innerHTML = openMessage(
      "Your application to Stripe",
      ["jobs@stripe.com"],
      ["Unfortunately we will not be moving forward."],
    );
    expect(extractEmail()).toEqual({
      subject: "Your application to Stripe",
      from: "jobs@stripe.com",
      fromName: "Sender 0",
      body: "Unfortunately we will not be moving forward.",
    });
  });

  it("uses the newest message of a thread", () => {
    document.body.innerHTML = openMessage(
      "Re: hello",
      ["old@x.com", "new@x.com"],
      ["first message", "latest message"],
    );
    const email = extractEmail();
    expect(email?.from).toBe("new@x.com");
    expect(email?.body).toBe("latest message");
  });

  it("truncates long bodies to 1500 characters", () => {
    document.body.innerHTML = openMessage("s", ["a@b.com"], ["x".repeat(4000)]);
    expect(extractEmail()?.body).toHaveLength(1500);
  });

  it("falls back to the tab title when the subject element is missing", () => {
    document.title = "Interview invite - me@gmail.com - Gmail";
    document.body.innerHTML = `<div class="a3s aiL">body</div>`;
    expect(extractEmail()?.subject).toBe("Interview invite");
  });
});
