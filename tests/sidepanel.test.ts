// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/core/config";
import type { Config, EmailContent, MatchCandidate } from "../src/core/types";
import type { ApiRequest } from "../src/shared/messages";
import { App } from "../src/sidepanel/App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    },
  ],
};

const email: EmailContent = {
  subject: "Schedule your interview",
  from: "jobs@stripe.com",
  fromName: "Stripe",
  body: "Please share your availability.",
};

const candidate: MatchCandidate = {
  sheetTitle: "2026",
  rowIndex: 23,
  company: "Stripe",
  role: "Software Engineer",
  currentStatus: "Interview",
  rowValues: ["1", "Stripe", "Software Engineer"],
  score: 1,
  companyScore: 1,
  roleMismatch: false,
};

let root: Root;
let container: HTMLElement;
let calls: ApiRequest[];

function stubChrome() {
  calls = [];
  const respond = (req: ApiRequest) => {
    calls.push(req);
    switch (req.type) {
      case "email:parse":
        return {
          parsed: {
            company: "Stripe",
            role: "Software Engineer",
            type: "interview",
            source: "rule",
          },
          ai: "skipped",
        };
      case "match:search":
        return { candidates: [candidate] };
      case "status:options":
        return {
          options: ["Applied", "OA", "Interview", "Rejected"],
          source: "list",
          suggested: "OA",
        };
      case "status:apply":
        return { updatedCells: 1 };
      default:
        throw new Error(`unexpected ${req.type}`);
    }
  };

  vi.stubGlobal("chrome", {
    storage: {
      local: { get: async () => ({ config }) },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
    tabs: {
      query: async () => [{ id: 1, url: "https://mail.google.com/mail/u/0/#inbox/abc" }],
      sendMessage: async () => email,
      onActivated: { addListener: () => {}, removeListener: () => {} },
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      sendMessage: async (req: ApiRequest) => ({ ok: true, data: respond(req) }),
      onMessage: { addListener: () => {}, removeListener: () => {} },
      openOptionsPage: () => {},
    },
  });
}

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.replace(/\s/g, "") === label.replace(/\s/g, ""),
  );
const click = async (label: string) => {
  const el = button(label);
  if (!el) throw new Error(`no button "${label}" in:\n${container.textContent}`);
  await act(async () => el.click());
  await flush();
};

beforeEach(async () => {
  stubChrome();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(App)));
  await flush();
  await flush();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("side panel flow", () => {
  it("parses the open email into the form", () => {
    expect((container.querySelector("#company") as HTMLInputElement).value).toBe("Stripe");
    expect((container.querySelector("#role") as HTMLInputElement).value).toBe("Software Engineer");
    expect((container.querySelector("#type") as HTMLSelectElement).value).toBe("interview");
    expect(container.textContent).toContain("解析来源:规则");
    expect(calls.map((c) => c.type)).toEqual(["email:parse"]);
  });

  it("searches, previews the pre-selected status, warns before a regression, then writes", async () => {
    await click("查找");
    expect(container.textContent).toContain("找到 1 条");
    expect(container.textContent).toContain("第 23 行");

    await click("更新");
    // Suggested "OA" is earlier than the current "Interview": needs explicit confirmation.
    expect((container.querySelector("#status") as HTMLSelectElement).value).toBe("OA");
    expect(container.textContent).toContain("确认改回 OA");

    await click("仍然改为此状态");
    const apply = calls.find((c) => c.type === "status:apply");
    expect(apply).toBeUndefined(); // the first click only acknowledges the warning

    await click("确认");
    expect(calls.find((c) => c.type === "status:apply")?.payload).toMatchObject({
      newStatus: "OA",
      candidate: { rowIndex: 23 },
    });
    expect(container.textContent).toContain("已将第 23 行更新为「OA」");
  });

  it("invalidates results when the company is edited", async () => {
    await click("查找");
    expect(container.textContent).toContain("找到 1 条");

    const input = container.querySelector("#company") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "Google");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).not.toContain("找到 1 条");
    expect(container.textContent).toContain("解析来源:手动");
  });
});
