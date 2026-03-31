-- Tabela de compradores aprovados (preenchida via webhook da Greenn)
CREATE TABLE IF NOT EXISTS approved_buyers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'basic',
  greenn_transaction_id TEXT,
  product_name TEXT,
  buyer_name TEXT,
  approved_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index para busca rápida por email
CREATE UNIQUE INDEX IF NOT EXISTS idx_approved_buyers_email ON approved_buyers (LOWER(email));

-- RLS: permitir leitura anônima (para checagem no cadastro)
ALTER TABLE approved_buyers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_read" ON approved_buyers
  FOR SELECT TO anon USING (true);

-- Apenas service_role pode inserir (via webhook)
CREATE POLICY "allow_service_insert" ON approved_buyers
  FOR INSERT TO service_role WITH CHECK (true);
