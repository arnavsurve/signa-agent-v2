import { SignJWT, jwtVerify, JWTPayload } from "jose";

const JWT_ALGORITHM = "HS256";
const ACCESS_TOKEN_EXPIRE_MINUTES = 60;
const REFRESH_TOKEN_EXPIRE_DAYS = 7;

/**
 * Get the JWT secret, throwing if not configured.
 * Deferred to runtime to allow builds without env vars.
 */
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Token payload structure matching the Python backend.
 */
export interface TokenPayload extends JWTPayload {
  id: string;
  email: string;
  user_type?: string;
}

/**
 * Create an access token (short-lived, 60 minutes).
 * Compatible with Python backend JWT structure.
 *
 * @param userId - User's database ID
 * @param email - User's email address
 * @param userType - User type (e.g., "ADMIN"), optional
 * @returns JWT token string
 */
export async function createAccessToken(
  userId: number,
  email: string,
  userType?: string | null
): Promise<string> {
  const builder = new SignJWT({
    id: String(userId),
    email,
    ...(userType === "ADMIN" ? { user_type: userType } : {}),
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setExpirationTime(`${ACCESS_TOKEN_EXPIRE_MINUTES}m`);

  return builder.sign(getJwtSecret());
}

/**
 * Create a refresh token (long-lived, 7 days).
 * Compatible with Python backend JWT structure.
 *
 * @param userId - User's database ID
 * @param email - User's email address
 * @param userType - User type (e.g., "ADMIN"), optional
 * @returns JWT token string
 */
export async function createRefreshToken(
  userId: number,
  email: string,
  userType?: string | null
): Promise<string> {
  const builder = new SignJWT({
    id: String(userId),
    email,
    ...(userType === "ADMIN" ? { user_type: userType } : {}),
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setExpirationTime(`${REFRESH_TOKEN_EXPIRE_DAYS}d`);

  return builder.sign(getJwtSecret());
}

/**
 * Verify and decode a JWT token.
 *
 * @param token - JWT token string
 * @returns Decoded token payload
 * @throws Error if token is invalid or expired
 */
export async function verifyToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
  });

  // Validate required fields
  if (typeof payload.id !== "string" || typeof payload.email !== "string") {
    throw new Error("Invalid token payload");
  }

  return payload as TokenPayload;
}

/**
 * Extract token from Authorization header.
 *
 * @param authHeader - Authorization header value
 * @returns Token string or null if not found
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}
