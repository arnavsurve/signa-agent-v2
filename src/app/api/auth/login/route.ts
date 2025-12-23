import { NextRequest, NextResponse } from "next/server";
import {
  findUserByEmail,
  updateLastLogin,
} from "@/lib/repositories/postgres/users";
import { verifyPassword } from "@/lib/auth/password";
import { createAccessToken, createRefreshToken } from "@/lib/auth/jwt";

interface LoginRequest {
  email: string;
  password: string;
}

/**
 * POST /api/auth/login
 * Authenticate user with email and password, return JWT tokens.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LoginRequest;
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 },
      );
    }

    // Find user by email
    const user = await findUserByEmail(email.toLowerCase().trim());
    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Check if user has password credentials (not OAuth-only user)
    if (!user.password_hash || !user.password_salt) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Verify password
    const isValid = await verifyPassword(
      password,
      user.password_salt,
      user.password_hash,
    );

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Generate tokens
    const [accessToken, refreshToken] = await Promise.all([
      createAccessToken(user.id, user.email, user.user_type),
      createRefreshToken(user.id, user.email, user.user_type),
    ]);

    // Update last login timestamp
    await updateLastLogin(user.id);

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: "bearer",
      user: {
        id: user.id,
        email: user.email,
        user_type: user.user_type,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
