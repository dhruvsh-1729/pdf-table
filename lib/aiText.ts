type AiMessageRole = "system" | "user" | "assistant";

export type AiChatMessage = {
  role: AiMessageRole;
  content: string;
};

type DeepSeekChatCompletionOptions = {
  messages: AiChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  model?: string;
};

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

function resolveDeepSeekApiKey() {
  return process.env.DEEPSEEK_API_KEY?.trim() || "";
}

function resolveDeepSeekBaseUrl() {
  return (process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL).replace(/\/+$/, "");
}

function resolveDeepSeekModel() {
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL;
}

function extractDeepSeekErrorMessage(payload: any, status: number) {
  const message =
    payload?.error?.message ||
    payload?.message ||
    payload?.error ||
    `DeepSeek API request failed with status ${status}.`;

  return typeof message === "string" && message.trim() ? message.trim() : `DeepSeek API request failed with status ${status}.`;
}

export function hasDeepSeekApiKey() {
  return Boolean(resolveDeepSeekApiKey());
}

export async function createDeepSeekChatCompletion({
  messages,
  temperature,
  topP,
  maxTokens,
  model,
}: DeepSeekChatCompletionOptions) {
  const apiKey = resolveDeepSeekApiKey();
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured on the server.");
  }

  const response = await fetch(`${resolveDeepSeekBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || resolveDeepSeekModel(),
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractDeepSeekErrorMessage(payload, response.status));
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("DeepSeek API response was empty.");
  }

  return content.trim();
}
