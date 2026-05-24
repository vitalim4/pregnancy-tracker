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
  adminUserId: parseInt(process.env.ADMIN_USER_ID ?? '1900442367'),
  webhookSecret: process.env.WEBHOOK_SECRET ?? 'change-me-in-production',
  port: parseInt(process.env.PORT ?? '3000'),
  appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID ?? '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
    baseUrl: process.env.PAYPAL_SANDBOX === 'true'
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com',
  },
  nodeEnv: process.env.NODE_ENV ?? 'development',
};
