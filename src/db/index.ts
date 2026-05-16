import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool(config.db);

export async function connectDB(): Promise<void> {
  const client = await pool.connect();
  console.log('✅ PostgreSQL connected');
  client.release();
}
