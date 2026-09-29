import type { AiExtraction } from "./aiSchema";
import type { Classification } from "./classifier";
import type { RuleParseResult } from "./ruleParser";
import type { ParsedEmail } from "./types";

/**
 * The AI is consulted when the rules left a field empty, or when the
 * classifier was unsure (no keyword, or keywords for several types).
 */
export function needsAi(classification: Classification, rules: RuleParseResult): boolean {
  return !rules.company || !rules.role || classification.confidence === "low";
}

/**
 * Combines rule output with the optional AI extraction. Rule-derived fields win;
 * the AI fills gaps. `source` is "ai" only if the AI contributed something.
 */
export function mergeParsed(
  classification: Classification,
  rules: RuleParseResult,
  ai?: AiExtraction,
): ParsedEmail {
  const company = rules.company ?? ai?.company ?? "";
  const role = rules.role ?? ai?.role ?? "";
  const type = classification.confidence === "high" || !ai ? classification.type : ai.type;
  const interviewTime = ai?.interviewTime || undefined;

  const aiContributed =
    !!ai &&
    ((!rules.company && !!ai.company) ||
      (!rules.role && !!ai.role) ||
      (classification.confidence === "low" && ai.type !== "other") ||
      !!interviewTime);

  return {
    company,
    role,
    type,
    ...(interviewTime && type === "interview" ? { interviewTime } : {}),
    source: aiContributed ? "ai" : "rule",
  };
}
