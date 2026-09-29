const ISO_RE =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

export interface InterviewTimeParts {
  date: string;
  time: string;
  seconds: string;
  offset: string | null;
}

/** Splits an ISO-8601-ish time; null when it cannot be understood. */
export function parseInterviewTime(iso: string): InterviewTimeParts | null {
  const m = ISO_RE.exec(iso.trim());
  if (!m) return null;
  const rawOffset = m[4];
  let offset: string | null = null;
  if (rawOffset) {
    offset = rawOffset === "Z" ? "Z" : rawOffset.replace(/^([+-]\d{2}):?(\d{2})$/, "$1:$2");
  }
  return { date: m[1] as string, time: m[2] as string, seconds: m[3] ?? "00", offset };
}

/**
 * Human-readable interview time for the notes column, keeping the original
 * offset: "2026-10-08T14:00:00-04:00" -> "2026-10-08 14:00 (UTC-04:00)".
 * Unparseable input is returned unchanged.
 */
export function formatInterviewTime(iso: string): string {
  const p = parseInterviewTime(iso);
  if (!p) return iso.trim();
  const suffix = p.offset ? ` (${p.offset === "Z" ? "UTC" : `UTC${p.offset}`})` : "";
  return `${p.date} ${p.time}${suffix}`;
}

export interface CalendarEventInput {
  company: string;
  role: string;
  /** ISO 8601, ideally with an offset. */
  interviewTime: string;
  durationMinutes?: number;
  /** IANA zone used when `interviewTime` carries no offset. */
  fallbackTimeZone: string;
}

export interface CalendarEvent {
  summary: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
}

/** Builds a Google Calendar `events.insert` body, or null if the time is unparseable. */
export function buildCalendarEvent(input: CalendarEventInput): CalendarEvent | null {
  const p = parseInterviewTime(input.interviewTime);
  if (!p) return null;
  const minutes = input.durationMinutes ?? 60;
  const summary = ["面试", input.company, input.role].filter(Boolean).join(" - ");

  const startLocal = `${p.date}T${p.time}:${p.seconds}`;
  if (p.offset) {
    const startMs = Date.parse(`${startLocal}${p.offset}`);
    if (Number.isNaN(startMs)) return null;
    return {
      summary,
      start: { dateTime: `${startLocal}${p.offset}` },
      end: { dateTime: new Date(startMs + minutes * 60_000).toISOString() },
    };
  }

  // No offset: do the arithmetic on wall-clock time and let the calendar apply the zone.
  const wall = Date.parse(`${startLocal}Z`);
  if (Number.isNaN(wall)) return null;
  const endLocal = new Date(wall + minutes * 60_000).toISOString().slice(0, 19);
  return {
    summary,
    start: { dateTime: startLocal, timeZone: input.fallbackTimeZone },
    end: { dateTime: endLocal, timeZone: input.fallbackTimeZone },
  };
}
