import { buildCalendarEvent } from "../core/interviewTime";
import { AppError } from "../shared/errors";
import { authedFetch } from "./auth";

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface CreateEventInput {
  company: string;
  role: string;
  interviewTime: string;
  timeZone: string;
}

/** Creates the interview event. The caller must have the user's explicit confirmation. */
export async function createInterviewEvent(input: CreateEventInput): Promise<{ htmlLink: string }> {
  const event = buildCalendarEvent({
    company: input.company,
    role: input.role,
    interviewTime: input.interviewTime,
    fallbackTimeZone: input.timeZone,
  });
  if (!event) throw new AppError("CALENDAR", `无法解析面试时间「${input.interviewTime}」`);

  const res = await authedFetch(
    EVENTS_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
    { calendar: true },
  );
  if (!res.ok) throw new AppError("CALENDAR", `创建日历事件失败(${res.status})`);
  const created = (await res.json()) as { htmlLink?: string };
  return { htmlLink: created.htmlLink ?? "" };
}
