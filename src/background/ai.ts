import {
  AI_RESPONSE_SCHEMA,
  AI_SYSTEM_PROMPT,
  buildAiUserPrompt,
  parseAiResponse,
} from "../core/aiSchema";
import type { AiExtraction } from "../core/aiSchema";
import { DEFAULT_GEMINI_MODEL } from "../core/types";
import type { Config, EmailContent } from "../core/types";
import { AppError } from "../shared/errors";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 20_000;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/** Asks Gemini to extract company / role / type / interview time from an email. */
export async function extractWithGemini(
  config: Pick<Config, "geminiApiKey" | "geminiModel">,
  email: EmailContent,
): Promise<AiExtraction> {
  if (!config.geminiApiKey) throw new AppError("NO_AI_KEY", "未配置 Gemini API Key");
  const model = config.geminiModel || DEFAULT_GEMINI_MODEL;

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header instead of ?key= so the key never lands in URLs or logs.
        "x-goog-api-key": config.geminiApiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: buildAiUserPrompt(email) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: AI_RESPONSE_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError("AI_UNAVAILABLE", "AI 暂不可用(网络错误或超时),请手动填写或拖选");
  }

  if (res.status === 429) {
    throw new AppError("AI_RATE_LIMIT", "AI 暂不可用(请求过于频繁),请手动填写或拖选");
  }
  if (!res.ok) {
    throw new AppError("AI_UNAVAILABLE", `AI 暂不可用(${res.status}),请手动填写或拖选`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new AppError("AI_UNAVAILABLE", "AI 未返回内容,请手动填写或拖选");
  try {
    return parseAiResponse(text);
  } catch {
    throw new AppError("AI_UNAVAILABLE", "AI 返回了无法解析的内容,请手动填写或拖选");
  }
}
