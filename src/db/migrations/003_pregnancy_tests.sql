CREATE TABLE IF NOT EXISTS completed_tests (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id TEXT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(user_id, test_id)
);

CREATE INDEX IF NOT EXISTS idx_completed_tests_user ON completed_tests(user_id);