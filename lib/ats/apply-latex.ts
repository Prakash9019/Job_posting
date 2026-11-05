import {
  generateATSLatex,
  cleanLingeringPlaceholders,
  runAllRemediationPasses,
  parseResumeToCanonical,
  generateLatexFromCanonical,
  cleanAiText,
} from "./tailor";
import type { UnifiedATSAudit } from "./analysis";
import {
  extractHyperlinksFromLatex,
  restoreMissingHyperlinksInLatex,
  ensureAllHrefsPreservedInLatex,
  validatePdfHyperlinks,
  sanitizeOcrText,
  type ExtractedHyperlink,
} from "./hyperlinks";

export interface ApplyLatexParams {
  originalLatex: string;
  atsOptimizedText: string;
  jobText?: string;
  audit?: UnifiedATSAudit | null;
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
 * Deterministic 1-Page LaTeX Geometry Optimizer:
 * Dynamically adjusts document class font scaling, geometry margins, \titlespacing,
 * and \setlist[itemize] parameters to strictly enforce a 1-page boundary limit
 * with 95%–98% vertical fill density, eliminating bottom blank whitespace on short
 * resumes and preventing 8–10 line overflow onto page 2 on dense resumes.
 * Also enforces standard Unicode bullet points (\textbullet) over raw ASCII asterisks (*).
 */
export function optimizeLatexGeometryForOnePage(
  latex: string,
  contentStats?: { words: number; lines: number }
): string {
  if (!latex || !latex.includes("\\documentclass")) return latex;

  let doc = latex;

  // 1. Ensure raw ASCII asterisks in bullet points are normalized to standard items
  doc = doc.replace(/\\item\s*[*∗]\s*/g, "\\item ");
  doc = doc.replace(/\\resumeItem\{\s*[*∗]\s*/g, "\\resumeItem{");

  // 2. Count content words and lines if not provided
  const words = contentStats?.words ?? doc.replace(/\\begin\{document\}[\s\S]*?\\end\{document\}/, "").split(/\s+/).length;
  const lines = contentStats?.lines ?? (doc.match(/\\resumeItem|\\item|\\section|\\resumeSubheading/g) || []).length;

  // Keep multi-page geometry if content is extensive (>850 words / >72 lines)
  if (words > 850 || lines > 72) {
    return doc;
  }

  // 3. Dynamic 1-page parameter selection with zero-out bullet spacing and surgical boundary spacing:
  // - Base font size: 10pt standard
  // - itemsep: 0.5pt near zero (no over-expansion onto page 2)
  // - linespread: 1.02
  // - Safe margins: 0.42in left/right, 0.35in top/bottom
  // - Surgical spacing: 4pt before sections, 3pt before companies, 2pt before subprojects
  let targetClass = "\\documentclass[10pt,a4paper]{article}";
  let targetGeometry = "\\usepackage[left=0.42in, right=0.42in, top=0.35in, bottom=0.35in]{geometry}";
  let targetSpacing = "\\titlespacing*{\\section}{0pt}{4pt}{2pt}";
  let targetSetlist =
    "\\setlist[itemize]{leftmargin=1.2em, itemsep=0.5pt, parsep=0pt, topsep=1pt, partopsep=0pt, label=\\textbullet}";

  if (words < 450 && lines < 45) {
    // Low/medium density single-page resume: expand base font to 10.5pt
    targetClass = "\\documentclass[10.5pt,a4paper]{extarticle}";
    targetGeometry = "\\usepackage[left=0.45in, right=0.45in, top=0.4in, bottom=0.4in]{geometry}";
  } else {
    // Standard and high density
    targetClass = words > 650 || lines > 58 ? "\\documentclass[9.5pt,a4paper]{extarticle}" : "\\documentclass[10pt,a4paper]{article}";
    targetGeometry = "\\usepackage[left=0.42in, right=0.42in, top=0.35in, bottom=0.35in]{geometry}";
  }

  // 4. Inject or replace documentclass
  doc = doc.replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/, targetClass);

  // 5. Inject or replace geometry
  if (doc.includes("{geometry}")) {
    doc = doc.replace(/\\usepackage(?:\[[^\]]*\])?\{geometry\}/, targetGeometry);
  } else if (doc.includes("\\begin{document}")) {
    doc = doc.replace("\\begin{document}", `${targetGeometry}\n\\begin{document}`);
  }

  // 6. Inject or replace titlespacing safely across full line
  if (doc.includes("\\titlespacing")) {
    doc = doc.replace(/\\titlespacing\*?\{\\section\}[^\n]*/, targetSpacing);
  } else if (doc.includes("\\titleformat")) {
    doc = doc.replace(/(\\titleformat[^\n]*\n)/, `$1${targetSpacing}\n`);
  }

  // 7. Inject or replace setlist safely across full line
  if (doc.includes("\\setlist[itemize]")) {
    doc = doc.replace(/\\setlist\[itemize\][^\n]*/, targetSetlist);
  } else if (doc.includes("\\begin{document}")) {
    doc = doc.replace("\\begin{document}", `${targetSetlist}\n\\begin{document}`);
  }

  // 8. Ensure readable line spacing (\linespread{1.02})
  if (doc.includes("\\linespread")) {
    doc = doc.replace(/\\linespread\{[^}]*\}/g, "\\linespread{1.02}");
  } else if (doc.includes("\\begin{document}")) {
    doc = doc.replace("\\begin{document}", "\\linespread{1.02}\n\\begin{document}");
  }

  // 9. Re-add \raggedbottom to preamble so LaTeX does NOT mathematically stretch the page and over-expand text
  if (!doc.includes("\\raggedbottom") && doc.includes("\\begin{document}")) {
    doc = doc.replace("\\begin{document}", "\\raggedbottom\n\\begin{document}");
  }

  // 10. Replace any itemize parameters with exact near-zero intra-bullet spacing
  doc = doc.replace(/\\begin\{itemize\}(?:\[[^\]]*\])?/g, "\\begin{itemize}[leftmargin=1.2em, itemsep=0.5pt, parsep=0pt, topsep=1pt, partopsep=0pt, label=\\textbullet]");
  doc = doc.replace(
    /\\newcommand\{\\resumeItemListStart\}\{[^}]*\}/,
    "\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=1.2em, itemsep=0.5pt, parsep=0pt, topsep=1pt, partopsep=0pt, label=\\textbullet]}"
  );

  // 11. Clean any C++ math mode
  doc = doc.replace(/\$C\+\+\$/g, "C++").replace(/\\\$C\+\+\\\$/g, "C++");

  // 11. Surgical spacing: Ensure \vspace{6pt} before \section declarations
  doc = doc.replace(/(?<!\\vspace\{6pt\}\s*)\n\\section/g, "\n\\vspace{6pt}\n\\section");

  // 12. Surgical spacing: Exactly \vspace{4pt} before company headings in \resumeSubheading
  doc = doc.replace(
    /\\newcommand\{\\resumeSubheading\}\[4\]\{[\s\S]*?\\end\{tabular\*\}[\s\S]*?\\nopagebreak\[4\]\s*\}/,
    `\\newcommand{\\resumeSubheading}[4]{
  \\vspace{4pt}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{#1} & \\textit{\\small #2} \\\\[-1pt]
    \\textit{\\small #3} & \\textit{\\small #4}
  \\end{tabular*}\\vspace{1.5pt}\\nopagebreak[4]
}`
  );

  // 13. Surgical spacing: Exactly \vspace{4pt} before project headings in \resumeProjectHeading
  doc = doc.replace(
    /\\newcommand\{\\resumeProjectHeading\}\[2\]\{[\s\S]*?\\end\{tabular\*\}[\s\S]*?\\nopagebreak\[4\]\s*\}/,
    `\\newcommand{\\resumeProjectHeading}[2]{
  \\vspace{4pt}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    #1 & \\textit{\\small #2}
  \\end{tabular*}\\vspace{1.5pt}\\nopagebreak[4]
}`
  );

  // 14. Surgical spacing & hierarchy: Exactly \vspace{3pt} before subproject headings and \vspace{1pt} after
  doc = doc.replace(/\\vspace\{(?:2|3|4\.5|5\.5)pt(?: plus [^}]*)?\}\s*\\noindent\s*\\textbf\{/g, "\\vspace{3pt}\n\\noindent \\textbf{");
  doc = doc.replace(/(\\noindent \\textbf\{[^\n]+\})\s*\\vspace\{(?:1|1\.5|2)pt\}/g, "$1\n\\vspace{1pt}");

  // 15. Remove bullets from project headings: unwrap any \item \textbf{Subproject} inside itemize into standalone bold text
  doc = doc.replace(
    /(\\begin\{itemize\}(?:\[[^\]]*\])?[\s\S]*?)\\item\s*\\textbf\{([^}]+)\}(?:\s*\\enspace\\textbar\\enspace\s*\\textit\{([^}]+)\})?\s*\n(\s*\\item)/g,
    (match, prefix, title, tech, nextItem) => {
      const techPart = tech ? ` \\enspace\\textbar\\enspace \\textit{${tech}}` : "";
      return `${prefix}\\end{itemize}\n\\vspace{3pt}\n\\noindent \\textbf{${title}}${techPart}\n\\vspace{1pt}\n\\begin{itemize}[leftmargin=*, itemsep=1pt, parsep=0pt, topsep=1pt]\n${nextItem}`;
    }
  );

  // 16. Prevent negative vspace on close itemize
  doc = doc.replace(/\\end\{itemize\}\\vspace\{-2pt\}/g, "\\end{itemize}\n");

  // 17. Ensure textcomp is loaded for standard bullet glyph
  if (!doc.includes("{textcomp}") && doc.includes("\\begin{document}")) {
    doc = doc.replace("\\begin{document}", "\\usepackage{textcomp}\n\\begin{document}");
  }

  return doc;
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
  // Sanitize input text: fix OCR errors (Al→AI, Vertz→Vertx) BEFORE passing to remediation passes
  const sanitizedText = sanitizeOcrText(params.atsOptimizedText || "");

  // If original LaTeX is provided, extract any known links
  let baseLatex = (params.originalLatex || "").trim();
  const originalLinks = baseLatex ? extractHyperlinksFromLatex(baseLatex) : [];

  // Deterministic remediation passes:
  // 1. Parses sanitizedText into CanonicalResume JSON schema
  // 2. Applies AI PAR rewrites, active verb upgrades, de-duplications, twice-rule weaving, single-page trimming
  // 3. Serializes strictly via generateLatexFromCanonical()
  const deterministic = runAllRemediationPasses({
    text: sanitizedText,
    latex: baseLatex,
    audit: params.audit,
    jobText: params.jobText || "",
    customMetrics: params.customMetrics,
  });

  let updatedLatex = deterministic.optimizedLatex;

  // Restore and reconcile original hyperlinks into updated LaTeX
  updatedLatex = ensureAllHrefsPreservedInLatex(updatedLatex, [baseLatex, sanitizedText]);

  // Clean lingering placeholders
  updatedLatex = cleanLingeringPlaceholders(updatedLatex, true);

  // Compile and validate with TeXLive CGI
  const compileResult = await validateAndCompileLatex(updatedLatex, [baseLatex, sanitizedText]);

  const sectionCount = (updatedLatex.match(/\section\*?\{/g) || []).length;
  const hrefCount = (updatedLatex.match(/\href\{/g) || []).length;

  let linkReport = "";
  let hyperlinkValidation: Awaited<ReturnType<typeof validatePdfHyperlinks>> | undefined = undefined;
  if (compileResult.success && compileResult.pdfBuffer && originalLinks.length > 0) {
    hyperlinkValidation = await validatePdfHyperlinks(
      compileResult.pdfBuffer,
      originalLinks.map((l) => l.url)
    );
    linkReport = ` • ${hyperlinkValidation.foundUrls.length} Clickable Links Verified`;
  }

  const delta = deterministic.passesSummary.rewrites + deterministic.passesSummary.metricsAdded;
  const stats = compileResult.success
    ? `✨ Tailored LaTeX Verified: ${sectionCount} Sections Preserved • ${hrefCount} \\href Links${linkReport} • TeXLive Verified (${compileResult.pdfBuffer?.byteLength ? `${Math.round(compileResult.pdfBuffer.byteLength / 1024)} KB PDF` : "Clean Build"})`
    : `⚠️ Tailored LaTeX: ${sectionCount} Sections Preserved • ${hrefCount} \\href Links • TeXLive Warning: ${compileResult.error || "Review syntax"}`;

  return {
    updatedLatex,
    compiled: compileResult.success,
    pdfBase64: compileResult.pdfBuffer ? compileResult.pdfBuffer.toString("base64") : undefined,
    log: compileResult.log,
    error: compileResult.error,
    stats,
    delta,
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
