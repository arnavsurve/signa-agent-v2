import { Pool, PoolClient } from "pg";

/**
 * Global PostgreSQL pool singleton for serverless environments.
 * In development, we store on globalThis to persist across hot reloads.
 */
const globalForPg = globalThis as unknown as {
  pgPool: Pool | undefined;
};

let pool: Pool | undefined = globalForPg.pgPool;

/**
 * Get or create a PostgreSQL connection pool.
 * Uses a singleton pattern optimized for serverless environments.
 */
function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    pool = new Pool({
      connectionString,
      max: 10, // Maximum connections in the pool
      idleTimeoutMillis: 10000, // Close idle connections after 10s
      connectionTimeoutMillis: 5000, // Timeout for new connections
    });

    // Handle pool errors
    pool.on("error", (err) => {
      console.error("[PostgreSQL] Unexpected pool error:", err);
    });

    if (process.env.NODE_ENV === "development") {
      globalForPg.pgPool = pool;
    }
  }

  return pool;
}

/**
 * Execute a SQL query with parameters.
 * @param text - SQL query string
 * @param params - Query parameters
 * @returns Array of result rows
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const pool = getPool();
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/**
 * Execute a SQL query and return the first row or null.
 * @param text - SQL query string
 * @param params - Query parameters
 * @returns First row or null if no results
 */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * Get a client from the pool for transactions.
 * Remember to release the client when done.
 */
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return pool.connect();
}

/**
 * Execute a function within a transaction.
 * Automatically handles commit/rollback.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
