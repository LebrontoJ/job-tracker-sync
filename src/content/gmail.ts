import type { ContentEvent, ContentRequest } from "../shared/messages";
import { emailSignature } from "../core/emailSignature";
import { extractEmail } from "./extract";

const MAX_SELECTION_LENGTH = 200;

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function emit(event: ContentEvent): void {
  // After an extension reload the old content script is orphaned and
  // chrome.runtime.id is gone; a closed side panel means no receiver. Both are fine.
  if (!chrome.runtime?.id) return;
  chrome.runtime.sendMessage(event).catch(() => undefined);
}

let lastSignature = "";

function checkEmail(force = false): void {
  const email = extractEmail();
  const signature = emailSignature(email);
  if (!force && signature === lastSignature) return;
  lastSignature = signature;
  emit({ type: "email:changed", email });
}

// Gmail is a single-page app: navigation shows up as hash changes and DOM mutations.
const scheduleCheck = debounce(() => checkEmail(), 400);
window.addEventListener("hashchange", scheduleCheck);
new MutationObserver(scheduleCheck).observe(document.body, { childList: true, subtree: true });

// Text the user drags across in the email body is offered to the side panel,
// which decides which field (company / role) it goes into.
document.addEventListener(
  "selectionchange",
  debounce(() => {
    const text = window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (text && text.length <= MAX_SELECTION_LENGTH) emit({ type: "selection:changed", text });
  }, 200),
);

chrome.runtime.onMessage.addListener((message: ContentRequest, _sender, sendResponse) => {
  if (message?.type !== "email:get") return false;
  const email = extractEmail();
  lastSignature = emailSignature(email);
  sendResponse(email);
  return false;
});

checkEmail(true);
