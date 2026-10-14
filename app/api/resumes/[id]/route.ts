import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
import { requireUser, assertResumeAccess, AuthError } from "@/lib/auth/authorization";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { id } = await params;

    // Verify ownership: throws 403 if resume does not belong to active user
    const resume = await assertResumeAccess(id, userId);

    // Delete stored file
    const storage = getStorageProvider();
    try {
      await storage.deleteFile(resume.filePath);
    } catch (storageErr) {
      console.warn("Storage delete warning:", storageErr);
    }

    // Delete database record
    await prisma.resume.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Resume deleted" });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
