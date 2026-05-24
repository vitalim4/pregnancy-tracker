CREATE TABLE IF NOT EXISTS paypal_orders (
  order_id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
