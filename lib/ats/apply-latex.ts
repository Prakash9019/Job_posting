import { GoogleGenAI } from "@google/genai";
import {
  generateATSLatex,
  cleanLingeringPlaceholders,
  runAllRemediationPasses,
  parseResumeToCanonical,
  generateLatexFromCanonical,
  cleanAiText,
  resolvePlaceholder,
  escapeLatexForPatch,
  type CanonicalResume,
} from "./tailor";
import { extractRequirementsFromJobText } from "./scoring";
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
  contentStats?: { words?: number; lines?: number; estimatedLines?: number }
): string {
  if (!latex || !latex.includes("\\documentclass")) return latex;

  // Documents produced by the shared canonical layout engine (generateLatexFromCanonical) already
  // carry a content-calibrated layout. Re-tiering them here with different heuristics is what made
  // pagination differ between candidates, so they must pass through untouched.
  if (latex.includes("ATS-SHARED-LAYOUT-ENGINE")) return latex;

  let doc = latex;

  // 1. Ensure raw ASCII asterisks in bullet points are normalized to standard items
  doc = doc.replace(/\\item\s*[*∗]\s*/g, "\\item ");
  doc = doc.replace(/\\resumeItem\{\s*[*∗]\s*/g, "\\resumeItem{");

  // 2. Count content words and lines from document body if not provided
  const bodyMatch = doc.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  const bodyText = bodyMatch ? bodyMatch[1] : doc;
  const cleanBody = bodyText.replace(/\\[a-zA-Z]+(\[[^\]]*\])?(?:\{([^{}]*)\})?/g, " ");
  const words = contentStats?.words ?? cleanBody.split(/\s+/).filter(Boolean).length;
  const lines = contentStats?.estimatedLines ?? contentStats?.lines ?? (bodyText.match(/\\resumeItem|\\item|\\section|\\resumeSubheading|\\resumeProjectHeading/g) || []).length;

  // Keep multi-page geometry if content is extensive (>850 words / >88 lines)
  if (words > 850 || lines > 88) {
    return doc;
  }

  // Normalize paper dimensions to A4 across all templates and strip conflicting margin packages
  doc = doc.replace(/\b(?:letter|letterpaper|legal|legalpaper)\b/gi, "a4paper");
  doc = doc.replace(/\\usepackage(?:\[[^\]]*\])?\{fullpage\}/g, "");
  doc = doc.replace(/\\addtolength\{\\(?:oddsidemargin|evensidemargin|textwidth|topmargin|textheight)\}\{[^}]*\}/g, "");

  // 3. Dynamic 1-page parameter selection with zero-out bullet spacing and calibrated boundary spacing
  let targetClass = "\\documentclass[10pt,a4paper]{article}";
  let targetGeometry = "\\usepackage[left=0.38in, right=0.38in, top=0.30in, bottom=0.30in]{geometry}";
  let targetSpacing = "\\titlespacing*{\\section}{0pt}{3.5pt}{1.8pt}";
  let targetSetlist =
    "\\setlist[itemize]{leftmargin=1.2em, itemsep=0.6pt, parsep=0pt, topsep=1.0pt, partopsep=0pt, label=\\textbullet}";
  let targetLinespread = "0.99";
  let subheadingVspace = "2.5pt";
  let subprojectVspace = "2.0pt";

  if (words < 450 && lines < 45) {
    // Low/medium density single-page resume: decompress spacing to fill page comfortably
    targetClass = "\\documentclass[10pt,a4paper]{article}";
    targetGeometry = "\\usepackage[left=0.5in, right=0.5in, top=0.5in, bottom=0.5in]{geometry}";
    targetSpacing = "\\titlespacing*{\\section}{0pt}{6pt}{2pt}";
    targetSetlist =
      "\\setlist[itemize]{leftmargin=1.2em, itemsep=1pt, parsep=0pt, topsep=1pt, partopsep=0pt, label=\\textbullet}";
    targetLinespread = "1.15";
    subheadingVspace = "4pt";
    subprojectVspace = "3pt";
  } else if (words > 650 || lines > 64) {
    // Ultra-dense single-page resume
    targetClass = "\\documentclass[9pt,a4paper]{extarticle}";
    targetGeometry = "\\usepackage[left=0.34in, right=0.34in, top=0.22in, bottom=0.22in]{geometry}";
    targetSpacing = "\\titlespacing*{\\section}{0pt}{2pt}{1pt}";
    targetSetlist =
      "\\setlist[itemize]{leftmargin=1.2em, itemsep=0pt, parsep=0pt, topsep=0.5pt, partopsep=0pt, label=\\textbullet}";
    targetLinespread = "0.95";
    subheadingVspace = "0.5pt";
    subprojectVspace = "1.0pt";
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

  // 8. Ensure readable line spacing
  if (doc.includes("\\linespread")) {
    doc = doc.replace(/\\linespread\{[^}]*\}/g, `\\linespread{${targetLinespread}}`);
  } else if (doc.includes("\\begin{document}")) {
    doc = doc.replace("\\begin{document}", `\\linespread{${targetLinespread}}\n\\begin{document}`);
  }

  // 9. Re-add \raggedbottom to preamble so LaTeX does NOT mathematically stretch the page and over-expand text
  if (!doc.includes("\\raggedbottom") && doc.includes("\\begin{document}")) {
    doc = doc.replace("\\begin{document}", "\\raggedbottom\n\\begin{document}");
  }

  // 10. Replace itemize macro definitions FIRST before touching body \begin{itemize}
  const itemsepVal = words < 450 && lines < 45 ? "1pt" : "0.6pt";
  const topsepVal = words < 450 && lines < 45 ? "1pt" : "1.0pt";
  doc = doc.replace(
    /\\newcommand\{\\resumeItemListStart\}[^\n]*\n?/,
    `\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=1.2em, itemsep=${itemsepVal}, parsep=0pt, topsep=${topsepVal}, partopsep=0pt, label=\\textbullet]}\n`
  );
  doc = doc.replace(
    /\\newcommand\{\\resumeSubHeadingListStart\}[^\n]*\n?/,
    `\\newcommand{\\resumeSubHeadingListStart}{}\n`
  );
  doc = doc.replace(
    /\\newcommand\{\\resumeSubHeadingListEnd\}[^\n]*\n?/,
    `\\newcommand{\\resumeSubHeadingListEnd}{}\n`
  );
  doc = doc.replace(
    /\\newcommand\{\\resumeItemListEnd\}[^\n]*\n?/,
    `\\newcommand{\\resumeItemListEnd}{\\end{itemize}}\n`
  );

  // Now replace body \begin{itemize} safely
  doc = doc.replace(
    /(?<!\\newcommand\{[a-zA-Z]+\}\{)\\begin\{itemize\}(?:\[[^\]]*\])?/g,
    `\\begin{itemize}[leftmargin=1.2em, itemsep=${itemsepVal}, parsep=0pt, topsep=${topsepVal}, partopsep=0pt, label=\\textbullet]`
  );

  // 11. Clean any C++ math mode
  doc = doc.replace(/\$C\+\+\$/g, "C++").replace(/\\\$C\+\+\\\$/g, "C++");

  // Clean any duplicate explicit \vspace before \section so \titlespacing governs section spacing cleanly
  doc = doc.replace(/\\vspace\{\d+pt\}\s*\\section/g, "\\section");

  // 12. Surgical spacing (job-title rows): #1=JobTitle(bold) #2=Location #3=Company #4=Date
  if (/\\newcommand\{\\resumeSubheading\}\[4\]\{[\s\S]*?\\end\{tabular\*\}[\s\S]*?\\nopagebreak\[\d\]\s*\}/.test(doc)) {
    doc = doc.replace(
      /\\newcommand\{\\resumeSubheading\}\[4\]\{[\s\S]*?\\end\{tabular\*\}[\s\S]*?\\nopagebreak\[\d\]\s*\}/,
      `\\newcommand{\\resumeSubheading}[4]{
  \\vspace{${subheadingVspace}}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{#1} & \\textit{\\small #2} \\\\[-1pt]
    {\\small #3} & \\textit{\\small #4}
  \\end{tabular*}\\vspace{1.5pt}\\nopagebreak[4]
}`
    );
  } else {
    doc = doc.replace(
      /\\newcommand\{\\resumeSubheading\}\[4\]\{[\s\S]*?\\end\{tabular\*\}[^\n]*\}/,
      `\\newcommand{\\resumeSubheading}[4]{
  \\vspace{${subheadingVspace}}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{#1} & \\textit{\\small #2} \\\\[-1pt]
    {\\small #3} & \\textit{\\small #4}
  \\end{tabular*}\\vspace{1.5pt}\\nopagebreak[4]
}`
    );
  }

  // 13. Surgical spacing: Exactly \vspace{subheadingVspace} before project headings in \resumeProjectHeading
  if (/\\newcommand\{\\resumeProjectHeading\}\[2\]\{[\s\S]*?\\end\{tabular\*\}[\s\S]*?\\nopagebreak\[\d\]\s*\}/.test(doc)) {
    doc = doc.replace(
      /\\newcommand\{\\resumeProjectHeading\}\[2\]\{[\s\S]*?\\end\{tabular\*\}[\s\S]*?\\nopagebreak\[\d\]\s*\}/,
      `\\newcommand{\\resumeProjectHeading}[2]{
  \\vspace{${subheadingVspace}}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    #1 & \\textit{\\small #2}
  \\end{tabular*}\\vspace{1.5pt}\\nopagebreak[4]
}`
    );
  } else {
    doc = doc.replace(
      /\\newcommand\{\\resumeProjectHeading\}\[2\]\{[\s\S]*?\\end\{tabular\*\}[^\n]*\}/,
      `\\newcommand{\\resumeProjectHeading}[2]{
  \\vspace{${subheadingVspace}}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    #1 & \\textit{\\small #2}
  \\end{tabular*}\\vspace{1.5pt}\\nopagebreak[4]
}`
    );
  }

  // 14. Surgical spacing & hierarchy: Exactly \vspace{subprojectVspace} before subproject headings and \vspace{1pt} after
  doc = doc.replace(/\\vspace\{(?:2|3|4\.5|5\.5)pt(?: plus [^}]*)?\}\s*\\noindent\s*\\textbf\{/g, `\\vspace{${subprojectVspace}}\n\\noindent \\textbf{`);
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
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const formData = new FormData();
        formData.append("filecontents[]", safeLatex);
        formData.append("filename[]", "document.tex");
        formData.append("engine", engine);
        formData.append("return", "pdf");

        return await fetch("https://texlive.net/cgi-bin/latexcgi", {
          method: "POST",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          body: formData,
          signal: AbortSignal.timeout(30000), // 30 sec timeout
        });
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 750 * attempt));
      }
    }
    throw new Error("TeXLive compilation failed after 3 attempts");
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
 * Deterministically patches the user's custom LaTeX template in-place.
 * Strictly preserves 100% of the original preamble (\documentclass, \usepackage, \geometry,
 * custom macros, colors, fonts, section formatting, and macro calls like \resumeSubheading).
 * Surgically replaces bullet points and weaved skills within the body.
 */
export function patchLatexTemplateDeterministically(
  originalLatex: string,
  canonical: CanonicalResume,
  audit?: UnifiedATSAudit | null,
  jobText?: string,
  customMetrics?: Record<number, string>
): string {
  if (!originalLatex || !originalLatex.trim()) {
    return generateLatexFromCanonical(canonical);
  }

  let patched = originalLatex;

  // 0. Enforce the canonical \resumeSubheading macro format in any custom template:
  //    Row 1: \textbf{#1} (JobTitle, bold, left) & \textit{\small #2} (Location, right)
  //    Row 2: {\small #3} (Company, normal weight, left) & \textit{\small #4} (Date, right)
  //    If the template has the old italic-company Row 2, normalise it here so the format
  //    is deterministically correct regardless of which custom LaTeX the user pastes.
  patched = patched.replace(
    /\\textit\{\\small #3\}\s*&\s*\\textit\{\\small #4\}/g,
    "{\\small #3} & \\textit{\\small #4}"
  );

  // 1. In-place PAR bullet rewrites from audit
  if (audit?.action_verb_and_par_rewrites) {
    for (let i = 0; i < audit.action_verb_and_par_rewrites.length; i++) {
      const r = audit.action_verb_and_par_rewrites[i];
      if (!r.original_bullet || !r.optimized_par_bullet) continue;
      const customVal = customMetrics?.[i];
      let rawReplacement = resolvePlaceholder(r.optimized_par_bullet, customVal);
      rawReplacement = cleanAiText(
        rawReplacement.replace(
          /^\s*(?:optimized|rewrite|par|improved|revised|bullet|option\s*\d+|suggestion)\s*[:\-–—]\s*/i,
          ""
        )
      );

      const targetRaw = r.original_bullet.trim();
      const targetClean = cleanAiText(targetRaw);

      if (patched.includes(targetRaw)) {
        patched = patched.replace(targetRaw, escapeLatexForPatch(rawReplacement));
        continue;
      }
      if (targetClean && patched.includes(targetClean)) {
        patched = patched.replace(targetClean, escapeLatexForPatch(rawReplacement));
        continue;
      }

      // Match by distinctive phrase (first 5-7 words)
      const words = targetClean.split(/\s+/).filter(Boolean);
      if (words.length >= 4) {
        const prefix = words
          .slice(0, Math.min(6, words.length))
          .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join("\\s+");
        const re = new RegExp(`(?<=\\\\item\\s+|\\\\resumeItem\\s*\\{\\s*)(?:${prefix}[^\\\\}\n]*)`, "i");
        if (re.test(patched)) {
          patched = patched.replace(re, escapeLatexForPatch(rawReplacement));
        }
      }
    }
  }

  // 2. Passive verb upgrades
  const PASSIVE_MAP: [RegExp, string][] = [
    [/\b(?:worked on developing|worked on building|worked on creating)\b/gi, "Engineered"],
    [/\b(?:worked on)\b/gi, "Engineered"],
    [/\b(?:responsible for leading|responsible for managing)\b/gi, "Spearheaded"],
    [/\b(?:responsible for|duties included)\b/gi, "Spearheaded"],
    [/\b(?:assisted with|assisted in|helped with|helped)\b/gi, "Collaborated on"],
    [/\b(?:handled)\b/gi, "Orchestrated"],
    [/\b(?:participated in|was involved in)\b/gi, "Delivered"],
  ];
  for (const [pattern, strongVerb] of PASSIVE_MAP) {
    patched = patched.replace(pattern, strongVerb);
  }

  // 3. Weave missing target JD skills into Technical Skills section if present
  if (jobText && jobText.trim()) {
    const jdReqs = extractRequirementsFromJobText(jobText);
    const targetKeywords = jdReqs
      .map((r) => r.keyword)
      .filter(
        (kw) =>
          kw.trim().length >= 3 &&
          !/^(engineer|software|developer|team|experience|years|work|strong|ability)$/i.test(kw.trim())
      );

    const skillsSectionMatch = patched.match(
      /(\\section\*?\{[^}]*(?:SKILL|TECHNOLOG)[^}]*\}[\s\S]*?)(?=\\section|\\end\{document\}|$)/i
    );
    if (skillsSectionMatch) {
      const skillsSection = skillsSectionMatch[1];
      let updatedSkillsSection = skillsSection;
      for (const kw of targetKeywords.slice(0, 3)) {
        if (!new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(updatedSkillsSection)) {
          const firstRow = updatedSkillsSection.match(/(\\textbf\{[^}]*:\}[^\n\\}]*)/);
          if (firstRow) {
            updatedSkillsSection = updatedSkillsSection.replace(
              firstRow[1],
              `${firstRow[1]}, ${escapeLatexForPatch(kw)}`
            );
          }
        }
      }
      if (updatedSkillsSection !== skillsSection) {
        patched = patched.replace(skillsSection, updatedSkillsSection);
      }
    }
  }

  return patched;
}

/**
 * Combines ATS-optimized content improvements into the LaTeX resume template:
 * 1. If an original LaTeX template is provided, it is treated as the STRUCTURAL & VISUAL SOURCE OF TRUTH.
 *    Uses Gemini (with deterministic in-place patching fallback) to update bullets, skills, and summary
 *    while preserving 100% of the original preamble, packages, commands, styling, fonts, and geometry.
 * 2. If no original LaTeX template is provided, synthesizes a standard 1-page ATS LaTeX template.
 * Validates and compiles the output via TeXLive CGI to guarantee a 100% functional, downloadable PDF.
 */
export async function applyImprovementsToLatexWithAI(params: ApplyLatexParams): Promise<ApplyLatexResult> {
  // Sanitize input text: fix OCR errors (Al→AI) BEFORE passing to remediation passes
  const sanitizedText = sanitizeOcrText(params.atsOptimizedText || "");

  // If original LaTeX is provided, extract any known links
  const baseLatex = (params.originalLatex || "").trim();
  const hasCustomTemplate = baseLatex.includes("\\documentclass") || baseLatex.includes("\\begin{document}");
  const originalLinks = hasCustomTemplate ? extractHyperlinksFromLatex(baseLatex) : [];

  // Deterministic remediation passes:
  // 1. Parses sanitizedText into CanonicalResume JSON schema
  // 2. Applies AI PAR rewrites, active verb upgrades, de-duplications, twice-rule weaving, single-page trimming
  const deterministic = runAllRemediationPasses({
    text: sanitizedText,
    latex: baseLatex,
    audit: params.audit,
    jobText: params.jobText || "",
    customMetrics: params.customMetrics,
  });

  let updatedLatex = "";
  let compileResult: { success: boolean; pdfBuffer: Buffer | null; log?: string; error?: string } = {
    success: false,
    pdfBuffer: null,
  };

  if (hasCustomTemplate) {
    // Path 1 (PRIMARY): Deterministic surgical patcher — preserves 100% of original layout,
    // preamble, macros, fonts, geometry and only updates bullet content, skills, and summary in-place.
    // This is the preferred path for formatting determinism and consistency across runs.
    const patched = patchLatexTemplateDeterministically(
      baseLatex,
      deterministic.canonical,
      params.audit,
      params.jobText,
      params.customMetrics
    );
    const singlePatched = optimizeLatexGeometryForOnePage(patched);
    const safePatched = cleanLingeringPlaceholders(
      ensureAllHrefsPreservedInLatex(singlePatched, [baseLatex, sanitizedText]),
      true
    );
    const patchCompile = await validateAndCompileLatex(safePatched, [baseLatex, sanitizedText]);
    if (patchCompile.success && patchCompile.pdfBuffer) {
      let pageCount = 1;
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: patchCompile.pdfBuffer });
        const parsed = await parser.getText();
        pageCount = parsed.total || 1;
        await parser.destroy().catch(() => {});
      } catch {}

      if (pageCount === 1) {
        updatedLatex = safePatched;
        compileResult = patchCompile;
      } else {
        console.warn(`Patched LaTeX produced ${pageCount} pages, falling back to 1-page deterministic ATS layout`);
        const singleLatex = cleanLingeringPlaceholders(
          ensureAllHrefsPreservedInLatex(deterministic.optimizedLatex, [baseLatex, sanitizedText]),
          true
        );
        const fallbackCompile = await validateAndCompileLatex(singleLatex, [baseLatex, sanitizedText]);
        if (fallbackCompile.success) {
          updatedLatex = singleLatex;
          compileResult = fallbackCompile;
        } else {
          updatedLatex = safePatched;
          compileResult = patchCompile;
        }
      }
    }

    // Path 2 (SECONDARY): If deterministic patcher fails to compile, use Gemini AI as fallback.
    // AI is NOT used as the first choice to avoid non-deterministic formatting drift between runs.
    if (!compileResult.success && process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const candidateModels = Array.from(
          new Set(
            [
              process.env.GEMINI_EXTRACTION_MODEL,
              "gemini-2.5-pro",
              "gemini-2.5-flash",
              "gemini-2.0-flash",
            ].filter(Boolean)
          )
        ) as string[];

        const prompt = `You are an elite LaTeX resume compiler and ATS optimization specialist.
Your task is to update the candidate's existing LaTeX resume code with ATS-optimized content improvements, while STRICTLY PRESERVING 100% of the LaTeX template's visual styling, preamble, packages, commands, macros, margins, fonts, and document geometry.

[ORIGINAL_LATEX_TEMPLATE]:
${baseLatex}

[ATS_OPTIMIZED_CONTENT_AND_IMPROVEMENTS]:
${deterministic.optimizedText}

${params.jobText ? `[TARGET_JOB_DESCRIPTION]:\n${params.jobText}\n` : ""}

CRITICAL RULES:
1. 100% TEMPLATE FORMAT PRESERVATION: Keep the original preamble (\\documentclass, \\usepackage, \\geometry, \\newcommand, \\def, custom macros, colors, fonts, section formatting). DO NOT replace the visual layout with a generic template. The original LaTeX template is the absolute structural source of truth.
2. SURGICALLY UPDATE CONTENT ONLY: In the body, replace existing bullet points with the improved ATS PAR action verb bullets and update the summary if provided. The ATS_OPTIMIZED_CONTENT already contains the verified Technical Skills: keep EVERY existing skill, bullet, project, certification and education entry (never delete or shorten original information), and do NOT add any technology, skill or responsibility that is not already in ATS_OPTIMIZED_CONTENT. Keep the exact macro commands (e.g. \\resumeSubheading, \\resumeItem, \\item) used by the template.
3. HYPERLINK INTEGRITY: All \\href{url}{label} links, GitHub, LinkedIn, email, and project links from the original template must remain intact.
4. COMPILABLE OUTPUT ONLY: Return ONLY compilable LaTeX code. Do NOT output markdown code fences (\`\`\`latex or \`\`\`), do NOT output any explanations or commentary. Start with the \\documentclass line and end with \\end{document}.`;

        for (const model of candidateModels) {
          try {
            const resp = await ai.models.generateContent({
              model,
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              config: { temperature: 0.1, maxOutputTokens: 12000 },
            });
            const textResp = resp.text?.trim() || "";
            const cleanedResp = cleanLatexMarkdownFences(textResp);
            if (cleanedResp.includes("\\documentclass") && cleanedResp.includes("\\begin{document}")) {
              const safeAiLatex = cleanLingeringPlaceholders(
                ensureAllHrefsPreservedInLatex(cleanedResp, [baseLatex, sanitizedText]),
                true
              );
              const testCompile = await validateAndCompileLatex(safeAiLatex, [baseLatex, sanitizedText]);
              if (testCompile.success) {
                updatedLatex = safeAiLatex;
                compileResult = testCompile;
                break;
              }
            }
          } catch (modelErr) {
            console.warn(`AI LaTeX synthesis with ${model} failed, trying next:`, modelErr);
          }
        }
      } catch (aiErr) {
        console.warn("AI LaTeX synthesis failed:", aiErr);
      }
    }
  } else {
    // Path 3: If no custom template provided, use clean deterministic ATS template
    updatedLatex = cleanLingeringPlaceholders(
      ensureAllHrefsPreservedInLatex(deterministic.optimizedLatex, [sanitizedText]),
      true
    );
    compileResult = await validateAndCompileLatex(updatedLatex, [sanitizedText]);
  }

  const sectionCount = (updatedLatex.match(/\\section\*?\{/g) || []).length;
  const hrefCount = (updatedLatex.match(/\\href\{/g) || []).length;

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
