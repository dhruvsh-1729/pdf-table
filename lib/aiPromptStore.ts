import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  AI_PROMPT_CATALOG,
  getDefaultAiPromptByLookup,
  renderPromptTemplate,
  sortAiPromptsByCatalogOrder,
} from "@/lib/aiPromptCatalog";
import type { AiPromptFieldKey, AiPromptScope, AiPromptTemplate, AiPromptVariant } from "@/lib/aiPromptTypes";

function normalizePromptRow(row: any): AiPromptTemplate {
  return {
    id: Number(row.id),
    prompt_key: String(row.prompt_key),
    scope: row.scope,
    field_key: row.field_key,
    variant: row.variant,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    required_placeholders: Array.isArray(row.required_placeholders)
      ? row.required_placeholders.map((value: unknown) => String(value))
      : [],
    system_prompt: String(row.system_prompt),
    user_prompt_template: String(row.user_prompt_template),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function isMissingPromptTableError(error: any) {
  return error?.code === "42P01" || /ai_prompts/i.test(String(error?.message || "")) && /does not exist/i.test(String(error?.message || ""));
}

export async function getAiPromptTemplate(
  scope: AiPromptScope,
  fieldKey: AiPromptFieldKey,
  variant: AiPromptVariant = "primary",
) {
  const fallback = getDefaultAiPromptByLookup(scope, fieldKey, variant);
  const { data, error } = await supabaseAdmin
    .from("ai_prompts")
    .select(
      "id, prompt_key, scope, field_key, variant, title, description, required_placeholders, system_prompt, user_prompt_template, created_at, updated_at",
    )
    .eq("scope", scope)
    .eq("field_key", fieldKey)
    .eq("variant", variant)
    .maybeSingle();

  if (error) {
    if (fallback && isMissingPromptTableError(error)) {
      return fallback;
    }
    if (fallback) {
      console.error("Failed to load AI prompt from Supabase, using fallback:", error);
      return fallback;
    }
    throw error;
  }

  if (!data) {
    if (fallback) return fallback;
    throw new Error(`Missing AI prompt for ${scope}.${fieldKey}.${variant}`);
  }

  return normalizePromptRow(data);
}

export async function buildStoredPromptMessages(options: {
  scope: AiPromptScope;
  fieldKey: AiPromptFieldKey;
  variant?: AiPromptVariant;
  variables: Record<string, string>;
}) {
  const prompt = await getAiPromptTemplate(options.scope, options.fieldKey, options.variant || "primary");
  return [
    { role: "system" as const, content: prompt.system_prompt },
    { role: "user" as const, content: renderPromptTemplate(prompt.user_prompt_template, options.variables) },
  ];
}

export async function listAiPrompts() {
  const { data, error } = await supabaseAdmin
    .from("ai_prompts")
    .select(
      "id, prompt_key, scope, field_key, variant, title, description, required_placeholders, system_prompt, user_prompt_template, created_at, updated_at",
    );

  if (error) throw error;
  return sortAiPromptsByCatalogOrder((data || []).map(normalizePromptRow));
}

export async function updateAiPrompt(id: number, payload: Pick<AiPromptTemplate, "system_prompt" | "user_prompt_template">) {
  const { data, error } = await supabaseAdmin
    .from("ai_prompts")
    .update({
      system_prompt: payload.system_prompt,
      user_prompt_template: payload.user_prompt_template,
    })
    .eq("id", id)
    .select(
      "id, prompt_key, scope, field_key, variant, title, description, required_placeholders, system_prompt, user_prompt_template, created_at, updated_at",
    )
    .single();

  if (error) throw error;
  return normalizePromptRow(data);
}

export function getDefaultAiPromptCatalog() {
  return AI_PROMPT_CATALOG;
}
