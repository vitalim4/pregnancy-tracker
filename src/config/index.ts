import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

export const config = {
  telegram: {
    token: required('TELEGRAM_BOT_TOKEN'),
  },
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: 'claude-sonnet-4-6',
  },
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432'),
    database: process.env.DB_NAME ?? 'pregnancy_tracker',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379'),
  },
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
