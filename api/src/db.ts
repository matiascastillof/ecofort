import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/pedidos',
});

export default pool;
