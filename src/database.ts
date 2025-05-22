import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

export async function connectDB() {
  try {
    await client.connect();
    console.log('Database connected successfully');
  } catch (err) {
    console.error('Database connection error', err);
  }
}

export async function query(text: string, params?: any[]) {
  return client.query(text, params);
}

export async function endDB() {
  await client.end();
}