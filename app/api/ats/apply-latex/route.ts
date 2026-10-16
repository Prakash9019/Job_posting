import { NextRequest, NextResponse } from "next/server";
import { applyImprovementsToLatexWithAI } from "@/lib/ats/apply-latex";
import { scoreResume, extractRequirementsFromJobText } from "@/lib/ats/scoring";

export const maxDuration = 120; // 2 minutes max for AI generation & TeXLive compilation

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { originalLatex, atsOptimizedText, jobText, audit, customMetrics } = body || {};

    if (!atsOptimizedText || typeof atsOptimizedText !== "string" || !atsOptimizedText.trim()) {
      return NextResponse.json(
        { success: false, error: "Missing required atsOptimizedText in request body." },
        { status: 400 }
      );
    }

    const result = await applyImprovementsToLatexWithAI({
      originalLatex: typeof originalLatex === "string" ? originalLatex : "",
      atsOptimizedText,
      jobText: typeof jobText === "string" ? jobText : "",
      audit,
      customMetrics,
    });

    // Compute updated score if jobText is provided
    let newScore: number | undefined;
    if (jobText) {
      const reqs = extractRequirementsFromJobText(jobText);
      const scoring = scoreResume(atsOptimizedText, reqs, jobText);
      newScore = scoring.score;
    }

    return NextResponse.json({
      success: true,
      updatedLatex: result.updatedLatex,
      compiled: result.compiled,
      pdfBase64: result.pdfBase64,
      log: result.log,
      error: result.error,
      stats: result.stats,
      score: newScore,
    });
  } catch (err: unknown) {
    console.error("Apply to LaTeX API error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to apply improvements to LaTeX.",
      },
      { status: 500 }
    );
  }
}
