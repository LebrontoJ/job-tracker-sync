import { parseInterviewTime } from "./interviewTime";

export interface IcsInput {
  company: string;
  role: string;
  /** ISO 8601, ideally with an offset. Without one, the event uses floating local time. */
  interviewTime: string;
  durationMinutes?: number;
  /** Unique event id; a fresh UUID for real use, fixed in tests. */
  uid: string;
  now: Date;
}

const utcStamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** RFC 5545 text escaping. */
const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line at 75 characters, as required by RFC 5545. */
function fold(line: string): string {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 74) parts.push(line.slice(i, i + 74));
  return parts.join("\r\n ");
}

/**
 * Builds an iCalendar file that Calendar.app (and other clients) can import
 * by double-clicking. Returns null if the time is unparseable.
 */
export function buildIcs(input: IcsInput): string | null {
  const p = parseInterviewTime(input.interviewTime);
  if (!p) return null;
  const minutes = input.durationMinutes ?? 60;

  let dtStart: string;
  let dtEnd: string;
  const startLocal = `${p.date}T${p.time}:${p.seconds}`;
  if (p.offset) {
    const startMs = Date.parse(`${startLocal}${p.offset}`);
    if (Number.isNaN(startMs)) return null;
    dtStart = `DTSTART:${utcStamp(new Date(startMs))}`;
    dtEnd = `DTEND:${utcStamp(new Date(startMs + minutes * 60_000))}`;
  } else {
    const wallMs = Date.parse(`${startLocal}Z`);
    if (Number.isNaN(wallMs)) return null;
    const floating = (d: Date) => utcStamp(d).slice(0, -1);
    dtStart = `DTSTART:${floating(new Date(wallMs))}`;
    dtEnd = `DTEND:${floating(new Date(wallMs + minutes * 60_000))}`;
  }

  const summary = ["面试", input.company, input.role].filter(Boolean).join(" - ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Job Tracker Sync//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${utcStamp(input.now)}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(`来自 Job Tracker Sync 的面试邮件\n原始时间:${input.interviewTime}`)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:面试提醒",
    "TRIGGER:-PT30M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A safe file name such as "interview-Stripe.ics". */
export function icsFileName(company: string): string {
  const slug = company.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return `interview-${slug || "event"}.ics`;
}
