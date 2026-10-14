import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  ValidUserId,
  createSessionToken,
  getSessionFromRequest,
  SESSION_COOKIE_OPTIONS,
  verifyCredentials,
} from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json(
        { success: false, authenticated: false, user: null },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        gmailAccounts: {
          select: {
            id: true,
            email: true,
            isConnected: true,
            lastSyncedAt: true,
            createdAt: true,
          },
        },
        resumes: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, authenticated: false, user: null, error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      user,
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    
    // Explicitly reject if credentials are missing
    const { password, apiKey } = body;
    if (!password && !apiKey) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: "Authentication required. Supplying userId alone cannot issue a session; valid credentials (password or apiKey) must be provided.",
        },
        { status: 401 }
      );
    }

    // Derive verified user identity strictly from credentials
    const verifiedUserId = verifyCredentials(body);
    if (!verifiedUserId) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: "Authentication failed. Invalid or unverified user credentials.",
        },
        { status: 401 }
      );
    }

    // If client requested a specific target userId, ensure it matches the verified credential's owner
    if (body.userId && body.userId !== verifiedUserId) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: "Forbidden: Credentials do not match the requested user ID.",
        },
        { status: 403 }
      );
    }

    const userId = verifiedUserId;

    // Ensure user exists in database
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        name: userId === "user_a" ? "User A" : "User B",
      },
      include: {
        gmailAccounts: {
          select: {
            id: true,
            email: true,
            isConnected: true,
            lastSyncedAt: true,
            createdAt: true,
          },
        },
        resumes: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    // Create cryptographically signed session token
    const token = createSessionToken(userId as ValidUserId);

    const response = NextResponse.json({
      success: true,
      user,
      message: `Authenticated as ${user.name}`,
    });

    // Set HttpOnly, Secure, SameSite=Lax session cookie
    response.cookies.set({
      ...SESSION_COOKIE_OPTIONS,
      value: token,
    });

    return response;
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({
    success: true,
    message: "Session terminated.",
  });

  // Clear session cookie
  response.cookies.set({
    ...SESSION_COOKIE_OPTIONS,
    value: "",
    maxAge: 0,
  });

  return response;
}
