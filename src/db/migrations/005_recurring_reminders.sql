CREATE TABLE IF NOT EXISTS recurring_reminders (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  interval_minutes INT NOT NULL,
  next_send_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_reminders_user ON recurring_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_reminders_next ON recurring_reminders(next_send_at) WHERE is_active = TRUE;