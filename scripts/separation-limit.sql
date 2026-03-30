-- Tabela para rastrear uso da separação de stems
CREATE TABLE IF NOT EXISTS public.separation_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now() NOT NULL,
  prediction_id text,
  file_name text
);

-- Index para busca rápida por usuário + data
CREATE INDEX idx_separation_usage_user_date ON public.separation_usage (user_id, created_at DESC);

-- RLS
ALTER TABLE public.separation_usage ENABLE ROW LEVEL SECURITY;

-- Usuário só vê seus próprios registros
CREATE POLICY "Users see own usage" ON public.separation_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Insert via service role (Edge Function)
CREATE POLICY "Service insert" ON public.separation_usage
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Tabela de admins
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
