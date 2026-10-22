import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
import { calculateFileHash } from "@/lib/processing/batch";
import { isReadableResumeText } from "@/lib/ai/resume";
import { requireUser, assertResumeAccess, assertBatchAccess, AuthError } from "@/lib/auth/authorization";

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireUser(req);

    const batches = await prisma.batch.findMany({
      where: { userId },
      include: {
        resume: {
          select: { id: true, fileName: true },
        },
        _count: {
          select: {
            screenshots: true,
            emailDrafts: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, batches });
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
    const batchName = (formData.get("name") as string) || `Batch ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
    const resumeId = (formData.get("resumeId") as string) || null;
    const appendId = String(formData.get("batchId") || "");
    const existingBatch = appendId ? await assertBatchAccess(appendId, userId) : null;
    if (existingBatch && existingBatch.status !== "PENDING") throw new AuthError(409, "Cannot add files after batch processing starts.");

    // Collect all uploaded screenshot files (up to 80)
    const files: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("screenshot") || key === "files" || key === "file") {
        if (value instanceof File) {
          files.push(value);
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No screenshots provided. Upload between 1 and 80 screenshots." },
        { status: 400 }
      );
    }

    if (files.length > 80) {
      return NextResponse.json(
        { success: false, error: "Maximum 80 screenshots per batch allowed." },
        { status: 400 }
      );
    }
    if (files.some(f => !["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(f.type) || f.size > 3 * 1024 * 1024 || f.size === 0)) {
      throw new AuthError(400, "Upload PNG, JPEG, WebP or PDF files under 3 MB each.");
    }
    const existingScreenshots = appendId ? await prisma.screenshot.findMany({ where: { batchId: appendId }, select: { fileHash: true } }) : [];
    if (existingScreenshots.length + files.length > 80) throw new AuthError(400, "Maximum 80 screenshots per batch.");

    // Determine active resume if not provided; if provided, verify ownership!
    let finalResumeId = resumeId;
    if (finalResumeId) {
      await assertResumeAccess(finalResumeId, userId);
    } else {
      const activeResume = await prisma.resume.findFirst({
        where: { userId, isActive: true },
        orderBy: { updatedAt: "desc" },
      });
      if (activeResume && isReadableResumeText(activeResume.extractedText)) {
        finalResumeId = activeResume.id;
      } else {
        const fallback = await prisma.resume.findFirst({
          where: { userId },
          orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        });
        if (fallback) finalResumeId = fallback.id;
      }
    }

    // 1. Create Batch record strictly for active user
    const batch = existingBatch || await prisma.batch.create({
      data: {
        userId,
        name: batchName,
        status: "PENDING",
        totalScreenshots: files.length,
        resumeId: finalResumeId,
      },
    });

    const storage = getStorageProvider();
    const createdScreenshots = [];
    const seenHashesInThisBatch = new Set<string>(existingScreenshots.map(s => s.fileHash));
    let duplicatesSkipped = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mimeType = file.type || "image/png";
      const originalName = file.name || `screenshot_${i + 1}.png`;

      // Calculate SHA-256 for duplicate detection
      const fileHash = calculateFileHash(buffer);

      if (seenHashesInThisBatch.has(fileHash)) {
        duplicatesSkipped++;
        continue;
      }
      seenHashesInThisBatch.add(fileHash);

      const storageKey = `screenshots/${userId}/${batch.id}/${Date.now()}_${i}_${originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await storage.saveFile(storageKey, buffer, mimeType);

      const screenshot = await prisma.screenshot.create({
        data: {
          batchId: batch.id,
          fileName: originalName,
          filePath: storageKey,
          fileSize: file.size,
          mimeType,
          fileHash,
          status: "PENDING",
        },
      });

      createdScreenshots.push(screenshot);
    }

    // Update total count after duplicate deduction
    const updatedBatch = await prisma.batch.update({
      where: { id: batch.id },
      data: {
        totalScreenshots: existingScreenshots.length + createdScreenshots.length,
      },
      include: {
        screenshots: true,
        resume: true,
      },
    });

    return NextResponse.json({
      success: true,
      batch: updatedBatch,
      duplicatesSkipped,
      message: `Batch created with ${createdScreenshots.length} screenshots (${duplicatesSkipped} duplicates skipped).`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Batch creation error:", error);
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
        { success: false, error: "No batch IDs provided for deletion" },
        { status: 400 }
      );
    }

    // 1. Fetch batches strictly owned by authenticated user
    const batches = await prisma.batch.findMany({
      where: {
        id: { in: ids },
        userId,
      },
      include: {
        screenshots: {
          select: {
            filePath: true,
          },
        },
      },
    });

    if (batches.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No matching batches found to delete",
        count: 0,
      });
    }

    const storage = getStorageProvider();

    // 2. Permanently delete all associated screenshot files from storage
    for (const batch of batches) {
      for (const screenshot of batch.screenshots) {
        try {
          await storage.deleteFile(screenshot.filePath);
        } catch (fileErr) {
          console.warn(`Could not delete file ${screenshot.filePath}:`, fileErr);
        }
      }
    }

    // 3. Permanently hard-delete batches from database (cascades screenshots, results, urls, drafts)
    const foundIds = batches.map((b) => b.id);
    const result = await prisma.batch.deleteMany({
      where: {
        id: { in: foundIds },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Permanently deleted ${result.count} batch${result.count === 1 ? "" : "es"} and associated files`,
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

