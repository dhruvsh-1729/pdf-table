-- 028: strip ChatGPT citation debris automatically whenever summaries/conclusions are written.
CREATE OR REPLACE FUNCTION public.trg_strip_ai_debris_records() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.has_ai_debris(NEW.summary) THEN NEW.summary := public.strip_ai_debris(NEW.summary); END IF;
  IF public.has_ai_debris(NEW.conclusion) THEN NEW.conclusion := public.strip_ai_debris(NEW.conclusion); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS records_strip_ai_debris ON public.records;
-- Named to sort before records_search_vector_trg, so the search vector is built from the cleaned text.
CREATE TRIGGER records_strip_ai_debris BEFORE INSERT OR UPDATE OF summary, conclusion ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.trg_strip_ai_debris_records();

CREATE OR REPLACE FUNCTION public.trg_strip_ai_debris_summaries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.has_ai_debris(NEW.summary) THEN NEW.summary := public.strip_ai_debris(NEW.summary); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS summaries_strip_ai_debris ON public.summaries;
CREATE TRIGGER summaries_strip_ai_debris BEFORE INSERT OR UPDATE OF summary ON public.summaries
  FOR EACH ROW EXECUTE FUNCTION public.trg_strip_ai_debris_summaries();

CREATE OR REPLACE FUNCTION public.trg_strip_ai_debris_conclusions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.has_ai_debris(NEW.conclusion) THEN NEW.conclusion := public.strip_ai_debris(NEW.conclusion); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS conclusions_strip_ai_debris ON public.conclusions;
CREATE TRIGGER conclusions_strip_ai_debris BEFORE INSERT OR UPDATE OF conclusion ON public.conclusions
  FOR EACH ROW EXECUTE FUNCTION public.trg_strip_ai_debris_conclusions();
