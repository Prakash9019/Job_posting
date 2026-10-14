import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, assertBatchAccess, AuthError } from "@/lib/auth/authorization";

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    const searchParams = req.nextUrl.searchParams;
    const batchId = searchParams.get("batchId") || undefined;

    if (batchId) {
      await assertBatchAccess(batchId, userId);
    }

    const baseBatchWhere = {
      userId,
      ...(batchId ? { id: batchId } : {}),
    };

    const [
      totalScreenshots,
      emailDraftsCount,
      linkedInLinksCount,
      applicationLinksCount,
      sentCount,
      failedSendCount,
      manualReviewItems,
      allBatches,
    ] = await Promise.all([
      prisma.screenshot.count({
        where: {
          batch: baseBatchWhere,
        },
      }),
      prisma.emailDraft.count({
        where: {
          userId,
          sendAttempts: { none: { status: "SENT" } },
          ...(batchId ? { batchId } : {}),
        },
      }),
      prisma.extractedUrl.count({
        where: {
          urlType: "LINKEDIN",
          screenshot: { batch: baseBatchWhere },
        },
      }),
      prisma.extractedUrl.count({
        where: {
          urlType: "APPLICATION_PORTAL",
          screenshot: { batch: baseBatchWhere },
        },
      }),
      prisma.sendAttempt.count({
        where: {
          status: "SENT",
          userId,
        },
      }),
      prisma.sendAttempt.count({
        where: {
          status: "FAILED",
          userId,
        },
      }),
      prisma.screenshot.findMany({
        where: {
          batch: baseBatchWhere,
          OR: [
            { status: "FAILED" },
            {
              result: {
                OR: [
                  { category: "UNCERTAIN" },
                  { category: "UNRELATED" },
                  { confidence: "LOW" },
                  { manualReviewReason: { not: null } },
                  { recipientEmail: null },
                ],
              },
            },
          ],
        },
        include: {
          result: true,
          urls: true,
          batch: {
            select: { name: true, createdAt: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.batch.findMany({
        where: baseBatchWhere,
        include: {
          resume: { select: { fileName: true } },
          _count: { select: { screenshots: true, emailDrafts: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalScreenshots,
        emailDraftsCount,
        linkedInLinksCount,
        applicationLinksCount,
        manualReviewCount: manualReviewItems.length,
        sentCount,
        failedSendCount,
      },
      manualReviewItems,
      batches: allBatches,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
