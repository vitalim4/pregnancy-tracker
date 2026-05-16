-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,           -- Telegram user ID
  first_name TEXT NOT NULL,
  username TEXT,
  language_code TEXT DEFAULT 'he',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pregnancies table
CREATE TABLE IF NOT EXISTS pregnancies (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lmp_date DATE NOT NULL,          -- Last Menstrual Period date
  due_date DATE GENERATED ALWAYS AS (lmp_date + INTERVAL '280 days') STORED,
  nickname TEXT,                   -- Baby's nickname
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pregnancy_id INT REFERENCES pregnancies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_week INT,                    -- Pregnancy week this task is relevant to
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reminders table
CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pregnancy_id INT REFERENCES pregnancies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  is_sent BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation history for agent context (last N messages per user)
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pregnancies_user ON pregnancies(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_user_time ON reminders(user_id, remind_at);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at DESC);
