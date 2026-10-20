import { NextRequest, NextResponse } from "next/server";
import { requireUser, assertResumeAccess, AuthError } from "@/lib/auth/authorization";
import { getReadableResumeText, isReadableResumeText } from "@/lib/ai/resume";
import { analyzeResume } from "@/lib/ats/analysis";
import { parseATSFile } from "@/lib/ats/parse";
import { prisma } from "@/lib/db/prisma";
import { getStorageProvider } from "@/lib/storage";
export const maxDuration = 120;
const pending = new Set<string>();

export async function POST(req: NextRequest) {
  let activeUser: string | undefined;
  try {
    const { userId } = requireUser(req);
    if (pending.has(userId)) return NextResponse.json({ success: false, error: "An analysis is already running. Please wait." }, { status: 429 });
    pending.add(userId); activeUser = userId;
    const form = await req.formData();
    let resumeText = String(form.get("resumeText") || "").replace(/\r\n/g, "\n").trim();
    let method = "Edited text";
    const file = form.get("resume");
    let rawLatex: string | undefined;
    if (file instanceof File && file.size) {
      const parsed = await parseATSFile(file);
      resumeText = parsed.text.replace(/\r\n/g, "\n").trim();
      method = parsed.method;
      if ("rawLatex" in parsed && typeof parsed.rawLatex === "string") {
        rawLatex = parsed.rawLatex;
      }
    } else if (!resumeText && form.get("resumeId")) {
      const resume = await assertResumeAccess(String(form.get("resumeId")), userId);
      resumeText = (await getReadableResumeText(resume)).replace(/\r\n/g, "\n").trim();
      method = "Saved resume text";
      if (resume.fileName.endsWith(".tex") || resume.mimeType.includes("x-latex") || resume.mimeType.includes("x-tex")) {
        try {
          const buf = await getStorageProvider().readFile(resume.filePath);
          const content = buf.toString("utf-8");
          if (content.includes("\\documentclass") || content.includes("\\begin{document}")) {
            rawLatex = content;
          }
        } catch {}
      }
    }

    const formOriginalLatex = form.get("originalLatex") || form.get("template");
    if (!rawLatex && typeof formOriginalLatex === "string" && formOriginalLatex.trim()) {
      rawLatex = formOriginalLatex.trim();
    }

    if (!rawLatex) {
      try {
        const activeResume = await prisma.resume.findFirst({
          where: { userId, isActive: true },
          orderBy: { updatedAt: "desc" },
        });
        if (activeResume && (activeResume.fileName.endsWith(".tex") || activeResume.mimeType.includes("x-latex") || activeResume.mimeType.includes("x-tex"))) {
          const buf = await getStorageProvider().readFile(activeResume.filePath);
          const content = buf.toString("utf-8");
          if (content.includes("\\documentclass") || content.includes("\\begin{document}")) {
            rawLatex = content;
          }
        }
      } catch {}
    }
    if (!isReadableResumeText(resumeText) || resumeText.length > 60000) throw new Error("Provide readable resume text between 50 and 60,000 characters.");
    let jobText = String(form.get("jobText") || "").replace(/\r\n/g, "\n").trim();
    const jobImage = form.get("jobImage");
    if (jobImage instanceof File && jobImage.size) {
      if (file instanceof File && file.size + jobImage.size > 4 * 1024 * 1024) throw new Error("Combined files must be under 4 MB. Use smaller images or paste the job text.");
      const parsed = await parseATSFile(jobImage, true); jobText = [jobText, parsed.text].filter(Boolean).join("\n\n");
    }
    if (jobText.length > 30000) throw new Error("Job description must be under 30,000 characters.");
    if (form.get("action") === "parse") return NextResponse.json({ success: true, resumeText, jobText, method, rawLatex });
    const analysis = await analyzeResume(resumeText, jobText);
    return NextResponse.json({ success: true, resumeText, jobText, method, analysis, rawLatex });
  } catch (error) {
    console.error("ATS review failed:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "ATS analysis failed. Please retry." }, { status: error instanceof AuthError ? error.statusCode : 400 });
  } finally { if (activeUser) pending.delete(activeUser); }
}
