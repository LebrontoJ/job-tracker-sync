import { normalizeConfig } from "../core/config";
import type { Config } from "../core/types";

const KEY = "config";

export async function loadConfig(): Promise<Config> {
  const stored = await chrome.storage.local.get(KEY);
  return normalizeConfig(stored[KEY] as Partial<Config> | undefined);
}

export async function saveConfig(config: Config): Promise<void> {
  await chrome.storage.local.set({ [KEY]: config });
}

/** Calls `listener` whenever the stored config changes; returns an unsubscribe fn. */
export function onConfigChanged(listener: (config: Config) => void): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && changes[KEY]) {
      listener(normalizeConfig(changes[KEY].newValue as Partial<Config> | undefined));
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
