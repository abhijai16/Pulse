import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[db] unexpected pool error', err);
});

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const ms = Date.now() - start;
  if (process.env.LOG_QUERIES === '1') {
    // noisy, only on when debugging
    console.log('[db]', { ms, rows: res.rowCount, text: text.split('\n')[0] });
  }
  return res;
}
