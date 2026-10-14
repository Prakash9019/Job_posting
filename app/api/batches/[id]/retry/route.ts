import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { processBatch } from "@/lib/processing/batch";
import { requireUser, assertBatchAccess, AuthError } from "@/lib/auth/authorization";
export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { id } = await params;

    // Verify ownership: throws 403 if batch belongs to another user
    await assertBatchAccess(id, userId);

    let concurrency = 3;

    try {
      const body = await req.json();
      if (body.concurrency && typeof body.concurrency === "number") {
        concurrency = Math.min(Math.max(body.concurrency, 1), 10);
      }
    } catch {
      // Body is optional
    }

    // Reset failed screenshots so they can be processed again
    await prisma.screenshot.updateMany({
      where: {
        batchId: id,
        status: "FAILED",
      },
      data: {
        status: "PENDING",
        errorMessage: null,
      },
    });

    const result = await processBatch(id, concurrency);
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Batch retry error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
