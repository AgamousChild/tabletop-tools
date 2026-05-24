-- Ingest content queue: sources + content tables
-- Replaces manual URL-paste workflow with automated daily crawl + processing

CREATE TABLE IF NOT EXISTS ingest_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_content (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  source_id TEXT NOT NULL REFERENCES ingest_sources(id),
  status TEXT NOT NULL DEFAULT 'discovered',
  gladia_job_id TEXT,
  transcript TEXT,
  nodes_extracted INTEGER DEFAULT 0,
  error TEXT,
  discovered_at INTEGER NOT NULL,
  processed_at INTEGER
);

CREATE INDEX idx_ingest_content_source ON ingest_content(source_id);
CREATE INDEX idx_ingest_content_status ON ingest_content(status);

-- Seed initial sources
INSERT INTO ingest_sources (id, name, url, type, active, created_at) VALUES
  ('auspex-tactics', 'Auspex Tactics', 'https://www.youtube.com/@AuspexTactics', 'youtube', 1, strftime('%s', 'now') * 1000),
  ('happy-krumping', 'Happy Krumping', 'https://www.youtube.com/@HappyKrumping', 'youtube', 1, strftime('%s', 'now') * 1000),
  ('warhammer-community', 'Warhammer Community', 'https://www.warhammer-community.com/en-gb/', 'web', 1, strftime('%s', 'now') * 1000),
  ('goonhammer', 'Goonhammer', 'https://www.goonhammer.com/', 'web', 1, strftime('%s', 'now') * 1000);

-- Migrate existing ingest_jobs to ingest_content
INSERT OR IGNORE INTO ingest_sources (id, name, url, type, active, created_at)
  SELECT DISTINCT
    CASE
      WHEN lower(source_name) LIKE '%auspex%' THEN 'auspex-tactics'
      WHEN lower(source_name) LIKE '%krumping%' THEN 'happy-krumping'
      WHEN lower(source_name) LIKE '%warhammer%' OR lower(source_name) LIKE '%whc%' THEN 'warhammer-community'
      WHEN lower(source_name) LIKE '%goonhammer%' THEN 'goonhammer'
      ELSE 'manual'
    END,
    COALESCE(source_name, 'Manual'),
    'manual',
    source_type,
    0,
    created_at
  FROM ingest_jobs
  WHERE source_name IS NOT NULL
  AND CASE
    WHEN lower(source_name) LIKE '%auspex%' THEN 'auspex-tactics'
    WHEN lower(source_name) LIKE '%krumping%' THEN 'happy-krumping'
    WHEN lower(source_name) LIKE '%warhammer%' OR lower(source_name) LIKE '%whc%' THEN 'warhammer-community'
    WHEN lower(source_name) LIKE '%goonhammer%' THEN 'goonhammer'
    ELSE 'manual'
  END NOT IN (SELECT id FROM ingest_sources);

-- Ensure 'manual' source exists for unmapped jobs
INSERT OR IGNORE INTO ingest_sources (id, name, url, type, active, created_at)
  VALUES ('manual', 'Manual', 'manual', 'web', 0, strftime('%s', 'now') * 1000);

INSERT OR IGNORE INTO ingest_content (id, url, title, source_id, status, gladia_job_id, transcript, nodes_extracted, error, discovered_at, processed_at)
  SELECT
    id,
    url,
    title,
    CASE
      WHEN lower(source_name) LIKE '%auspex%' THEN 'auspex-tactics'
      WHEN lower(source_name) LIKE '%krumping%' THEN 'happy-krumping'
      WHEN lower(source_name) LIKE '%warhammer%' OR lower(source_name) LIKE '%whc%' THEN 'warhammer-community'
      WHEN lower(source_name) LIKE '%goonhammer%' THEN 'goonhammer'
      ELSE 'manual'
    END,
    status,
    gladia_job_id,
    transcript,
    COALESCE(nodes_extracted, 0),
    error,
    created_at,
    completed_at
  FROM ingest_jobs;
