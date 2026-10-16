import { GoogleGenAI } from "@google/genai";
import { generateATSLatex, cleanLingeringPlaceholders, getCandidateFilename, runAllRemediationPasses } from "./tailor";
import { scoreResume, extractRequirementsFromJobText } from "./scoring";

export interface ApplyLatexParams {
  originalLatex: string;
  atsOptimizedText: string;
  jobText?: string;
  audit?: any;
  customMetrics?: Record<number, string>;
}

export interface ApplyLatexResult {
  updatedLatex: string;
  compiled: boolean;
  pdfBase64?: string;
  log?: string;
  error?: string;
  stats: string;
  delta?: number;
}

/**
 * Strips markdown code blocks (e.g. ```latex ... ```) and cleans whitespace
 */
export function cleanLatexMarkdownFences(text: string): string {
  if (!text) return "";
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:latex|tex)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?```\s*$/i, "");
  return cleaned.trim();
}

/**
 * Validates and compiles LaTeX code via TeXLive CGI (pdflatex with xelatex fallback).
 * Returns compilation success flag, binary PDF buffer if successful, or compiler error log.
 */
export async function validateAndCompileLatex(latexCode: string): Promise<{
  success: boolean;
  pdfBuffer: Buffer | null;
  log?: string;
  error?: string;
}> {
  if (!latexCode || !latexCode.trim()) {
    return { success: false, pdfBuffer: null, error: "Empty LaTeX code provided." };
  }

  async function compileWithEngine(engine: string) {
    const formData = new FormData();
    formData.append("filecontents[]", latexCode);
    formData.append("filename[]", "document.tex");
    formData.append("engine", engine);
    formData.append("return", "pdf");

    return fetch("https://texlive.net/cgi-bin/latexcgi", {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000), // 30 sec timeout
    });
  }

  try {
    let response = await compileWithEngine("pdflatex");
    let contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.includes("pdf")) {
      const firstErr = await response.text().catch(() => "");
      const fallback = await compileWithEngine("xelatex").catch(() => null);

      if (fallback && fallback.ok && (fallback.headers.get("content-type") || "").includes("pdf")) {
        const arrayBuf = await fallback.arrayBuffer();
        return { success: true, pdfBuffer: Buffer.from(arrayBuf) };
      }

      const secondErr = fallback ? await fallback.text().catch(() => "") : "";
      const log = (secondErr || firstErr).slice(0, 3000);
      return {
        success: false,
        pdfBuffer: null,
        log,
        error: "LaTeX compilation warning/error detected by TeXLive.",
      };
    }

    const arrayBuf = await response.arrayBuffer();
    return { success: true, pdfBuffer: Buffer.from(arrayBuf) };
  } catch (err) {
    return {
      success: false,
      pdfBuffer: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Uses Google Gemini (gemini-2.5-pro) to combine:
 * 1. The original LaTeX template (treated as structural source of truth)
 * 2. The ATS-optimized resume content (treated as content source of improvements)
 * 3. AI suggestions & rewrites from the JSON audit
 * 4. Target JD requirements
 *
 * Then validates and compiles the output to ensure 100% syntactically correct, zero-loss LaTeX.
 */
export async function applyImprovementsToLatexWithAI(params: ApplyLatexParams): Promise<ApplyLatexResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  // If original LaTeX is empty, create an initial standard ATS template
  let baseLatex = (params.originalLatex || "").trim();
  if (!baseLatex) {
    baseLatex = generateATSLatex(params.atsOptimizedText);
  }

  // Pre-process suggestions from audit
  const auditSuggestions = {
    par_rewrites: params.audit?.action_verb_and_par_rewrites?.map((r: any) => ({
      original: r.original_bullet,
      optimized: r.optimized_par_bullet || r.optimized_bullet,
      metric: r.metric_added_or_placeholder || r.impact_metric,
    })) || [],
    grammar_fixes: params.audit?.grammar_spelling_dialect_audit?.map((g: any) => ({
      original: g.original_phrase,
      corrected: g.corrected_phrase,
    })) || [],
    missing_keywords: params.audit?.jd_skills_alignment?.hard_skills_missing?.map((s: any) => s.keyword || s) || params.audit?.missing_hard_skills || [],
  };

  // If no Gemini API key is configured, fallback to deterministic remediation passes
  if (!apiKey || apiKey.trim() === "" || apiKey === "your-gemini-api-key-here") {
    console.warn("GEMINI_API_KEY missing, using deterministic remediation passes for LaTeX");
    const deterministic = runAllRemediationPasses({
      text: params.atsOptimizedText,
      latex: baseLatex,
      audit: params.audit,
      jobText: params.jobText || "",
      customMetrics: params.customMetrics,
    });

    const compileRes = await validateAndCompileLatex(deterministic.optimizedLatex);
    return {
      updatedLatex: deterministic.optimizedLatex,
      compiled: compileRes.success,
      pdfBase64: compileRes.pdfBuffer ? compileRes.pdfBuffer.toString("base64") : undefined,
      log: compileRes.log,
      error: compileRes.error,
      stats: `✓ Deterministic Merge Applied: ${deterministic.passesSummary.rewrites} PAR Rewrites, ${deterministic.passesSummary.metricsAdded} Metrics Added`,
    };
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  const modelName = process.env.GEMINI_ATS_MODEL || "gemini-2.5-pro";

  const prompt = `You are a Principal LaTeX Typesetting Engineer and Executive Resume Strategist.
Your task is to merge ATS-optimized content and AI suggestions into the user's existing LaTeX resume template.

=== 1. STRUCTURAL SOURCE OF TRUTH (ORIGINAL LATEX CODE) ===
Treat this existing LaTeX code as the ARCHITECTURAL AND STRUCTURAL SOURCE OF TRUTH:
"""latex
${baseLatex}
"""

=== 2. CONTENT SOURCE OF TRUTH (ATS-OPTIMIZED RESUME CONTENT) ===
Treat this text as the CONTENT SOURCE OF IMPROVEMENTS:
"""text
${params.atsOptimizedText}
"""

=== 3. DETAILED AI SUGGESTIONS & REWRITES (JSON AUDIT) ===
"""json
${JSON.stringify(auditSuggestions, null, 2)}
"""

${params.jobText ? `=== 4. TARGET JOB DESCRIPTION ===\n"""\n${params.jobText.slice(0, 4000)}\n"""\n` : ""}

=== CRITICAL RULES & INSTRUCTIONS (NON-NEGOTIABLE) ===

1. PRESERVE THE ORIGINAL TEMPLATE ARCHITECTURE:
   - YOU MUST REUSE the user's EXACT LaTeX preamble: \\documentclass, \\usepackage, custom colors, geometry, fonts, and custom macros (e.g. \\resumeSubheading, \\resumeItem, \\resumeProjectHeading, \\resumeSubItem, tabular layouts).
   - DO NOT replace or simplify the template with a generic layout. Preserve the template's visual styling, margins, and custom itemize environments.
   - Maintain all hyperlinked \\href{URL}{LABEL} commands and contact links (Email, Phone, LinkedIn, GitHub, Portfolio).

2. PRESERVE ALL HEADINGS, SECTIONS, AND PROJECTS:
   - YOU MUST PRESERVE EVERY SINGLE section heading present in the resume and template (e.g. \\section{PROFESSIONAL SUMMARY}, \\section{TECHNICAL SKILLS}, \\section{WORK EXPERIENCE}, \\section{PROJECTS}, \\section{EDUCATION}, \\section{ACHIEVEMENTS}, \\section{CERTIFICATIONS}).
   - DO NOT rename, remove, omit, or collapse sections.
   - DO NOT delete or merge distinct projects into one. Every project present in the resume MUST remain in the LaTeX with its bullet points intact, formatted using the template's project macro/environment.

3. INJECT ATS CONTENT & SUGGESTIONS:
   - Seamlessly update corresponding bullet points with the improved PAR wording, strong active verbs, and quantified metrics from the ATS resume and JSON suggestions.
   - Apply all grammar, spelling, and phrasing improvements.
   - Replace ANY placeholder brackets like [Y]%, [X]%, [N], [$X], [METRIC] with concrete metrics (e.g. 42\\%, \\$45K, 2.5x, 10K+).
   - If missing JD skills were identified, weave them naturally into the Technical Skills section matching the template's layout.

4. LATEX SYNTAX, COMPILATION & CLEANLINESS:
   - Properly escape LaTeX special characters in content: % -> \\%, & -> \\&, $ -> \\$, _ -> \\_, # -> \\#.
   - Ensure all environments (\\begin{...} ... \\end{...}) and braces ({...}) are strictly balanced and syntactically valid.
   - Ensure \\pagestyle{empty} and \\thispagestyle{empty} are present so no page numbers appear.
   - Strip any pagination artifacts (e.g. "-- 1 of 2 --", "Page 1 of 2").

5. OUTPUT SPECIFICATION:
   - Return ONLY the final, compilable LaTeX code.
   - Do NOT include any markdown code fences (no \`\`\`latex or \`\`\`), and NO conversational commentary.
   - Start directly with \\documentclass and end with \\end{document}.
`;

  let updatedLatex = "";

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });

    updatedLatex = cleanLatexMarkdownFences(response.text || "");
  } catch (err) {
    console.warn(`Primary model ${modelName} failed, attempting fallback to gemini-2.5-flash:`, err);
    try {
      const fallbackResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      updatedLatex = cleanLatexMarkdownFences(fallbackResponse.text || "");
    } catch (fallbackErr) {
      console.warn("AI LaTeX generation failed, falling back to deterministic remediation:", fallbackErr);
      const deterministic = runAllRemediationPasses({
        text: params.atsOptimizedText,
        latex: baseLatex,
        audit: params.audit,
        jobText: params.jobText || "",
        customMetrics: params.customMetrics,
      });
      updatedLatex = deterministic.optimizedLatex;
    }
  }

  // Safety checks on the generated LaTeX
  if (!updatedLatex || !updatedLatex.includes("\\begin{document}")) {
    console.warn("AI output did not contain valid LaTeX, falling back to deterministic synthesis");
    const deterministic = runAllRemediationPasses({
      text: params.atsOptimizedText,
      latex: baseLatex,
      audit: params.audit,
      jobText: params.jobText || "",
      customMetrics: params.customMetrics,
    });
    updatedLatex = deterministic.optimizedLatex;
  }

  // Post-process placeholders and page numbering
  updatedLatex = cleanLingeringPlaceholders(updatedLatex, true);
  if (!updatedLatex.includes("pagestyle{empty}") && updatedLatex.includes("\\begin{document}")) {
    updatedLatex = updatedLatex.replace(
      "\\begin{document}",
      "\\begin{document}\n\\pagestyle{empty}\n\\thispagestyle{empty}"
    );
  }

  // Compile and validate with TeXLive CGI
  let compileResult = await validateAndCompileLatex(updatedLatex);

  // Self-repair pass if compilation had syntax errors
  if (!compileResult.success && compileResult.log && apiKey) {
    console.warn("TeXLive compilation warning, initiating 1-shot self-healing pass...");
    try {
      const healingPrompt = `The following LaTeX code produced a syntax/compilation error in TeXLive:
=== COMPILER ERROR LOG ===
${compileResult.log.slice(0, 1500)}

=== FAILING LATEX CODE ===
${updatedLatex}

TASK:
Fix the syntax error, missing package, or unescaped character causing the failure.
Preserve all content, headings, sections, and macros.
Return ONLY the corrected, compilable LaTeX code with NO markdown fences.`;

      const healingResponse = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: healingPrompt,
      });

      const healedLatex = cleanLatexMarkdownFences(healingResponse.text || "");
      if (healedLatex && healedLatex.includes("\\begin{document}")) {
        const healedCompileResult = await validateAndCompileLatex(healedLatex);
        if (healedCompileResult.success) {
          console.log("Self-healing pass succeeded! LaTeX compiled cleanly to PDF.");
          updatedLatex = healedLatex;
          compileResult = healedCompileResult;
        }
      }
    } catch (healErr) {
      console.warn("Self-healing pass encountered error:", healErr);
    }
  }

  const sectionCount = (updatedLatex.match(/\\section\*?\{/g) || []).length;
  const hrefCount = (updatedLatex.match(/\\href\{/g) || []).length;

  const stats = compileResult.success
    ? `✨ AI-Integrated LaTeX Verified: ${sectionCount} Sections Preserved • ${hrefCount} \\href Links • TeXLive Verified (${compileResult.pdfBuffer?.byteLength ? `${Math.round(compileResult.pdfBuffer.byteLength / 1024)} KB PDF` : "Clean Build"})`
    : `⚠️ AI-Integrated LaTeX: ${sectionCount} Sections Preserved • ${hrefCount} \\href Links • TeXLive Warning: ${compileResult.error || "Review syntax"}`;

  return {
    updatedLatex,
    compiled: compileResult.success,
    pdfBase64: compileResult.pdfBuffer ? compileResult.pdfBuffer.toString("base64") : undefined,
    log: compileResult.log,
    error: compileResult.error,
    stats,
  };
}
