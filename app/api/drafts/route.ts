import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, assertBatchAccess, AuthError } from "@/lib/auth/authorization";

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    const searchParams = req.nextUrl.searchParams;
    const batchId = searchParams.get("batchId") || undefined;
    const reviewStatus = searchParams.get("status") || undefined;
    const query = searchParams.get("q") || undefined;

    if (batchId) {
      await assertBatchAccess(batchId, userId);
    }

    const whereClause: Record<string, unknown> = {
      userId, // Strictly scoped to authenticated user
      sendAttempts: { none: { status: "SENT" } },
    };

    if (batchId) whereClause.batchId = batchId;
    if (reviewStatus) whereClause.reviewStatus = reviewStatus;

    if (query && query.trim() !== "") {
      const q = query.trim();
      whereClause.OR = [
        { companyName: { contains: q } },
        { jobTitle: { contains: q } },
        { recipientEmail: { contains: q } },
        { subject: { contains: q } },
        { body: { contains: q } },
      ];
    }

    const drafts = await prisma.emailDraft.findMany({
      where: whereClause,
      include: {
        resume: {
          select: { id: true, fileName: true },
        },
        screenshot: {
          select: { id: true, fileName: true, filePath: true },
        },
        sendAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, drafts });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
