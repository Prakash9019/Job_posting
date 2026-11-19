import "@/lib/ats/pdf-polyfill";
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

    // Compute updated score and re-verify Twice Rule strictly against the final resume
    let newScore: number | undefined;
    let updatedAudit = audit;
    if (jobText) {
      const reqs = extractRequirementsFromJobText(jobText);
      let finalText = atsOptimizedText;
      if (result.compiled && result.pdfBase64) {
        try {
          const { PDFParse } = await import("pdf-parse");
          const buf = Buffer.from(result.pdfBase64, "base64");
          const parser = new PDFParse({ data: buf });
          const parsed = await parser.getText();
          await parser.destroy().catch(() => {});
          if (parsed.text && parsed.text.length >= 100) {
            finalText = parsed.text;
          }
        } catch {}
      }
      const scoring = scoreResume(finalText, reqs, jobText);
      newScore = scoring.score;

      const hardSkillsMatched = scoring.matches
        .filter((m) => m.evidence.length > 0)
        .map((m) => m.keyword);
      const twiceRuleSatisfied = scoring.matches
        .filter((m) => m.placement === "Skills + experience")
        .map((m) => m.keyword);
      const twiceRuleMissingExp = scoring.matches
        .filter((m) => m.placement === "Skills only")
        .map((m) => m.keyword);
      const hardSkillsMissing = scoring.matches
        .filter((m) => m.evidence.length === 0)
        .map((m) => ({
          keyword: m.keyword,
          importance: m.importance === "required" ? ("REQUIRED" as const) : ("PREFERRED" as const),
        }));

      if (audit) {
        updatedAudit = {
          ...audit,
          score: scoring.score,
          overall_ats_score: scoring.score,
          scoring_breakdown: {
            ...(audit.scoring_breakdown || {}),
            jd_keyword_match_score: scoring.matchScore,
          },
          jd_skills_alignment: {
            hard_skills_matched: hardSkillsMatched,
            twice_rule_satisfied_skills: twiceRuleSatisfied,
            twice_rule_missing_experience_mention: twiceRuleMissingExp,
            hard_skills_missing: hardSkillsMissing,
          },
        };
      }
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
      audit: updatedAudit,
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
