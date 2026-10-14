import { NextRequest, NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/email/gmail";
import { requireUser, AuthError } from "@/lib/auth/authorization";

export async function POST(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    let targetEmail: string | undefined;

    try {
      const body = await req.json();
      if (body.targetEmail && typeof body.targetEmail === "string") {
        targetEmail = body.targetEmail.trim();
      }
    } catch {
      // Body is optional
    }

    const result = await sendTestEmail({
      userId,
      targetEmail,
    });

    return NextResponse.json({
      success: true,
      result,
      message: `Test email successfully sent to ${result.recipientEmail} via Gmail OAuth.`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Test email error:", error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
