import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, assertBatchAccess, AuthError } from "@/lib/auth/authorization";

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type"); // "LINKEDIN" | "APPLICATION_PORTAL" | null
    const batchId = searchParams.get("batchId") || undefined;

    if (batchId) {
      await assertBatchAccess(batchId, userId);
    }

    const whereClause: Record<string, unknown> = {
      screenshot: {
        batch: {
          userId,
          ...(batchId ? { id: batchId } : {}),
        },
      },
    };

    if (type) {
      whereClause.urlType = type;
    }

    const links = await prisma.extractedUrl.findMany({
      where: whereClause,
      include: {
        screenshot: {
          select: {
            id: true,
            fileName: true,
            filePath: true,
            batchId: true,
            result: {
              select: {
                category: true,
                companyName: true,
                jobTitle: true,
                location: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, links });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
