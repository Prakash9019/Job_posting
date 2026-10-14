import { NextRequest, NextResponse } from "next/server";
import { handleOAuthCallback } from "@/lib/email/gmail";
import {
  verifyOAuthState,
  createSessionToken,
  SESSION_COOKIE_OPTIONS,
} from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const rawState = searchParams.get("state");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/?auth_error=${encodeURIComponent(error)}`
    );
  }

  if (!rawState) {
    return NextResponse.redirect(
      `${appUrl}/?auth_error=${encodeURIComponent("Missing OAuth state token")}`
    );
  }

  // Cryptographically verify state token
  const statePayload = verifyOAuthState(rawState);
  if (!statePayload) {
    return NextResponse.redirect(
      `${appUrl}/?auth_error=${encodeURIComponent("Invalid, tampered, or expired OAuth state token. Forgery protection triggered.")}`
    );
  }

  const userId = statePayload.userId;

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/?auth_error=${encodeURIComponent("Missing authorization code from Google")}&user=${userId}`
    );
  }

  try {
    await handleOAuthCallback(code, userId);

    const redirectResponse = NextResponse.redirect(
      `${appUrl}/?auth_success=true&user=${userId}`
    );

    // Issue/refresh verified session cookie on successful callback
    const sessionToken = createSessionToken(userId);
    redirectResponse.cookies.set({
      ...SESSION_COOKIE_OPTIONS,
      value: sessionToken,
    });

    return redirectResponse;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(
      `${appUrl}/?auth_error=${encodeURIComponent(errorMsg)}&user=${userId}`
    );
  }
}
