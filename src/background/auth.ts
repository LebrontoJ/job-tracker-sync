import { AppError } from "../shared/errors";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export interface TokenOptions {
  interactive?: boolean;
  /** Also request the Calendar scope (M8). */
  calendar?: boolean;
}

function scopesFor(opts: TokenOptions): string[] {
  return opts.calendar ? [SHEETS_SCOPE, CALENDAR_SCOPE] : [SHEETS_SCOPE];
}

/**
 * Gets an OAuth access token. Non-interactive by default so a background
 * request never pops a consent window; the options page triggers the
 * interactive flow explicitly.
 */
export async function getToken(opts: TokenOptions = {}): Promise<string> {
  try {
    const result = await chrome.identity.getAuthToken({
      interactive: opts.interactive ?? false,
      scopes: scopesFor(opts),
    });
    if (!result.token) throw new Error("empty token");
    return result.token;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new AppError("AUTH", `未授权或授权已失效,请在设置页重新授权(${detail})`);
  }
}

export async function invalidateToken(token: string): Promise<void> {
  await chrome.identity.removeCachedAuthToken({ token });
}

/**
 * Revokes the grant server-side (best effort) and clears every cached token,
 * so the next sign-in starts from a clean consent flow.
 */
export async function signOut(): Promise<void> {
  try {
    const { token } = await chrome.identity.getAuthToken({ interactive: false });
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
    }
  } catch {
    // No cached token - nothing to revoke.
  }
  await chrome.identity.clearAllCachedAuthTokens();
}

/**
 * fetch() with a Bearer token. On 401 the cached token is dropped and the
 * request is retried exactly once.
 */
export async function authedFetch(
  url: string,
  init: RequestInit = {},
  opts: TokenOptions = {},
): Promise<Response> {
  const send = async (token: string) =>
    fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });

  const token = await getToken(opts);
  const res = await send(token);
  if (res.status !== 401) return res;

  await invalidateToken(token);
  return send(await getToken(opts));
}
