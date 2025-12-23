import { NextRequest, NextResponse } from "next/server";
import { verifyToken, createAccessToken, extractBearerToken } from "@/lib/auth/jwt";
import { findUserById } from "@/lib/repositories/postgres/users";

/**
 * POST /api/auth/refresh
 * Refresh access token using a valid refresh token.
 */
export async function POST(req: NextRequest) {
  try {
    // Extract refresh token from Authorization header or request body
    const authHeader = req.headers.get("authorization");
    let refreshToken = extractBearerToken(authHeader);

    // Also accept token in request body for flexibility
    if (!refreshToken) {
      try {
        const body = await req.json();
        refreshToken = body.refresh_token;
      } catch {
        // No body or invalid JSON, continue with null token
      }
    }

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Refresh token is required" },
        { status: 400 }
      );
    }

    // Verify the refresh token
    let payload;
    try {
      payload = await verifyToken(refreshToken);
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired refresh token" },
        { status: 401 }
      );
    }

    // Verify user still exists
    const userId = parseInt(payload.id, 10);
    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    // Generate new access token
    const accessToken = await createAccessToken(
      user.id,
      user.email,
      user.user_type
    );

    return NextResponse.json({
      access_token: accessToken,
      token_type: "bearer",
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
