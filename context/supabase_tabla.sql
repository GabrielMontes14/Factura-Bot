-- ============================================================
-- EJECUTAR ESTO EN SUPABASE > SQL Editor
-- Crea la tabla de productos si no existe
-- ============================================================

CREATE TABLE IF NOT EXISTS productos (
  id          BIGSERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  cantidad    NUMERIC DEFAULT 0,
  precio_costo NUMERIC,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda rápida por nombre
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos USING GIN (to_tsvector('spanish', nombre));

-- Ver tus productos
-- SELECT * FROM productos ORDER BY updated_at DESC;
