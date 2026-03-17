-- ============================================================
-- EJECUTAR ESTO EN SUPABASE > SQL Editor
-- Crea la tabla de productos si no existe
-- ============================================================

CREATE TABLE IF NOT EXISTS productos (
  id            BIGSERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  cantidad      NUMERIC DEFAULT 0,
  precio_costo  NUMERIC,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda rápida por nombre
CREATE INDEX IF NOT EXISTS idx_productos_nombre
  ON productos USING GIN (to_tsvector('spanish', nombre));

-- ============================================================
-- Tabla de historial de facturas procesadas (opcional)
-- ============================================================

CREATE TABLE IF NOT EXISTS facturas_historial (
  id            BIGSERIAL PRIMARY KEY,
  proveedor     TEXT,
  fecha_factura TEXT,
  productos     JSONB NOT NULL,
  total_items   INTEGER DEFAULT 0,
  procesada_en  TIMESTAMPTZ DEFAULT NOW()
);

-- Ver tus productos
-- SELECT * FROM productos ORDER BY updated_at DESC;

-- Ver historial de facturas
-- SELECT * FROM facturas_historial ORDER BY procesada_en DESC;
