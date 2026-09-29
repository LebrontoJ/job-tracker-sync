import { BODY_LIMIT } from "../core/types";
import type { EmailContent } from "../core/types";

// Gmail's class names are obfuscated and change occasionally, so every lookup
// has a fallback and extraction never throws.
const SUBJECT = "h2.hP";
const SENDER = "span.gD[email]";
const BODY = "div.a3s.aiL, div.a3s";

/** "Subject - me@gmail.com - Gmail" -> "Subject" */
function subjectFromTitle(title: string): string {
  return title.replace(/\s+-\s+[^-]*-\s*Gmail$/i, "").trim();
}

function last<T extends Element>(root: ParentNode, selector: string): T | null {
  const all = root.querySelectorAll<T>(selector);
  return all.length ? (all[all.length - 1] ?? null) : null;
}

/**
 * Reads the currently open message. In a thread the last message is used, as
 * that is the newest. Returns null when no message is open (inbox list view).
 */
export function extractEmail(doc: Document = document): EmailContent | null {
  try {
    const bodyEl = last<HTMLElement>(doc, BODY);
    const subjectEl = doc.querySelector<HTMLElement>(SUBJECT);
    if (!bodyEl && !subjectEl) return null;

    const senderEl = last<HTMLElement>(doc, SENDER);
    return {
      subject: (subjectEl?.innerText || subjectFromTitle(doc.title)).trim(),
      from: senderEl?.getAttribute("email") ?? "",
      fromName: (senderEl?.getAttribute("name") ?? senderEl?.innerText ?? "").trim(),
      body: (bodyEl?.innerText ?? "").trim().slice(0, BODY_LIMIT),
    };
  } catch {
    return null;
  }
}
