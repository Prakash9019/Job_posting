import { NextRequest, NextResponse } from "next/server";
import { getAuthorizationUrl } from "@/lib/email/gmail";
import { requireUser, AuthError } from "@/lib/auth/authorization";
import { signOAuthState } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireUser(req);

    // Cryptographically sign OAuth state to prevent CSRF and cross-user linking
    const signedState = signOAuthState(userId);
    const url = getAuthorizationUrl(signedState);

    return NextResponse.json({ success: true, url });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
