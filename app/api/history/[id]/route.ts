import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, assertSendAttemptAccess, AuthError } from "@/lib/auth/authorization";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { id } = await params;

    // Verify ownership: throws 403 if attempt does not belong to active user
    await assertSendAttemptAccess(id, userId);

    await prisma.sendAttempt.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "Send history attempt permanently deleted",
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
