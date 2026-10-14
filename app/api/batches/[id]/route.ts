import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
import { requireUser, assertBatchAccess, AuthError } from "@/lib/auth/authorization";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { id } = await params;

    // Verify ownership: throws 403 if batch belongs to another user
    await assertBatchAccess(id, userId);

    const batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        resume: true,
        screenshots: {
          include: {
            result: true,
            urls: true,
            emailDrafts: true,
          },
          orderBy: { createdAt: "asc" },
        },
        emailDrafts: {
          include: {
            sendAttempts: true,
            resume: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json({ success: true, batch });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { id } = await params;

    // Verify ownership: throws 403 if batch belongs to another user
    await assertBatchAccess(id, userId);

    const batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        screenshots: true,
      },
    });

    if (!batch) {
      return NextResponse.json({ success: false, error: "Batch not found" }, { status: 404 });
    }

    const storage = getStorageProvider();

    // Delete all screenshot files
    for (const screenshot of batch.screenshots) {
      try {
        await storage.deleteFile(screenshot.filePath);
      } catch (fileErr) {
        console.warn(`Could not delete file ${screenshot.filePath}:`, fileErr);
      }
    }

    // Delete batch (cascade deletes screenshots, results, urls, drafts)
    await prisma.batch.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Batch and files deleted successfully" });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
