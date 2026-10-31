-- Feito em Forma — correção da calculadora para usuários com login.
-- Execute no SQL Editor do mesmo projeto Supabase usado pelo Planner.
-- Seguro para repetir: não apaga dados, tabelas ou orçamentos existentes.

alter table public.quotes
  add column if not exists calculator_data jsonb;
