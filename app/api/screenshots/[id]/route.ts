import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
import { requireUser, assertScreenshotAccess, AuthError } from "@/lib/auth/authorization";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { id } = await params;

    // Verify ownership: throws 403 if screenshot belongs to another user or 404 if not found
    const screenshot = await assertScreenshotAccess(id, userId);

    const storage = getStorageProvider();

    // 1. Delete image from physical storage (Local Disk or Vercel Blob)
    try {
      await storage.deleteFile(screenshot.filePath);
    } catch (fileErr) {
      console.warn(`Could not delete file ${screenshot.filePath} from storage:`, fileErr);
    }

    // 2. Delete database record (cascades extraction results and extracted URLs)
    await prisma.screenshot.delete({
      where: { id },
    });

    // 3. Decrement total count on parent batch if present
    if (screenshot.batchId) {
      await prisma.batch
        .update({
          where: { id: screenshot.batchId },
          data: {
            totalScreenshots: {
              decrement: 1,
            },
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: "Screenshot deleted from storage and database successfully",
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
