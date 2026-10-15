-- FEITO EM FORMA - v3: MIGRACAO SEGURA DO BANCO EXISTENTE
-- Execute uma vez no SQL Editor do MESMO projeto Supabase.
-- NAO apaga pedidos, NAO troca usuarios, NAO modifica RLS nem credenciais.
-- Custo de fabricacao informado por unidade; valores antigos ficam com zero.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS unit_cost numeric(14,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.quotes'::regclass AND conname='quotes_unit_cost_nonnegative'
  ) THEN
    ALTER TABLE public.quotes ADD CONSTRAINT quotes_unit_cost_nonnegative CHECK (unit_cost >= 0);
  END IF;
END $$;

-- Conferencia opcional: apresenta a coluna criada sem expor pedidos.
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='quotes' AND column_name='unit_cost';
