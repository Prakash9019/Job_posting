import { NextRequest, NextResponse } from "next/server";
import { disconnectGmailAccount } from "@/lib/email/gmail";
import { requireUser, AuthError } from "@/lib/auth/authorization";

export async function POST(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    let email: string | undefined;

    try {
      const body = await req.json();
      if (body.email && typeof body.email === "string") {
        email = body.email;
      }
    } catch {
      // Body is optional
    }

    await disconnectGmailAccount(userId, email);
    return NextResponse.json({ success: true, message: `Disconnected Gmail for user ${userId}` });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
