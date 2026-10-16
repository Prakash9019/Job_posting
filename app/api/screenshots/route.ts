import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
import { requireUser, AuthError } from "@/lib/auth/authorization";

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids
      : req.nextUrl.searchParams.get("id")
      ? [req.nextUrl.searchParams.get("id")!]
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No screenshot IDs provided for deletion" },
        { status: 400 }
      );
    }

    // 1. Fetch screenshots strictly owned by authenticated user
    const screenshots = await prisma.screenshot.findMany({
      where: {
        id: { in: ids },
        batch: { userId },
      },
      select: {
        id: true,
        filePath: true,
        batchId: true,
      },
    });

    if (screenshots.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No matching screenshots found to delete",
        count: 0,
      });
    }

    const storage = getStorageProvider();
    const batchCounts = new Map<string, number>();

    // 2. Permanently delete all files from storage (local disk / Vercel blob)
    for (const s of screenshots) {
      try {
        await storage.deleteFile(s.filePath);
      } catch (fileErr) {
        console.warn(`Could not delete storage file ${s.filePath}:`, fileErr);
      }
      if (s.batchId) {
        batchCounts.set(s.batchId, (batchCounts.get(s.batchId) || 0) + 1);
      }
    }

    // 3. Permanently hard-delete database records (cascades extraction results & URLs)
    const foundIds = screenshots.map((s) => s.id);
    const result = await prisma.screenshot.deleteMany({
      where: {
        id: { in: foundIds },
      },
    });

    // 4. Update totalScreenshots on parent batches
    for (const [batchId, decrementCount] of batchCounts.entries()) {
      await prisma.batch
        .update({
          where: { id: batchId },
          data: {
            totalScreenshots: {
              decrement: decrementCount,
            },
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: `Permanently deleted ${result.count} screenshot${result.count === 1 ? "" : "s"} and storage files`,
      count: result.count,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
