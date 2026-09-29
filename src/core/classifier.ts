import type { EmailType } from "./types";

type ClassifiableType = Exclude<EmailType, "other">;

const KEYWORDS: Record<ClassifiableType, string[]> = {
  rejection: [
    "unfortunately",
    "not moving forward",
    "not be moving forward",
    "decided to pursue other candidates",
    "decided to move forward with other",
    "regret to inform",
    "will not be proceeding",
    "not selected",
    "position has been filled",
    "很遗憾",
    "未能通过",
  ],
  interview: [
    "schedule an interview",
    "schedule your interview",
    "schedule a call",
    "invite you to interview",
    "invite you to an interview",
    "interview invitation",
    "next steps",
    "your availability",
    "phone screen",
    "recruiter call",
    "面试邀请",
    "邀请您参加面试",
  ],
  assessment: [
    "online assessment",
    "technical assessment",
    "coding challenge",
    "hackerrank",
    "codesignal",
    "codility",
    "take-home",
    "take home",
    "在线测评",
    "笔试",
  ],
  applied: [
    "thank you for applying",
    "thanks for applying",
    "we received your application",
    "we have received your application",
    "application received",
    "application has been received",
    "successfully submitted",
    "your application has been submitted",
    "已收到您的申请",
    "投递成功",
  ],
  offer: [
    "pleased to offer",
    "excited to offer",
    "offer letter",
    "offer of employment",
    "录用通知",
  ],
};

/** When several types match, the earlier entry wins. */
const PRIORITY: ClassifiableType[] = ["offer", "rejection", "interview", "assessment", "applied"];

/**
 * Confirmation wording ("thank you for applying") also opens many rejections
 * and interview invites, so it only counts when nothing more specific matched.
 */
const WEAK: ClassifiableType = "applied";

export interface Classification {
  type: EmailType;
  /**
   * "high": exactly one type matched. "low": nothing or several types matched,
   * so the caller should ask the AI to double-check.
   */
  confidence: "high" | "low";
  hits: Partial<Record<ClassifiableType, string[]>>;
}

export function classifyEmail(subject: string, body: string): Classification {
  const text = `${subject}\n${body}`.toLowerCase();

  const hits: Classification["hits"] = {};
  for (const type of PRIORITY) {
    const found = KEYWORDS[type].filter((k) => text.includes(k));
    if (found.length > 0) hits[type] = found;
  }

  let matched = PRIORITY.filter((t) => hits[t]);
  if (matched.some((t) => t !== WEAK)) matched = matched.filter((t) => t !== WEAK);
  const winner = matched[0];
  if (!winner) return { type: "other", confidence: "low", hits };
  return { type: winner, confidence: matched.length === 1 ? "high" : "low", hits };
}
