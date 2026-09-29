import { useEffect, useState } from "react";
import type { EmailContent } from "../core/types";
import type { ContentEvent, ContentRequest } from "../shared/messages";

const GMAIL_PREFIX = "https://mail.google.com/";

export interface GmailFeed {
  email: EmailContent | null;
  /** Why no email is available, if known (shown to the user). */
  problem: string | null;
}

async function readActiveTab(): Promise<GmailFeed> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith(GMAIL_PREFIX)) {
    return { email: null, problem: "请在 Gmail 标签页中打开一封邮件" };
  }
  try {
    const request: ContentRequest = { type: "email:get" };
    const email = (await chrome.tabs.sendMessage(tab.id, request)) as EmailContent | null;
    return { email, problem: null };
  } catch {
    // Content script missing: the tab was opened before the extension was installed/reloaded.
    return { email: null, problem: "未能读取邮件,请刷新 Gmail 页面,或手动填写 / 拖选" };
  }
}

/**
 * Follows the active Gmail tab: reads the open email on mount, on tab
 * switches, and whenever the content script reports a change. Also forwards
 * text the user selects in the email through `onSelection`.
 */
export function useGmailEmail(onSelection: (text: string) => void): GmailFeed {
  const [feed, setFeed] = useState<GmailFeed>({ email: null, problem: null });

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void readActiveTab().then((next) => alive && setFeed(next));
    };
    refresh();

    const onMessage = (message: ContentEvent, sender: chrome.runtime.MessageSender) => {
      if (sender.tab?.active && message.type === "email:changed") {
        setFeed({ email: message.email, problem: null });
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    chrome.tabs.onActivated.addListener(refresh);
    const onUpdated = (_id: number, info: { status?: string }) => {
      if (info.status === "complete") refresh();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      alive = false;
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  useEffect(() => {
    const onMessage = (message: ContentEvent, sender: chrome.runtime.MessageSender) => {
      if (sender.tab?.active && message.type === "selection:changed") onSelection(message.text);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [onSelection]);

  return feed;
}
