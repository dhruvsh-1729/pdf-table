-- 022: where records.extracted_text came from (NULL = legacy / unknown).
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS text_source TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'records_text_source_check') THEN
    ALTER TABLE public.records ADD CONSTRAINT records_text_source_check
      CHECK (text_source IN ('pdf_text_layer', 'ocr_tesseract', 'ocr_paddle', 'ocr_ilovepdf', 'manual'));
  END IF;
END $$;
