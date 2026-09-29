import type { EmailType } from "../core/types";

export const TYPE_LABELS: Record<EmailType, string> = {
  applied: "已投递",
  rejection: "拒信",
  interview: "约面试",
  assessment: "OA / 测评",
  offer: "Offer",
  other: "其他",
};

export const SOURCE_LABELS = { rule: "规则", ai: "AI", manual: "手动" } as const;
