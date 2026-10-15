-- FEITO EM FORMA • PLANNER + CALCULADORA v4
-- Execute no MESMO Supabase que já usa no Planner (após migração v3).
-- Não apaga registros, não muda logins ou regras RLS.
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS calculator_data jsonb;

-- Campos internos da calculadora não são públicos: a tabela mantém o RLS já ativo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.quotes'::regclass
      AND conname='quotes_calculator_data_object'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_calculator_data_object
      CHECK (calculator_data IS NULL OR jsonb_typeof(calculator_data) = 'object');
  END IF;
END $$;

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='quotes' AND column_name='calculator_data';
