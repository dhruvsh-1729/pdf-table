// ops/pipeline/quality.mjs — text quality rule shared by recovery and ingestion (same thresholds as migration 020).
export function textQuality(text) {
  const t = (text ?? "").trim();
  if (t.length < 300) return "missing";
  const letters = (t.match(/[\p{L}ऀ-ॿ઀-૿]/gu) ?? []).length;
  const visible = t.replace(/\s/g, "").length || 1;
  if (letters / visible < 0.6) return "garbled";
  return t.length < 2000 ? "partial" : "good";
}
