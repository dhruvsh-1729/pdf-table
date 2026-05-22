import promptCatalog from "@/lib/aiPromptCatalog.json";
import type { AiPromptFieldKey, AiPromptScope, AiPromptTemplate, AiPromptVariant } from "@/lib/aiPromptTypes";

const typedCatalog = promptCatalog as AiPromptTemplate[];

export const AI_PROMPT_CATALOG = typedCatalog;

const catalogByPromptKey = new Map<string, AiPromptTemplate>();
const catalogByLookupKey = new Map<string, AiPromptTemplate>();
const catalogSortOrder = new Map<string, number>();

typedCatalog.forEach((prompt, index) => {
  catalogByPromptKey.set(prompt.prompt_key, prompt);
  catalogByLookupKey.set(buildPromptLookupKey(prompt.scope, prompt.field_key, prompt.variant), prompt);
  catalogSortOrder.set(prompt.prompt_key, index);
});

export function buildPromptLookupKey(scope: AiPromptScope, fieldKey: AiPromptFieldKey, variant: AiPromptVariant) {
  return `${scope}:${fieldKey}:${variant}`;
}

export function getDefaultAiPromptByLookup(scope: AiPromptScope, fieldKey: AiPromptFieldKey, variant: AiPromptVariant) {
  return catalogByLookupKey.get(buildPromptLookupKey(scope, fieldKey, variant)) || null;
}

export function getDefaultAiPromptByKey(promptKey: string) {
  return catalogByPromptKey.get(promptKey) || null;
}

export function sortAiPromptsByCatalogOrder(prompts: AiPromptTemplate[]) {
  return [...prompts].sort((a, b) => {
    const left = catalogSortOrder.get(a.prompt_key) ?? Number.MAX_SAFE_INTEGER;
    const right = catalogSortOrder.get(b.prompt_key) ?? Number.MAX_SAFE_INTEGER;
    return left - right || a.prompt_key.localeCompare(b.prompt_key);
  });
}

export function renderPromptTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => variables[key] ?? "");
}

export function findMissingRequiredPlaceholders(template: string, requiredPlaceholders: string[]) {
  return requiredPlaceholders.filter((placeholder) => !template.includes(`{{${placeholder}}}`));
}
