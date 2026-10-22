import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
import { extractFromScreenshot, generateApplicationEmail } from "@/lib/ai/gemini";
import { ExtractionCategory } from "@/lib/validation/schemas";
import { getReadableResumeText } from "@/lib/ai/resume";
import { autoTailorResumeToJD } from "@/lib/ats/tailor";
import { compileValidatedPdf } from "@/lib/ats/pdf-artifact";

const MAX_RETRIES = parseInt(process.env.MAX_PROCESSING_RETRIES || "2", 10);
const DEFAULT_CONCURRENCY = parseInt(process.env.PROCESSING_CONCURRENCY || "3", 10);

/**
 * Calculate SHA-256 hash of a buffer for duplicate detection.
 */
export function calculateFileHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Process a single screenshot:
 * 1. Read image from storage
 * 2. Send to Gemini for structured extraction
 * 3. Save ExtractionResult
 * 4. Save extracted URLs (LinkedIn, application, others)
 * 5. If eligible for email (has valid recipient email + job context) and resume is available, generate personalized email draft
 */
export async function processScreenshotItem(screenshotId: string): Promise<boolean> {
  const screenshot = await prisma.screenshot.findUnique({
    where: { id: screenshotId },
    include: {
      batch: {
        include: {
          resume: true,
          user: true,
        },
      },
    },
  });

  if (!screenshot) {
    throw new Error(`Screenshot not found: ${screenshotId}`);
  }

  // Update status to PROCESSING
  const claim = await prisma.screenshot.updateMany({
    where: { id: screenshotId, OR: [{ status: { in: ["PENDING", "FAILED"] } }, { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } }] },
    data: { status: "PROCESSING", errorMessage: null },
  });
  if (!claim.count) return screenshot.status === "COMPLETED";

  const storage = getStorageProvider();

  try {
    const imageBuffer = await storage.readFile(screenshot.filePath);
    const extraction = await extractFromScreenshot(imageBuffer, screenshot.mimeType);

    // Save or update ExtractionResult
    const category: ExtractionCategory = extraction.category;

    await prisma.extractionResult.upsert({
      where: { screenshotId: screenshot.id },
      update: {
        category,
        companyName: extraction.companyName,
        jobTitle: extraction.jobTitle,
        recipientEmail: extraction.recipientEmail,
        jobDescription: extraction.jobDescription,
        requiredSkills: JSON.stringify(extraction.requiredSkills),
        experienceRequirements: extraction.experienceRequirements,
        location: extraction.location,
        workMode: extraction.workMode,
        contactName: extraction.contactName,
        contactRole: extraction.contactRole,
        evidenceText: extraction.evidenceText,
        confidence: extraction.confidence,
        manualReviewReason: extraction.manualReviewReason,
      },
      create: {
        screenshotId: screenshot.id,
        category,
        companyName: extraction.companyName,
        jobTitle: extraction.jobTitle,
        recipientEmail: extraction.recipientEmail,
        jobDescription: extraction.jobDescription,
        requiredSkills: JSON.stringify(extraction.requiredSkills),
        experienceRequirements: extraction.experienceRequirements,
        location: extraction.location,
        workMode: extraction.workMode,
        contactName: extraction.contactName,
        contactRole: extraction.contactRole,
        evidenceText: extraction.evidenceText,
        confidence: extraction.confidence,
        manualReviewReason: extraction.manualReviewReason,
      },
    });

    // Save extracted URLs (deduplicated per screenshot)
    await prisma.extractedUrl.deleteMany({
      where: { screenshotId: screenshot.id },
    });

    const urlInserts: {
      screenshotId: string;
      url: string;
      urlType: string;
      title: string | null;
    }[] = [];

    const seenUrls = new Set<string>();

    for (const url of extraction.linkedInUrls) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        urlInserts.push({
          screenshotId: screenshot.id,
          url,
          urlType: "LINKEDIN",
          title: extraction.jobTitle || extraction.companyName || "LinkedIn Link",
        });
      }
    }

    for (const url of extraction.applicationUrls) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        urlInserts.push({
          screenshotId: screenshot.id,
          url,
          urlType: "APPLICATION_PORTAL",
          title: extraction.jobTitle || extraction.companyName || "Application Portal",
        });
      }
    }

    for (const url of extraction.otherUrls) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        urlInserts.push({
          screenshotId: screenshot.id,
          url,
          urlType: "OTHER",
          title: extraction.jobTitle || extraction.companyName || "External Link",
        });
      }
    }

    if (urlInserts.length > 0) {
      await prisma.extractedUrl.createMany({
        data: urlInserts,
      });
    }

    // Check if eligible for Email generation:
    // Must have a valid recipient email, and resume attached or active for the batch
    const hasValidEmail =
      extraction.recipientEmail &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extraction.recipientEmail.trim());

    if (hasValidEmail) {
      // Find active resume for user if batch doesn't have one
      let resume = screenshot.batch.resume;
      if (!resume) {
        resume = await prisma.resume.findFirst({
          where: { userId: screenshot.batch.userId, isActive: true },
        });
      }

      if (resume) {
        try {
          const resumeText = await getReadableResumeText(resume);
          if (resumeText !== resume.extractedText) {
            await prisma.resume.update({ where: { id: resume.id }, data: { extractedText: resumeText } });
          }

          const jobText = [
            extraction.jobTitle,
            extraction.companyName,
            extraction.jobDescription,
            extraction.requiredSkills ? `Required Skills: ${extraction.requiredSkills}` : "",
          ].filter(Boolean).join("\n\n");

          let sourceLatex: string | undefined;
          if (resume.fileName.endsWith(".tex") || resume.mimeType.includes("tex")) {
            const rawTexBuf = await storage.readFile(resume.filePath).catch(() => null);
            if (rawTexBuf) sourceLatex = rawTexBuf.toString("utf-8");
          }
          if (!sourceLatex) {
            const savedTexResume = await prisma.resume.findFirst({
              where: {
                userId: screenshot.batch.userId,
                OR: [{ fileName: { endsWith: ".tex" } }, { mimeType: { contains: "tex" } }],
              },
              orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
            });
            if (savedTexResume) {
              const rawTexBuf = await storage.readFile(savedTexResume.filePath).catch(() => null);
              if (rawTexBuf) sourceLatex = rawTexBuf.toString("utf-8");
            }
          }

          let effectiveResumeId = resume.id;
          let generationStatus = "GENERATED";
          let effectiveResumeText = resumeText;

          try {
            const tailored = await autoTailorResumeToJD({
              resumeText,
              sourceLatex,
              jobText: jobText || `${extraction.jobTitle || "Role"} at ${extraction.companyName || "Company"}`,
              companyName: extraction.companyName || undefined,
            });

            effectiveResumeText = tailored.optimizedText;

            // Compile tailored LaTeX to binary PDF Buffer preserving all hyperlinks
            const compiledResult = await compileValidatedPdf(tailored.optimizedLatex, {
              linkSource: sourceLatex || resumeText,
              expectedText: tailored.optimizedText,
              minContentCoverage: 0.9,
            });
            if (!compiledResult.ok) console.warn("Tailored PDF failed validation; keeping the original resume:", compiledResult.reasons);
            const compiledPdf = compiledResult.ok ? compiledResult.buffer : null;
            if (compiledPdf && compiledPdf.length > 0) {
              const tailoredStoragePath = `resumes/tailored-${screenshot.id}-${Date.now()}.pdf`;
              await storage.saveFile(tailoredStoragePath, compiledPdf, "application/pdf");

              const tailoredResumeRecord = await prisma.resume.create({
                data: {
                  userId: screenshot.batch.userId,
                  fileName: tailored.attachmentFilename || "Resume.pdf",
                  filePath: tailoredStoragePath,
                  fileSize: compiledPdf.length,
                  mimeType: "application/pdf",
                  extractedText: tailored.optimizedText,
                  isActive: false,
                },
              });
              effectiveResumeId = tailoredResumeRecord.id;
              generationStatus = `ATS Tailored: ${tailored.baselineScore} → ${tailored.finalScore}/100`;
            } else {
              generationStatus = `ATS Tailored: ${tailored.baselineScore} → ${tailored.finalScore}/100 (LaTeX Ready)`;
            }
          } catch (tailorErr) {
            console.warn("ATS Tailoring encountered an issue, proceeding with active resume:", tailorErr);
          }

          const generatedDraft = await generateApplicationEmail({
            jobDetails: extraction,
            screenshot: { content: imageBuffer, mimeType: screenshot.mimeType },
            resumeText: effectiveResumeText,
            senderName: screenshot.batch.user.name || "Applicant",
            senderEmail: screenshot.batch.user.email || undefined,
          });

          const existingDraft = await prisma.emailDraft.findFirst({ where: { screenshotId: screenshot.id } });
          if (!existingDraft) {
            await prisma.emailDraft.create({
              data: {
                screenshotId: screenshot.id,
                batchId: screenshot.batchId,
                userId: screenshot.batch.userId,
                resumeId: effectiveResumeId,
                companyName: extraction.companyName || "Company",
                jobTitle: extraction.jobTitle || "Job Opening",
                recipientEmail: extraction.recipientEmail!.trim(),
                subject: generatedDraft.subject,
                body: generatedDraft.body,
                generationStatus,
                reviewStatus: "NEEDS_REVIEW",
              },
            });
          }
        } catch (emailGenErr) {
          console.error("Failed to generate personalized email:", emailGenErr);
          // Draft generation failed, note it in manual review reason
          await prisma.extractionResult.update({
            where: { screenshotId: screenshot.id },
            data: {
              manualReviewReason: `Email draft generation failed: ${emailGenErr instanceof Error ? emailGenErr.message : String(emailGenErr)}`,
            },
          });
        }
      }
    }

    // Mark screenshot as COMPLETED
    await prisma.screenshot.update({
      where: { id: screenshot.id },
      data: { status: "COMPLETED", errorMessage: null },
    });

    return true;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Error processing screenshot ${screenshotId}:`, err);

    await prisma.screenshot.update({
      where: { id: screenshot.id },
      data: {
        status: "FAILED",
        errorMessage: errorMsg,
        retryCount: { increment: 1 },
      },
    });

    return false;
  }
}

/**
 * Execute processing for a batch with bounded concurrency and update progress.
 */
export async function processBatch(
  batchId: string,
  concurrencyLimit = DEFAULT_CONCURRENCY
) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      screenshots: true,
    },
  });

  if (!batch) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  // Update batch status to PROCESSING
  await prisma.batch.update({
    where: { id: batchId },
    data: { status: "PROCESSING" },
  });

  const pendingScreenshots = batch.screenshots.filter(
    (s) => s.status === "PENDING" || (s.status === "FAILED" && s.retryCount < MAX_RETRIES) || (s.status === "PROCESSING" && s.updatedAt.getTime() < Date.now() - 10 * 60 * 1000)
  ).slice(0, 3);

  let processedCount = batch.screenshots.filter(s => s.status === "COMPLETED").length;
  let failedCount = batch.screenshots.filter(s => s.status === "FAILED").length;

  // Process with concurrency pool
  const queue = [...pendingScreenshots];
  const activeWorkers: Promise<void>[] = [];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      const success = await processScreenshotItem(item.id);
      if (item.status === "FAILED") failedCount--;
      if (success) {
        processedCount++;
      } else {
        failedCount++;
      }

      // Update batch counts incrementally
      await prisma.batch.update({
        where: { id: batchId },
        data: {
          processedCount,
          failedCount,
        },
      });
    }
  }

  const poolSize = Math.min(concurrencyLimit, queue.length);
  for (let i = 0; i < poolSize; i++) {
    activeWorkers.push(worker());
  }

  await Promise.all(activeWorkers);

  // Update final batch status
  const finalBatch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { screenshots: true },
  });

  const anyFailed = finalBatch?.screenshots.some((s) => s.status === "FAILED");
  const anyProcessing = finalBatch?.screenshots.some((s) => s.status === "PROCESSING" || s.status === "PENDING");

  const finalStatus = anyProcessing
    ? "PROCESSING"
    : anyFailed && processedCount === 0
    ? "FAILED"
    : "COMPLETED";

  await prisma.batch.update({
    where: { id: batchId },
    data: {
      status: finalStatus,
      processedCount,
      failedCount,
    },
  });

  const remaining = finalBatch?.screenshots.filter(s => s.status === "PENDING" || (s.status === "FAILED" && s.retryCount < MAX_RETRIES)).length || 0;
  return { batchId, processedCount, failedCount, status: finalStatus, remaining };
}
