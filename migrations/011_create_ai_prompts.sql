CREATE TABLE IF NOT EXISTS public.ai_prompts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prompt_key TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  field_key TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'primary',
  title TEXT NOT NULL,
  description TEXT,
  required_placeholders TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_prompts_scope_check CHECK (scope IN ('record', 'split')),
  CONSTRAINT ai_prompts_variant_check CHECK (variant IN ('primary', 'regen')),
  CONSTRAINT ai_prompts_prompt_key_check CHECK (BTRIM(prompt_key) <> ''),
  CONSTRAINT ai_prompts_title_check CHECK (BTRIM(title) <> ''),
  CONSTRAINT ai_prompts_system_prompt_check CHECK (BTRIM(system_prompt) <> ''),
  CONSTRAINT ai_prompts_user_prompt_template_check CHECK (BTRIM(user_prompt_template) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompts_scope_field_variant
ON public.ai_prompts(scope, field_key, variant);

CREATE INDEX IF NOT EXISTS idx_ai_prompts_scope_field
ON public.ai_prompts(scope, field_key);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_updated_at'
      AND pronamespace = 'public'::regnamespace
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_ai_prompts_set_updated_at'
      AND tgrelid = 'public.ai_prompts'::regclass
  ) THEN
    CREATE TRIGGER trg_ai_prompts_set_updated_at
    BEFORE UPDATE ON public.ai_prompts
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_prompts TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_prompts_id_seq TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_prompts TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.ai_prompts_id_seq TO anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_prompts'
      AND policyname = 'ai_prompts_service_role_all'
  ) THEN
    CREATE POLICY ai_prompts_service_role_all
    ON public.ai_prompts
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'ai_prompts'
      AND policyname = 'ai_prompts_anon_all'
  ) THEN
    CREATE POLICY ai_prompts_anon_all
    ON public.ai_prompts
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);
  END IF;
END;
$$;
