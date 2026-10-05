-- CoffAI Lead Engine — schema.sql
-- Run once against your Postgres database (see README for setup).

CREATE TABLE IF NOT EXISTS regions (
  id            SERIAL PRIMARY KEY,
  country_code  TEXT,               -- ISO 3166-1 alpha-2, e.g. 'MA', 'TN' — best-effort for map areas
  city          TEXT,
  label         TEXT,               -- human-readable name for a map-drawn area (reverse-geocoded or user-typed)
  source        TEXT DEFAULT 'city',-- 'city' (legacy dropdown flow) or 'map' (draw-on-map flow)
  bbox_south    DOUBLE PRECISION,
  bbox_north    DOUBLE PRECISION,
  bbox_west     DOUBLE PRECISION,
  bbox_east     DOUBLE PRECISION,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (country_code, city)
);

-- Widen an existing table in place if this schema is re-run against a DB created
-- before the map-based scan feature existed (migrate.js just re-applies this file).
ALTER TABLE regions ALTER COLUMN country_code DROP NOT NULL;
ALTER TABLE regions ALTER COLUMN city DROP NOT NULL;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'city';
ALTER TABLE regions ADD COLUMN IF NOT EXISTS bbox_south DOUBLE PRECISION;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS bbox_north DOUBLE PRECISION;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS bbox_west DOUBLE PRECISION;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS bbox_east DOUBLE PRECISION;

-- "Mark as contacted" — set once you've actually sent a cafe a message
-- elsewhere (WhatsApp/Instagram/etc). NULL means "not yet contacted".
ALTER TABLE cafes ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_cafes_contacted ON cafes(contacted_at);

-- Pulled from the cafe's own website (never scraped from social platforms
-- directly) when a wa.me link is published there.
ALTER TABLE cafes ADD COLUMN IF NOT EXISTS whatsapp_url TEXT;

CREATE TABLE IF NOT EXISTS cafes (
  id                  SERIAL PRIMARY KEY,
  region_id           INTEGER REFERENCES regions(id) ON DELETE CASCADE,
  fsq_place_id        TEXT UNIQUE NOT NULL,   -- Foursquare Open Source Places ID
  name                TEXT NOT NULL,
  address             TEXT,
  lat                 DOUBLE PRECISION,
  lng                 DOUBLE PRECISION,
  phone               TEXT,
  website             TEXT,
  email               TEXT,
  instagram_url       TEXT,
  facebook_url        TEXT,
  categories          TEXT,           -- raw FSQ category labels, kept for reference
  ai_summary          TEXT,           -- short human-readable summary from Groq
  openness_score      INTEGER,        -- 1-5, how likely to try new software (heuristic)
  pain_score          INTEGER,        -- 1-5, how severe the regional-pattern pain looks
  last_analyzed_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cafe_problems (
  id            SERIAL PRIMARY KEY,
  cafe_id       INTEGER REFERENCES cafes(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,   -- e.g. 'owner_visibility', 'staff_comm', 'payment_fragmentation',
                                  -- 'profit_visibility', 'delivery_dependence', 'inventory_waste', 'expensive_pos'
  description   TEXT NOT NULL,   -- hypothesized problem, phrased as a regional pattern, not a fact
  confidence    NUMERIC(3,2),    -- 0.00 - 1.00 — intentionally low/moderate; this is pattern-matching
  source        TEXT DEFAULT 'regional_pattern',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scrape_jobs (
  id              SERIAL PRIMARY KEY,
  region_id       INTEGER REFERENCES regions(id) ON DELETE CASCADE,
  status          TEXT DEFAULT 'running', -- running | done | failed
  cafes_found     INTEGER DEFAULT 0,
  cafes_analyzed  INTEGER DEFAULT 0,
  error           TEXT,
  started_at      TIMESTAMPTZ DEFAULT now(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cafes_region ON cafes(region_id);
CREATE INDEX IF NOT EXISTS idx_cafes_latlng ON cafes(lat, lng);
CREATE INDEX IF NOT EXISTS idx_cafe_problems_cafe ON cafe_problems(cafe_id);
CREATE INDEX IF NOT EXISTS idx_cafe_problems_category ON cafe_problems(category);
