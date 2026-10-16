import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
import { extractResumeText } from "@/lib/ai/resume";
import { requireUser, AuthError } from "@/lib/auth/authorization";

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireUser(req);

    const resumes = await prisma.resume.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, resumes });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const makeActive = formData.get("isActive") === "true";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No resume file provided" },
        { status: 400 }
      );
    }

    // Max 15MB limit
    if (file.size > 3 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "Resume file size exceeds 3 MB limit" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || "application/pdf";
    const originalName = file.name || "resume.pdf";

    // Extract text from resume
    const extractedText = await extractResumeText(buffer, mimeType);

    // Save to private storage strictly partitioned by user
    const storageKey = `resumes/${userId}/${Date.now()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storage = getStorageProvider();
    await storage.saveFile(storageKey, buffer, mimeType);

    // If making active or if no existing active resume, mark as active
    const existingActive = await prisma.resume.findFirst({
      where: { userId, isActive: true },
    });

    const shouldBeActive = makeActive || !existingActive;

    if (shouldBeActive) {
      await prisma.resume.updateMany({
        where: { userId },
        data: { isActive: false },
      });
    }

    const resume = await prisma.resume.create({
      data: {
        userId,
        fileName: originalName,
        filePath: storageKey,
        fileSize: file.size,
        mimeType,
        extractedText,
        isActive: shouldBeActive,
      },
    });

    return NextResponse.json({ success: true, resume });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Resume upload error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

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
        { success: false, error: "No resume IDs provided for deletion" },
        { status: 400 }
      );
    }

    // 1. Fetch resumes belonging to authenticated user
    const resumes = await prisma.resume.findMany({
      where: {
        id: { in: ids },
        userId,
      },
      select: {
        id: true,
        filePath: true,
        isActive: true,
      },
    });

    if (resumes.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No matching resumes found to delete",
        count: 0,
      });
    }

    const storage = getStorageProvider();

    // 2. Permanently delete files from storage
    for (const r of resumes) {
      try {
        await storage.deleteFile(r.filePath);
      } catch (storageErr) {
        console.warn(`Could not delete resume file ${r.filePath}:`, storageErr);
      }
    }

    // 3. Permanently hard-delete from database
    const foundIds = resumes.map((r) => r.id);
    const result = await prisma.resume.deleteMany({
      where: {
        id: { in: foundIds },
      },
    });

    // 4. If an active resume was deleted, make the most recent remaining resume active if one exists
    const hadActive = resumes.some((r) => r.isActive);
    if (hadActive) {
      const remaining = await prisma.resume.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      if (remaining) {
        await prisma.resume.update({
          where: { id: remaining.id },
          data: { isActive: true },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Permanently deleted ${result.count} resume${result.count === 1 ? "" : "s"} and storage files`,
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

