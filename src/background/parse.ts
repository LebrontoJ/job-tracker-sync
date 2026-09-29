import { classifyEmail } from "../core/classifier";
import { mergeParsed, needsAi } from "../core/mergeParsed";
import { parseByRules } from "../core/ruleParser";
import type { AiExtraction } from "../core/aiSchema";
import type { Config, EmailContent } from "../core/types";
import { AppError, serializeError } from "../shared/errors";
import type { ApiMap } from "../shared/messages";
import { extractWithGemini } from "./ai";

/** Rules first; the AI only runs when rules leave a gap or the type is uncertain. */
export async function parseEmail(
  config: Config,
  email: EmailContent,
): Promise<ApiMap["email:parse"]["res"]> {
  const classification = classifyEmail(email.subject, email.body);
  const rules = parseByRules(email);

  if (!needsAi(classification, rules)) {
    return { parsed: mergeParsed(classification, rules), ai: "skipped" };
  }
  if (!config.geminiApiKey) {
    return { parsed: mergeParsed(classification, rules), ai: "no_key" };
  }

  let extraction: AiExtraction;
  try {
    extraction = await extractWithGemini(config, email);
  } catch (err) {
    // A failed AI call never blocks the flow: fall back to whatever rules found.
    const error = err instanceof AppError ? err : new AppError("AI_UNAVAILABLE", String(err));
    return {
      parsed: mergeParsed(classification, rules),
      ai: "unavailable",
      aiError: serializeError(error),
    };
  }
  return { parsed: mergeParsed(classification, rules, extraction), ai: "used" };
}
