import { Pool } from 'pg';
import { config } from '../config';

console.log('DATABASE_URL set:', !!process.env.DATABASE_URL);
console.log('PGHOST:', process.env.PGHOST ?? 'not set');

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : process.env.PGHOST
    ? new Pool({ host: process.env.PGHOST, port: parseInt(process.env.PGPORT ?? '5432'), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: { rejectUnauthorized: false } })
    : new Pool(config.db);

export async function connectDB(): Promise<void> {
  const client = await pool.connect();
  console.log('✅ PostgreSQL connected');
  client.release();
}
