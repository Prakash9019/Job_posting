import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { generateApplicationEmail } from "@/lib/ai/gemini";
import { getStorageProvider } from "@/lib/storage";
import { getReadableResumeText } from "@/lib/ai/resume";
import { requireUser, assertDraftAccess, AuthError } from "@/lib/auth/authorization";
import { autoTailorResumeToJD } from "@/lib/ats/tailor";
import { compileValidatedPdf } from "@/lib/ats/pdf-artifact";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { id } = await params;

    // Verify ownership: throws 403 if draft belongs to another user
    await assertDraftAccess(id, userId);

    const draft = await prisma.emailDraft.findUnique({
      where: { id },
      include: {
        screenshot: {
          include: {
            result: true,
          },
        },
        user: true,
      },
    });

    if (!draft) {
      return NextResponse.json({ success: false, error: "Draft not found" }, { status: 404 });
    }

    // Find active resume for this authenticated user
    const activeResume = await prisma.resume.findFirst({
      where: { userId, isActive: true },
    });

    if (!activeResume) {
      return NextResponse.json(
        { success: false, error: "No active resume with extracted text found for this user." },
        { status: 400 }
      );
    }

    // Build job details from extraction result or existing draft
    const extractionResult = draft.screenshot?.result;
    const jobDetails = {
      category: (extractionResult?.category || "JOB_POST") as "JOB_POST",
      companyName: extractionResult?.companyName || draft.companyName,
      jobTitle: extractionResult?.jobTitle || draft.jobTitle,
      recipientEmail: draft.recipientEmail,
      linkedInUrls: [],
      applicationUrls: [],
      otherUrls: [],
      jobDescription: extractionResult?.jobDescription || `${draft.jobTitle} at ${draft.companyName}`,
      requiredSkills: extractionResult?.requiredSkills
        ? JSON.parse(extractionResult.requiredSkills)
        : [],
      experienceRequirements: extractionResult?.experienceRequirements || null,
      location: extractionResult?.location || null,
      workMode: (extractionResult?.workMode as "Remote" | "Hybrid" | "On-site" | "Unspecified" | null) || null,
      contactName: extractionResult?.contactName || null,
      contactRole: extractionResult?.contactRole || null,
      evidenceText: extractionResult?.evidenceText || null,
      confidence: (extractionResult?.confidence || "MEDIUM") as "HIGH" | "MEDIUM" | "LOW",
      manualReviewReason: null,
    };

    const resumeText = await getReadableResumeText(activeResume);
    if (resumeText !== activeResume.extractedText) {
      await prisma.resume.update({ where: { id: activeResume.id }, data: { extractedText: resumeText } });
    }

    const storage = getStorageProvider();
    let sourceLatex: string | undefined;
    if (activeResume.fileName.endsWith(".tex") || activeResume.mimeType.includes("tex")) {
      const rawTexBuf = await storage.readFile(activeResume.filePath).catch(() => null);
      if (rawTexBuf) sourceLatex = rawTexBuf.toString("utf-8");
    }
    if (!sourceLatex) {
      const savedTexResume = await prisma.resume.findFirst({
        where: {
          userId,
          OR: [{ fileName: { endsWith: ".tex" } }, { mimeType: { contains: "tex" } }],
        },
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      });
      if (savedTexResume) {
        const rawTexBuf = await storage.readFile(savedTexResume.filePath).catch(() => null);
        if (rawTexBuf) sourceLatex = rawTexBuf.toString("utf-8");
      }
    }

    let effectiveResumeId = activeResume.id;
    let effectiveResumeText = resumeText;
    let generationStatus = "REGENERATED";

    try {
      const jobText = [jobDetails.jobTitle, jobDetails.companyName, jobDetails.jobDescription].filter(Boolean).join("\n\n");
      const tailored = await autoTailorResumeToJD({
        resumeText,
        sourceLatex,
        jobText,
        companyName: jobDetails.companyName || undefined,
      });
      effectiveResumeText = tailored.optimizedText;

      const compiledResult = await compileValidatedPdf(tailored.optimizedLatex, {
        linkSource: sourceLatex || resumeText,
        expectedText: tailored.optimizedText,
        minContentCoverage: 0.9,
      });
      if (!compiledResult.ok) console.warn("Tailored PDF failed validation; keeping the original resume:", compiledResult.reasons);
      const compiledPdf = compiledResult.ok ? compiledResult.buffer : null;
      if (compiledPdf && compiledPdf.length > 0) {
        const tailoredPath = `resumes/tailored-regen-${draft.id}-${Date.now()}.pdf`;
        await storage.saveFile(tailoredPath, compiledPdf, "application/pdf");

        const tailoredRecord = await prisma.resume.create({
          data: {
            userId,
            fileName: tailored.attachmentFilename || "Resume.pdf",
            filePath: tailoredPath,
            fileSize: compiledPdf.length,
            mimeType: "application/pdf",
            extractedText: tailored.optimizedText,
            isActive: false,
          },
        });
        effectiveResumeId = tailoredRecord.id;
        generationStatus = `ATS Tailored: ${tailored.baselineScore} → ${tailored.finalScore}/100`;
      }
    } catch (tailorErr) {
      console.warn("Regenerate ATS tailoring fallback:", tailorErr);
    }

    const regenerated = await generateApplicationEmail({
      jobDetails,
      screenshot: draft.screenshot ? { content: await storage.readFile(draft.screenshot.filePath), mimeType: draft.screenshot.mimeType } : undefined,
      resumeText: effectiveResumeText,
      senderName: draft.user.name || "Applicant",
      senderEmail: draft.user.email || undefined,
    });

    const updated = await prisma.emailDraft.update({
      where: { id },
      data: {
        subject: regenerated.subject,
        body: regenerated.body,
        resumeId: effectiveResumeId,
        generationStatus,
        reviewStatus: "NEEDS_REVIEW",
      },
      include: {
        resume: true,
      },
    });

    return NextResponse.json({ success: true, draft: updated });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Draft regeneration error:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
