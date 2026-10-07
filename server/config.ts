import path from 'node:path';

try {
  process.loadEnvFile('.env');
} catch {
  /* no .env: defaults below apply */
}

/** The server only ever listens on loopback: it holds API keys and personal data. */
export const HOST = '127.0.0.1';
export const PORT = Number(process.env.API_PORT ?? 8787);
export const DB_FILE = process.env.DB_FILE ?? path.resolve('data/app.db');
