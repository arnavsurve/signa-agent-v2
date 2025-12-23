import { NextRequest, NextResponse } from "next/server";
import { verifyToken, extractBearerToken, TokenPayload } from "./jwt";

/**
 * Handler function type for authenticated routes.
 */
type AuthenticatedHandler = (
  req: NextRequest,
  user: TokenPayload
) => Promise<NextResponse>;

/**
 * Handler function type for authenticated routes with params.
 */
type AuthenticatedHandlerWithParams<P = Record<string, string>> = (
  req: NextRequest,
  user: TokenPayload,
  context: { params: P }
) => Promise<NextResponse>;

/**
 * Wrap a route handler to require authentication.
 * Extracts and verifies the JWT token from the Authorization header.
 *
 * @param handler - The handler function to wrap
 * @returns Wrapped handler that validates auth before calling the original
 *
 * @example
 * ```ts
 * export const GET = withAuth(async (req, user) => {
 *   return NextResponse.json({ user });
 * });
 * ```
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const token = extractBearerToken(req.headers.get("Authorization"));

    if (!token) {
      return NextResponse.json(
        { error: "Authorization header required" },
        { status: 401 }
      );
    }

    try {
      const user = await verifyToken(token);
      return handler(req, user);
    } catch (error) {
      console.error("[Auth] Token verification failed:", error);
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
  };
}

/**
 * Wrap a route handler with params to require authentication.
 *
 * @param handler - The handler function to wrap
 * @returns Wrapped handler that validates auth before calling the original
 *
 * @example
 * ```ts
 * export const GET = withAuthParams<{ id: string }>(async (req, user, { params }) => {
 *   const id = params.id;
 *   return NextResponse.json({ id, user });
 * });
 * ```
 */
export function withAuthParams<P = Record<string, string>>(
  handler: AuthenticatedHandlerWithParams<P>
) {
  return async (
    req: NextRequest,
    context: { params: Promise<P> }
  ): Promise<NextResponse> => {
    const token = extractBearerToken(req.headers.get("Authorization"));

    if (!token) {
      return NextResponse.json(
        { error: "Authorization header required" },
        { status: 401 }
      );
    }

    try {
      const user = await verifyToken(token);
      const params = await context.params;
      return handler(req, user, { params });
    } catch (error) {
      console.error("[Auth] Token verification failed:", error);
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
  };
}

/**
 * Get the authenticated user from a request, or null if not authenticated.
 * Useful for routes that have optional authentication.
 *
 * @param req - The Next.js request
 * @returns TokenPayload if authenticated, null otherwise
 */
export async function getOptionalUser(
  req: NextRequest
): Promise<TokenPayload | null> {
  const token = extractBearerToken(req.headers.get("Authorization"));

  if (!token) {
    return null;
  }

  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}
