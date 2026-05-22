export type AiPromptScope = "record" | "split";

export type AiPromptVariant = "primary" | "regen";

export type RecordPromptFieldKey = "summary" | "conclusion" | "tags";

export type SplitPromptFieldKey =
  | "name"
  | "volume"
  | "number"
  | "timestamp"
  | "title_name"
  | "page_numbers"
  | "summary"
  | "conclusion"
  | "tags"
  | "authors";

export type AiPromptFieldKey = RecordPromptFieldKey | SplitPromptFieldKey;

export type AiPromptTemplate = {
  id?: number;
  prompt_key: string;
  scope: AiPromptScope;
  field_key: AiPromptFieldKey;
  variant: AiPromptVariant;
  title: string;
  description: string | null;
  required_placeholders: string[];
  system_prompt: string;
  user_prompt_template: string;
  created_at?: string | null;
  updated_at?: string | null;
};
