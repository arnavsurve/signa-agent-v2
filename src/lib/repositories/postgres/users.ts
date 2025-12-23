import { query, queryOne } from "@/lib/db/postgres";
import { User, UserPublic } from "@/lib/types";

/**
 * Find a user by email address.
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>(
    `SELECT
      id,
      email,
      password_hash,
      password_salt,
      user_type,
      in_free_trial,
      created_at,
      last_login
    FROM users
    WHERE email = $1`,
    [email]
  );
}

/**
 * Find a user by ID.
 */
export async function findUserById(id: number): Promise<User | null> {
  return queryOne<User>(
    `SELECT
      id,
      email,
      password_hash,
      password_salt,
      user_type,
      in_free_trial,
      created_at,
      last_login
    FROM users
    WHERE id = $1`,
    [id]
  );
}

/**
 * Get public user data (safe to return to client).
 */
export async function getPublicUser(id: number): Promise<UserPublic | null> {
  return queryOne<UserPublic>(
    `SELECT id, email, user_type
    FROM users
    WHERE id = $1`,
    [id]
  );
}

/**
 * Update the last login timestamp for a user.
 */
export async function updateLastLogin(userId: number): Promise<void> {
  await query(
    `UPDATE users SET last_login = NOW() WHERE id = $1`,
    [userId]
  );
}

/**
 * Check if an email is already registered.
 */
export async function emailExists(email: string): Promise<boolean> {
  const result = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) as exists`,
    [email]
  );
  return result?.exists ?? false;
}
