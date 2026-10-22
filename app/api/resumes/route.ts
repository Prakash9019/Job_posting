import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
import { extractResumeText } from "@/lib/ai/resume";
import { requireUser, AuthError } from "@/lib/auth/authorization";
import { transcribeMultipleDocumentsWithAI } from "@/lib/ats/parse";
import { normalizeWrappedBullets } from "@/lib/ats/scoring";
import { getCandidateFilename } from "@/lib/ats/tailor";
import { generateResumePdfFromText } from "@/lib/ats/pdf-artifact";

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
    const files = (formData.getAll("files") as File[]).filter((f) => f && f.size > 0);
    if (files.length === 0) {
      const single = formData.get("file") as File | null;
      if (single && single.size > 0) files.push(single);
    }
    const makeActive = formData.get("isActive") === "true";

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: "No resume file provided" },
        { status: 400 }
      );
    }

    for (const f of files) {
      if (f.size > 3 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: `Resume file "${f.name}" exceeds 3 MB limit` },
          { status: 400 }
        );
      }
    }

    const storage = getStorageProvider();
    let finalBuffer: Buffer;
    let finalMimeType: string;
    let finalFileName: string;
    let extractedText = "";

    const allImages = files.every(
      (f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|heic)$/i.test(f.name)
    );

    if (allImages) {
      const items: { buffer: Buffer; mimeType: string }[] = [];
      for (const f of files) {
        const ab = await f.arrayBuffer();
        items.push({
          buffer: Buffer.from(ab),
          mimeType: f.type || "image/png",
        });
      }

      // Transcribe sequentially across screenshots with full hyperlink and bullet preservation
      let rawTranscribed: string;
      try {
        rawTranscribed = await transcribeMultipleDocumentsWithAI(items);
      } catch (err) {
        console.error("Screenshot transcription failed:", err);
        return NextResponse.json(
          { success: false, code: "TRANSCRIPTION_FAILED", error: "Could not read the screenshots. Please upload clearer images and try again." },
          { status: 502 }
        );
      }
      extractedText = normalizeWrappedBullets(rawTranscribed);

      // Recreate as ATS LaTeX, compile, and VALIDATE the PDF (header, pages, content, links).
      // A raw screenshot is never stored as if it were a generated resume: on any failure nothing is
      // persisted and the previously active resume stays untouched.
      const generated = await generateResumePdfFromText(extractedText);
      if (!generated.ok) {
        const diagnosticKey = `diagnostics/${userId}/${Date.now()}-failed-generation.tex`;
        if (generated.latex) {
          await storage.saveFile(diagnosticKey, Buffer.from(generated.latex, "utf8"), "application/x-tex").catch(() => {});
        }
        console.error("Screenshot resume generation failed validation:", { userId, reasons: generated.reasons, diagnosticKey });
        return NextResponse.json(
          {
            success: false,
            code: "PDF_GENERATION_FAILED",
            error: `We could not generate a valid resume PDF from the screenshots: ${generated.reasons.join("; ")}. Nothing was saved. Please retry, or upload the resume as a PDF/.tex file.`,
            reasons: generated.reasons,
          },
          { status: 422 }
        );
      }
      finalBuffer = generated.buffer;
      finalMimeType = "application/pdf";
      finalFileName = getCandidateFilename(extractedText, undefined, "pdf");
    } else {
      const primaryFile = files[0];
      const arrayBuffer = await primaryFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const originalName = primaryFile.name || "resume.pdf";
      const isTex = originalName.endsWith(".tex") || (primaryFile.type && primaryFile.type.includes("tex"));
      const mimeType = isTex ? "application/x-tex" : (primaryFile.type || "application/pdf");

      extractedText = await extractResumeText(buffer, mimeType);
      finalBuffer = buffer;
      finalMimeType = mimeType;
      finalFileName = originalName;
    }

    // Save to private storage strictly partitioned by user
    const storageKey = `resumes/${userId}/${Date.now()}-${finalFileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await storage.saveFile(storageKey, finalBuffer, finalMimeType);

    // If making active or if no existing active resume, mark as active
    const existingActive = await prisma.resume.findFirst({
      where: { userId, isActive: true },
    });

    const shouldBeActive = makeActive || !existingActive;

    // Deactivate-old + create-new happen atomically; if the DB write fails the stored file is removed
    // so no orphan artifact is left and the existing active resume is unchanged.
    const createResume = prisma.resume.create({
      data: {
        userId,
        fileName: finalFileName,
        filePath: storageKey,
        fileSize: finalBuffer.length,
        mimeType: finalMimeType,
        extractedText,
        isActive: shouldBeActive,
      },
    });
    let resume;
    try {
      if (shouldBeActive) {
        [, resume] = await prisma.$transaction([
          prisma.resume.updateMany({ where: { userId }, data: { isActive: false } }),
          createResume,
        ]);
      } else {
        resume = await createResume;
      }
    } catch (dbErr) {
      await storage.deleteFile(storageKey).catch(() => {});
      throw dbErr;
    }

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

