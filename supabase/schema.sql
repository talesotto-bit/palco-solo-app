-- =============================================
-- Palco Solo — Schema do Banco de Dados
-- =============================================

-- Gêneros musicais
CREATE TABLE IF NOT EXISTS genres (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  track_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Músicas (catálogo)
CREATE TABLE IF NOT EXISTS tracks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  genre_id TEXT REFERENCES genres(id),
  genre_label TEXT NOT NULL,
  bpm INTEGER DEFAULT 0,
  key_note TEXT,
  key_scale TEXT CHECK (key_scale IN ('major', 'minor')),
  duration_seconds INTEGER DEFAULT 0,
  stem_count INTEGER DEFAULT 0,
  has_stems BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(slug, genre_id)
);

-- Stems (pistas individuais)
CREATE TABLE IF NOT EXISTS stems (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  format TEXT DEFAULT 'mp3',
  size_bytes INTEGER DEFAULT 0,
  instrument_type TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Setlists (lista de músicas para show)
CREATE TABLE IF NOT EXISTS setlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Itens do setlist
CREATE TABLE IF NOT EXISTS setlist_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setlist_id UUID REFERENCES setlists(id) ON DELETE CASCADE,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  pitch_offset INTEGER DEFAULT 0,
  speed_factor REAL DEFAULT 1.0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Favoritos
CREATE TABLE IF NOT EXISTS favorites (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id UUID REFERENCES tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, track_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre_id);
CREATE INDEX IF NOT EXISTS idx_tracks_slug ON tracks(slug);
CREATE INDEX IF NOT EXISTS idx_tracks_name ON tracks(name);
CREATE INDEX IF NOT EXISTS idx_stems_track ON stems(track_id);
CREATE INDEX IF NOT EXISTS idx_setlist_items_setlist ON setlist_items(setlist_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

-- Busca full-text em português
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('portuguese', coalesce(name, '') || ' ' || coalesce(genre_label, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_tracks_search ON tracks USING gin(search_vector);

-- RLS (Row Level Security)
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stems ENABLE ROW LEVEL SECURITY;
ALTER TABLE genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE setlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE setlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Políticas: todos leem tracks/stems/genres, só autenticados escrevem setlists/favoritos
CREATE POLICY "Tracks são públicas" ON tracks FOR SELECT USING (true);
CREATE POLICY "Stems são públicos" ON stems FOR SELECT USING (true);
CREATE POLICY "Gêneros são públicos" ON genres FOR SELECT USING (true);

CREATE POLICY "Usuário gerencia seus setlists" ON setlists
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Usuário gerencia itens do setlist" ON setlist_items
  FOR ALL USING (
    setlist_id IN (SELECT id FROM setlists WHERE user_id = auth.uid())
  );
CREATE POLICY "Usuário gerencia favoritos" ON favorites
  FOR ALL USING (auth.uid() = user_id);

-- Seed: gêneros
INSERT INTO genres (id, name, slug) VALUES
  ('atualizacoes', 'Atualizações 2017-2026', 'atualizacoes'),
  ('forro', 'Forró das Antigas', 'forro'),
  ('pagode', 'Pagodes', 'pagode'),
  ('sertanejo', 'Sertanejo', 'sertanejo'),
  ('gospel', 'Gospel', 'gospel'),
  ('rock-pop-mpb', 'Rock Pop MPB Brega', 'rock-pop-mpb'),
  ('axe-carnaval', 'Axé, Carnaval e Pagode Baiano', 'axe-carnaval'),
  ('aberturas', 'Aberturas de Show', 'aberturas'),
  ('playbacks', 'Playbacks Fechados', 'playbacks'),
  ('shows-multipistas', 'Shows Montados Multipistas', 'shows-multipistas'),
  ('shows-playbacks', 'Shows Montados Playbacks', 'shows-playbacks')
ON CONFLICT (id) DO NOTHING;
