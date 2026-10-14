import { NextRequest, NextResponse } from "next/server";
import { getStorageProvider } from "@/lib/storage";
import { requireUser, assertFileAccess, AuthError } from "@/lib/auth/authorization";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { type, id } = await params;

    // Verify ownership: throws 403 if the requested file belongs to another user
    const fileInfo = await assertFileAccess(type, id, userId);

    const storage = getStorageProvider();
    const exists = await storage.exists(fileInfo.filePath);
    if (!exists) {
      return new NextResponse("File not found on storage", { status: 404 });
    }

    const fileBuffer = await storage.readFile(fileInfo.filePath);

    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": fileInfo.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileInfo.fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return new NextResponse(error.message, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return new NextResponse(`Error reading file: ${errorMsg}`, { status: 500 });
  }
}
