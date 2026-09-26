type AiMessageRole = "system" | "user" | "assistant";

export type AiChatMessage = {
  role: AiMessageRole;
  content: string;
};

type ChatCompletionOptions = {
  messages: AiChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  model?: string;
};

// Sarvam AI (OpenAI-compatible chat completions). sarvam-105b is the current
// general model; the older sarvam-m / sarvam-30b are deprecated by the API.
const DEFAULT_SARVAM_BASE_URL = "https://api.sarvam.ai/v1";
const DEFAULT_SARVAM_MODEL = "sarvam-105b";

function resolveApiKey() {
  return process.env.SARVAM_API_KEY?.trim() || "";
}

function resolveBaseUrl() {
  return (process.env.SARVAM_BASE_URL?.trim() || DEFAULT_SARVAM_BASE_URL).replace(/\/+$/, "");
}

function resolveModel() {
  return process.env.SARVAM_MODEL?.trim() || DEFAULT_SARVAM_MODEL;
}

function extractErrorMessage(payload: any, status: number) {
  const message =
    payload?.error?.message || payload?.message || payload?.error || `Sarvam AI request failed with status ${status}.`;

  return typeof message === "string" && message.trim() ? message.trim() : `Sarvam AI request failed with status ${status}.`;
}

/** Drop any inline chain-of-thought some reasoning models emit in the content. */
function stripReasoning(content: string) {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export function hasAiApiKey() {
  return Boolean(resolveApiKey());
}

export const AI_KEY_MISSING_MESSAGE = "SARVAM_API_KEY is not configured on the server.";

export async function createChatCompletion({ messages, temperature, topP, maxTokens, model }: ChatCompletionOptions) {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    throw new Error(AI_KEY_MISSING_MESSAGE);
  }

  const response = await fetch(`${resolveBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || resolveModel(),
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      // sarvam-105b is a reasoning model. With thinking on, it spends the whole
      // max_tokens budget reasoning and returns no answer; null turns it off.
      reasoning_effort: null,
      stream: false,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, response.status));
  }

  const raw = payload?.choices?.[0]?.message?.content;
  const content = typeof raw === "string" ? stripReasoning(raw) : "";
  if (!content) {
    throw new Error("Sarvam AI response was empty.");
  }

  return content;
}
