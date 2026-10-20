-- Cloudflare D1 Database Schema for Neighborhood Gas Map
-- Table: reports

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  time_of_day TEXT NOT NULL,
  observed_date TEXT NOT NULL,
  observed_time TEXT NOT NULL,
  intensity TEXT NOT NULL,
  smell_type TEXT NOT NULL,
  wind_condition TEXT NOT NULL,
  wind_direction TEXT,
  notes TEXT,
  reported_by TEXT,
  edit_token_hash TEXT,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_active ON reports (is_deleted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports (observed_date);
