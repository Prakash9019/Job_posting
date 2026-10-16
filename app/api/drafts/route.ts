import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, assertBatchAccess, AuthError } from "@/lib/auth/authorization";
import { getStorageProvider } from "@/lib/storage";
import { getReadableResumeText } from "@/lib/ai/resume";
import { generateApplicationEmail, extractFromScreenshot, extractJobDetailsFromText } from "@/lib/ai/gemini";
import { autoTailorResumeToJD, compileLatexToPdfBuffer } from "@/lib/ats/tailor";

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    const searchParams = req.nextUrl.searchParams;
    const batchId = searchParams.get("batchId") || undefined;
    const reviewStatus = searchParams.get("status") || undefined;
    const query = searchParams.get("q") || undefined;

    if (batchId) {
      await assertBatchAccess(batchId, userId);
    }

    const whereClause: Record<string, unknown> = {
      userId,
      sendAttempts: { none: { status: "SENT" } },
    };

    if (batchId) whereClause.batchId = batchId;
    if (reviewStatus) whereClause.reviewStatus = reviewStatus;

    if (query && query.trim() !== "") {
      const q = query.trim();
      whereClause.OR = [
        { companyName: { contains: q } },
        { jobTitle: { contains: q } },
        { recipientEmail: { contains: q } },
        { subject: { contains: q } },
        { body: { contains: q } },
      ];
    }

    const drafts = await prisma.emailDraft.findMany({
      where: whereClause,
      include: {
        resume: {
          select: { id: true, fileName: true },
        },
        screenshot: {
          select: { id: true, fileName: true, filePath: true },
        },
        sendAttempts: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, drafts });
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
    const body = await req.json();

    let recipientEmail = String(body.recipientEmail || "").trim();
    let companyName = String(body.companyName || "").trim();
    let jobTitle = String(body.jobTitle || body.roleTitle || "").trim();
    let jobDescription = String(body.jobDescription || body.rawJobText || "").trim();
    let screenshotBuffer: Buffer | null = null;
    let screenshotMime = "image/png";

    if (body.image) {
      const base64Data = String(body.image).replace(/^data:image\/[a-z]+;base64,/, "");
      screenshotBuffer = Buffer.from(base64Data, "base64");
      screenshotMime = body.mimeType || "image/png";

      try {
        const extracted = await extractFromScreenshot(screenshotBuffer, screenshotMime);
        if (extracted) {
          if (!recipientEmail && extracted.recipientEmail) recipientEmail = extracted.recipientEmail.trim();
          if (!companyName && extracted.companyName) companyName = extracted.companyName.trim();
          if (!jobTitle && extracted.jobTitle) jobTitle = extracted.jobTitle.trim();
          if (!jobDescription && extracted.jobDescription) jobDescription = extracted.jobDescription.trim();
          else if (extracted.jobDescription && extracted.jobDescription.length > jobDescription.length) {
            jobDescription = extracted.jobDescription.trim();
          }
        }
      } catch (extractErr) {
        console.warn("Screenshot extraction error:", extractErr);
      }
    } else if (jobDescription && (!companyName || !jobTitle || !recipientEmail)) {
      try {
        const extracted = await extractJobDetailsFromText(jobDescription);
        if (extracted) {
          if (!recipientEmail && extracted.recipientEmail) recipientEmail = extracted.recipientEmail.trim();
          if (!companyName && extracted.companyName) companyName = extracted.companyName.trim();
          if (!jobTitle && extracted.jobTitle) jobTitle = extracted.jobTitle.trim();
          if (extracted.jobDescription) jobDescription = extracted.jobDescription.trim();
        }
      } catch (extractErr) {
        console.warn("JD text extraction error:", extractErr);
      }
    }

    if (!companyName) companyName = "Company";
    if (!jobTitle) jobTitle = "Role";
    if (!jobDescription) jobDescription = `${jobTitle} at ${companyName}`;
    if (!recipientEmail) {
      recipientEmail = `recruiter@${companyName.toLowerCase().replace(/[^a-z0-9]/g, "") || "company"}.com`;
    }

    const requestedResumeId = body.resumeId ? String(body.resumeId) : undefined;

    let resume = requestedResumeId
      ? await prisma.resume.findFirst({ where: { id: requestedResumeId, userId } })
      : await prisma.resume.findFirst({ where: { userId, isActive: true } });

    if (!resume) {
      resume = await prisma.resume.findFirst({ where: { userId } });
    }

    if (!resume) {
      return NextResponse.json({ success: false, error: "Please upload an active resume first." }, { status: 400 });
    }

    const resumeText = await getReadableResumeText(resume);
    const storage = getStorageProvider();

    let sourceLatex: string | undefined;
    if (resume.fileName.endsWith(".tex") || resume.mimeType.includes("tex")) {
      const rawTexBuf = await storage.readFile(resume.filePath).catch(() => null);
      if (rawTexBuf) sourceLatex = rawTexBuf.toString("utf-8");
    }

    const jobText = [jobTitle, companyName, jobDescription].filter(Boolean).join("\n\n");
    const tailored = await autoTailorResumeToJD({
      resumeText,
      sourceLatex,
      jobText,
      companyName: companyName || undefined,
    });

    let effectiveResumeId = resume.id;
    let generationStatus = `ATS Tailored: ${tailored.baselineScore} → ${tailored.finalScore}/100`;

    const compiledPdf = await compileLatexToPdfBuffer(tailored.optimizedLatex);
    if (compiledPdf && compiledPdf.length > 0) {
      const tailoredPath = `resumes/tailored-manual-${Date.now()}.pdf`;
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
    }

    const profile = await prisma.user.findUnique({ where: { id: userId } });
    const generatedDraft = await generateApplicationEmail({
      jobDetails: {
        category: "JOB_POST",
        companyName,
        jobTitle,
        recipientEmail,
        linkedInUrls: [],
        applicationUrls: [],
        otherUrls: [],
        jobDescription,
        requiredSkills: [],
        experienceRequirements: null,
        location: null,
        workMode: null,
        contactName: null,
        contactRole: null,
        evidenceText: null,
        confidence: "HIGH",
        manualReviewReason: null,
      },
      screenshot: screenshotBuffer ? { content: screenshotBuffer, mimeType: screenshotMime } : undefined,
      resumeText: tailored.optimizedText,
      senderName: profile?.name || "Applicant",
      senderEmail: profile?.email || undefined,
    });

    let batchId = body.batchId ? String(body.batchId) : undefined;
    if (!batchId) {
      const defaultBatch = await prisma.batch.create({
        data: {
          userId,
          name: `Outreach ${new Date().toLocaleDateString()}`,
          status: "COMPLETED",
          resumeId: effectiveResumeId,
        },
      });
      batchId = defaultBatch.id;
    }

    const draft = await prisma.emailDraft.create({
      data: {
        batchId,
        userId,
        resumeId: effectiveResumeId,
        companyName,
        jobTitle,
        recipientEmail,
        subject: body.subject || generatedDraft.subject,
        body: body.body || generatedDraft.body,
        generationStatus,
        reviewStatus: "NEEDS_REVIEW",
      },
      include: {
        resume: { select: { id: true, fileName: true } },
      },
    });

    return NextResponse.json({
      success: true,
      draft,
      atsScore: {
        baselineScore: tailored.baselineScore,
        finalScore: tailored.finalScore,
      },
      badge: `✓ Tailored ATS Resume Attached (Score: ${tailored.finalScore}/100)`,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
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
        { success: false, error: "No draft IDs provided for deletion" },
        { status: 400 }
      );
    }

    // Permanently hard delete drafts owned by the authenticated user
    const result = await prisma.emailDraft.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Permanently deleted ${result.count} draft${result.count === 1 ? "" : "s"}`,
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

