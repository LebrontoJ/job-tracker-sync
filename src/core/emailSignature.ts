import type { EmailContent } from "./types";

/** Stable identity of an email, used to avoid re-parsing the same one. */
export function emailSignature(email: EmailContent | null): string {
  return email ? `${email.subject}\u0000${email.from}\u0000${email.body.slice(0, 200)}` : "";
}
