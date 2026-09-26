// ops/ai.mjs — Sarvam chat client for ops scripts, with cost accounting and a hard budget.
// Prices (sarvam-105b, from sarvam.ai/api-pricing, 2026-09-26): ₹29.28 / 1M input, ₹73.20 / 1M output.
const PRICE_IN = 29.28 / 1e6;
const PRICE_OUT = 73.2 / 1e6;
export const AI_MODEL = process.env.SARVAM_MODEL?.trim() || "sarvam-105b";

export class BudgetExceeded extends Error {}

export function createAi({ budgetInr }) {
  const usage = { calls: 0, input: 0, output: 0, costInr: 0, errors: 0 };

  async function chat(messages, { maxTokens = 600, temperature = 0 } = {}) {
    if (usage.costInr >= budgetInr) throw new BudgetExceeded(`AI budget ₹${budgetInr} reached`);
    for (let attempt = 1; ; attempt++) {
      const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
        method: "POST",
        headers: { "api-subscription-key": process.env.SARVAM_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model: AI_MODEL, messages, temperature, max_tokens: maxTokens, reasoning_effort: null }),
        signal: AbortSignal.timeout(120_000),
      }).catch((err) => ({ ok: false, status: 0, json: async () => ({ message: err.message }) }));
      const payload = await res.json().catch(() => null);
      if (res.ok) {
        usage.calls += 1;
        usage.input += payload?.usage?.prompt_tokens ?? 0;
        usage.output += payload?.usage?.completion_tokens ?? 0;
        usage.costInr = usage.input * PRICE_IN + usage.output * PRICE_OUT;
        const content = String(payload?.choices?.[0]?.message?.content ?? "")
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .trim();
        if (!content) throw new Error("empty AI response");
        return content;
      }
      const retryable = res.status === 429 || res.status >= 500 || res.status === 0;
      if (!retryable || attempt >= 5) {
        usage.errors += 1;
        const msg = payload?.error?.message || payload?.message || JSON.stringify(payload)?.slice(0, 200);
        const err = new Error(`Sarvam ${res.status}: ${msg}`);
        err.status = res.status;
        throw err;
      }
      await new Promise((r) => setTimeout(r, 2000 * attempt ** 2));
    }
  }

  return { chat, usage };
}

// Pull the first JSON object out of a model reply.
export function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error(`no JSON in reply: ${text.slice(0, 120)}`);
  return JSON.parse(text.slice(start, end + 1));
}

// Long texts: keep the opening and the ending, where arguments and conclusions live.
export function excerpt(text, max = 14000) {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  const head = Math.floor(max * 0.7);
  return `${t.slice(0, head)}\n\n[… middle of the article omitted …]\n\n${t.slice(t.length - (max - head))}`;
}
