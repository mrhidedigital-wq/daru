-- ============================================================
-- Migration: create api_keys table
-- Tabla para almacenar API keys en runtime (evita env vars en Vercel).
-- Solo REACT_APP_SUPABASE_URL y REACT_APP_SUPABASE_ANON_KEY son
-- necesarias en Vercel — todas las demás keys viven aquí.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  key_name   TEXT        PRIMARY KEY,
  key_value  TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: actualiza updated_at automáticamente en cada UPDATE
CREATE OR REPLACE FUNCTION set_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON api_keys;
CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_api_keys_updated_at();

-- RLS: solo usuarios autenticados pueden leer y escribir
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON api_keys;
CREATE POLICY "authenticated_full_access"
  ON api_keys
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed: inicializar filas vacías para cada key conocida
-- (facilita el upsert desde el cliente)
INSERT INTO api_keys (key_name, key_value) VALUES
  ('kling_api_key',         ''),
  ('seeddance_api_key',     ''),
  ('gemini_api_key',        ''),
  ('google_cloud_project',  ''),
  ('vertex_access_token',   '')
ON CONFLICT (key_name) DO NOTHING;
