import { NextRequest, NextResponse } from "next/server";
import { sendEmailDraft } from "@/lib/email/gmail";
import { prisma } from "@/lib/db/prisma";
import { BulkSendRequestSchema } from "@/lib/validation/schemas";
import { requireUser, assertDraftAccess, AuthError } from "@/lib/auth/authorization";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    const body = await req.json();
    const validated = BulkSendRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: validated.error.issues[0].message },
        { status: 400 }
      );
    }

    const { approveAndSend } = validated.data;
    const draftIds = [...new Set(validated.data.draftIds)];
    const senderEmail = typeof body.senderEmail === "string" ? body.senderEmail : undefined;

    // Verify ownership of every single draft before proceeding
    for (const draftId of draftIds) {
      await assertDraftAccess(draftId, userId);
    }

    const profile = await prisma.user.findUnique({ where: { id: userId } });
    const account = senderEmail ? await prisma.gmailAccount.findFirst({ where: { userId, email: senderEmail, isConnected: true } }) : null;
    if (!account || profile?.email !== senderEmail) {
      return NextResponse.json({ success: false, error: "Your sender account changed or is disconnected. Refresh and review the From address." }, { status: 400 });
    }

    const results: {
      draftId: string;
      success: boolean;
      recipientEmail?: string;
      gmailMessageId?: string | null;
      error?: string;
    }[] = [];

    let successCount = 0;
    let failureCount = 0;

    // Send messages sequentially or bounded concurrency to respect Gmail rate limits
    for (const draftId of draftIds) {
      try {
        if (approveAndSend) {
          // Explicit approval comes from the final Approve & Send confirmation.
          const approved = await prisma.emailDraft.updateMany({
            where: { id: draftId, userId, reviewStatus: { in: ["NEEDS_REVIEW", "APPROVED"] }, sendAttempts: { none: { status: { in: ["SENT", "SENDING", "UNKNOWN"] } } } },
            data: { reviewStatus: "APPROVED" },
          });
          if (!approved.count) throw new Error("Draft is rejected, already sent, or has a send awaiting confirmation. Review it before retrying.");
        }
        const sendResult = await sendEmailDraft({
          draftId,
          userId,
          senderEmail,
        });

        results.push({
          draftId,
          success: true,
          recipientEmail: sendResult.recipientEmail,
          gmailMessageId: sendResult.gmailMessageId,
        });
        successCount++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({
          draftId,
          success: false,
          error: errorMsg,
        });
        failureCount++;
      }
    }

    return NextResponse.json({
      success: failureCount === 0,
      total: draftIds.length,
      successCount,
      failureCount,
      results,
      summary: `Sent ${successCount} of ${draftIds.length} emails. ${failureCount > 0 ? `${failureCount} failed.` : "All succeeded."}`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Bulk send error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
