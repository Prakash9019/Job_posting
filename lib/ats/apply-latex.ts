import { GoogleGenAI } from "@google/genai";
import { generateATSLatex, cleanLingeringPlaceholders, getCandidateFilename, runAllRemediationPasses } from "./tailor";
import { scoreResume, extractRequirementsFromJobText } from "./scoring";
import {
  extractHyperlinksFromLatex,
  restoreMissingHyperlinksInLatex,
  ensureAllHrefsPreservedInLatex,
  validatePdfHyperlinks,
  type ExtractedHyperlink,
} from "./hyperlinks";

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
  hyperlinks?: {
    valid: boolean;
    foundCount: number;
    expectedCount: number;
    report: string;
  };
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
export async function validateAndCompileLatex(
  latexCode: string,
  linkSource?: string | string[] | ExtractedHyperlink[] | (string | ExtractedHyperlink[])[]
): Promise<{
  success: boolean;
  pdfBuffer: Buffer | null;
  log?: string;
  error?: string;
}> {
  if (!latexCode || !latexCode.trim()) {
    return { success: false, pdfBuffer: null, error: "Empty LaTeX code provided." };
  }

  // Ensure 100% of hyperlinks are preserved as clickable \href commands before compiling
  let additionalSources: (string | ExtractedHyperlink[])[] = [];
  if (linkSource) {
    if (Array.isArray(linkSource)) {
      if (linkSource.length > 0 && typeof linkSource[0] === "object" && linkSource[0] !== null && "url" in linkSource[0]) {
        additionalSources = [linkSource as ExtractedHyperlink[]];
      } else {
        additionalSources = linkSource as (string | ExtractedHyperlink[])[];
      }
    } else {
      additionalSources = [linkSource];
    }
  }
  let safeLatex = ensureAllHrefsPreservedInLatex(latexCode, additionalSources);
  // Ensure pdfgentounicode doesn't crash non-pdflatex engines like XeTeX
  safeLatex = safeLatex.replace(/\\pdfgentounicode\s*=\s*1/g, "\\ifdefined\\pdfgentounicode \\pdfgentounicode=1 \\fi");

  async function compileWithEngine(engine: string) {
    const formData = new FormData();
    formData.append("filecontents[]", safeLatex);
    formData.append("filename[]", "document.tex");
    formData.append("engine", engine);
    formData.append("return", "pdf");

    return fetch("https://texlive.net/cgi-bin/latexcgi", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: formData,
      signal: AbortSignal.timeout(25000), // 25 sec timeout for reliable external TeXLive compilation
    });
  }

  try {
    const response = await compileWithEngine("pdflatex");
    const contentType = response.headers.get("content-type") || "";

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

  const originalLinks = extractHyperlinksFromLatex(baseLatex);

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
    let linkReport = "";
    let hyperlinkValidation: any = undefined;
    if (compileRes.success && compileRes.pdfBuffer && originalLinks.length > 0) {
      hyperlinkValidation = await validatePdfHyperlinks(
        compileRes.pdfBuffer,
        originalLinks.map((l) => l.url)
      );
      linkReport = ` • ${hyperlinkValidation.foundUrls.length} Clickable Links Verified`;
    }

    return {
      updatedLatex: deterministic.optimizedLatex,
      compiled: compileRes.success,
      pdfBase64: compileRes.pdfBuffer ? compileRes.pdfBuffer.toString("base64") : undefined,
      log: compileRes.log,
      error: compileRes.error,
      stats: `✓ Deterministic Merge Applied: ${deterministic.passesSummary.rewrites} PAR Rewrites, ${deterministic.passesSummary.metricsAdded} Metrics Added${linkReport}`,
      hyperlinks: hyperlinkValidation
        ? {
            valid: hyperlinkValidation.valid,
            foundCount: hyperlinkValidation.foundUrls.length,
            expectedCount: originalLinks.length,
            report: hyperlinkValidation.report,
          }
        : undefined,
    };
  }

  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  const modelName = process.env.GEMINI_ATS_MODEL || "gemini-2.5-flash";

  const prompt = `You are a Principal LaTeX Typesetting Engineer and Executive Resume Strategist operating as a senior recruiter in the candidate's target industry.
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

1. PRESERVE ALL ORIGINAL HYPERLINKS & MACROS:
   - YOU MUST PRESERVE EVERY valid \\href{URL}{LABEL} and \\url{URL} from the original LaTeX template.
   - Do NOT replace linked text with plain text. GitHub, LinkedIn, email addresses (mailto:), portfolio, and project links (Code, Live Demo) MUST remain clickable \\href{URL}{label}.
   - If project details change or new bullets are added, retain original URLs and update only the visible text.
   - Ensure \\usepackage[hidelinks]{hyperref} or \\usepackage{hyperref} is loaded in the preamble.
   - YOU MUST REUSE the user's EXACT LaTeX preamble: \\documentclass, \\usepackage, custom colors, geometry, fonts, and custom macros (e.g. \\resumeSubheading, \\resumeItem, \\resumeProjectHeading, \\resumeSubItem, tabular layouts).
   - DO NOT replace or simplify the template with a generic layout. Preserve the template's visual styling, margins, and custom itemize environments.

2. PRESERVE ALL HEADINGS, SECTIONS, AND PROJECTS:
   - YOU MUST PRESERVE EVERY SINGLE section heading present in the resume and template (e.g. \\section{PROFESSIONAL SUMMARY}, \\section{TECHNICAL SKILLS}, \\section{WORK EXPERIENCE}, \\section{PROJECTS}, \\section{EDUCATION}, \\section{ACHIEVEMENTS}, \\section{CERTIFICATIONS}).
   - DO NOT rename, remove, omit, or collapse sections.
   - DO NOT delete or merge distinct projects into one. Every project present in the resume MUST remain in the LaTeX with its bullet points intact, formatted using the template's project macro/environment.

3. INJECT ATS CONTENT & SUGGESTIONS (STRICT SOURCE-GROUNDING & JD MIRRORING):
   - Seamlessly update corresponding bullet points with improved PAR phrasing, strong action verbs, and concise technical achievements from the ATS resume and JSON suggestions to pass ATS filters.
   - When a target Job Description is provided, mirror the language, technical vocabulary, and keywords in the job description without lying or inventing experience.
   - Apply all grammar, spelling, and phrasing improvements.
   - STRICT SOURCE GROUNDING (MANDATORY POLICY):
     * The AI does not invent experience; it highlights the impact the candidate has already made.
     * NEVER invent employers, job titles, dates, technologies, frameworks, certifications, or metrics.
     * Treat the candidate's original resume as the source of truth. Retain numerical achievements ONLY when supported by the original resume or verified user inputs.
     * NEVER fabricate arbitrary percentages, latencies, or dollar amounts.
     * If a bullet contains placeholder brackets like [X]%, [Y]%, [N], [$X], or [METRIC] and no verified number is provided in the input, cleanly remove the bracket placeholder and rephrase smoothly without inventing numbers or percentages.
     * DO NOT weave missing JD skills into the Technical Skills section or experience bullets. Missing JD skills from the audit are diagnostic recommendations for the candidate, NEVER claimed candidate skills.
     * DO NOT add generic filler phrases such as "leveraging Java for scalable execution" or arbitrary impact clauses.
     * Keep project-specific technology associations intact; do not assume a technology used in one project was used in another.

4. TEXT WRAPPING & NO MID-SENTENCE BREAKS:
   - DO NOT insert manual line breaks (\\\\ or \\newline) in the middle of sentences or bullet points.
   - Preserve each bullet point as one logical paragraph (\\resumeItem{...} or \\item ...) and let LaTeX wrap text naturally.
   - Keep continuation lines aligned with the bullet text without artificial line splits or malformed hyphenation.
   - NEVER output math mode pipes such as $|$ or \\$|\\$. Always use \\enspace\\textbar\\enspace or the template's divider macro.

5. ADAPTIVE PAGINATION & READABLE TYPOGRAPHY:
   - Do NOT force every resume onto a single page. Implement adaptive pagination based on the candidate's actual content.
   - If the candidate's content naturally fits on 1 page without shrinking fonts or clipping content, use a clean 1-page layout.
   - If the candidate has extensive experience/projects (e.g. 2 pages), format cleanly across 2 pages with standard typography (10pt), balanced section breaks, and comfortable margins (0.4in to 0.5in).
   - NEVER drop, delete, or truncate projects or bullets just to meet a 1-page target.
   - Prevent orphan headings (always keep headings attached to their initial content) and do not break subproject headers away from their bullet points.

6. LATEX SYNTAX, COMPILATION & CLEANLINESS:
   - Properly escape LaTeX special characters in content: % -> \\%, & -> \\&, $ -> \\$, _ -> \\_, # -> \\#.
   - Ensure all environments (\\begin{...} ... \\end{...}) and braces ({...}) are strictly balanced and syntactically valid.
   - Ensure \\pagestyle{empty} and \\thispagestyle{empty} are present so no page numbers appear.
   - Strip any pagination artifacts (e.g. "-- 1 of 2 --", "Page 1 of 2").

7. OUTPUT SPECIFICATION:
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
  updatedLatex = updatedLatex.replace(/(?:\\\$[ \t]*[|][ \t]*\\\$|\\\$[ \t]*\\\|[ \t]*\\\$|\$[ \t]*\|[ \t]*\$)/g, "\\enspace\\textbar\\enspace");
  updatedLatex = updatedLatex.replace(/\\\\+(\s*\\(?:end\{itemize\}|end\{tabular\*?\}|section))/g, "$1");
  if (!updatedLatex.includes("pagestyle{empty}") && updatedLatex.includes("\\begin{document}")) {
    updatedLatex = updatedLatex.replace(
      "\\begin{document}",
      "\\begin{document}\n\\pagestyle{empty}\n\\thispagestyle{empty}"
    );
  }

  // Restore and reconcile original hyperlinks into updated LaTeX
  updatedLatex = ensureAllHrefsPreservedInLatex(updatedLatex, [baseLatex, params.atsOptimizedText]);

  // Compile and validate with TeXLive CGI
  let compileResult = await validateAndCompileLatex(updatedLatex, [baseLatex, params.atsOptimizedText]);

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
Preserve all content, headings, sections, macros, and \\href hyperlinks.
Return ONLY the corrected, compilable LaTeX code with NO markdown fences.`;

      const healingResponse = await ai.models.generateContent({
        model: modelName,
        contents: healingPrompt,
      });

      let healedLatex = cleanLatexMarkdownFences(healingResponse.text || "");
      if (healedLatex && healedLatex.includes("\\begin{document}")) {
        healedLatex = restoreMissingHyperlinksInLatex(healedLatex, baseLatex);
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

  let linkReport = "";
  let hyperlinkValidation: any = undefined;
  if (compileResult.success && compileResult.pdfBuffer && originalLinks.length > 0) {
    hyperlinkValidation = await validatePdfHyperlinks(
      compileResult.pdfBuffer,
      originalLinks.map((l) => l.url)
    );
    linkReport = ` • ${hyperlinkValidation.foundUrls.length} Clickable Links Verified`;
  }

  const stats = compileResult.success
    ? `✨ AI-Integrated LaTeX Verified: ${sectionCount} Sections Preserved • ${hrefCount} \\href Links${linkReport} • TeXLive Verified (${compileResult.pdfBuffer?.byteLength ? `${Math.round(compileResult.pdfBuffer.byteLength / 1024)} KB PDF` : "Clean Build"})`
    : `⚠️ AI-Integrated LaTeX: ${sectionCount} Sections Preserved • ${hrefCount} \\href Links • TeXLive Warning: ${compileResult.error || "Review syntax"}`;

  return {
    updatedLatex,
    compiled: compileResult.success,
    pdfBase64: compileResult.pdfBuffer ? compileResult.pdfBuffer.toString("base64") : undefined,
    log: compileResult.log,
    error: compileResult.error,
    stats,
    hyperlinks: hyperlinkValidation
      ? {
          valid: hyperlinkValidation.valid,
          foundCount: hyperlinkValidation.foundUrls.length,
          expectedCount: originalLinks.length,
          report: hyperlinkValidation.report,
        }
      : undefined,
  };
}
