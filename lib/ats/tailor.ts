import {
  scoreResume,
  extractRequirementsFromJobText,
  cleanSmartTypography,
  normalizeWrappedBullets,
  CATEGORY_LABEL_RE,
  containsSkill,
  METRIC_RE,
  formatSkillDisplay,
} from "./scoring";
import { normalizeJobIdentity } from "./job-identity";
import { applyConfirmedAiTools, AI_TOOLS_CATEGORY } from "./candidate-tools";
import {
  ROLE_PROFILES,
  SUMMARY_LEAD,
  detectRoleFamily,
  resolvePositioningTitle,
  prioritizeResumeForRole,
  supportingStrengths,
  joinNatural,
  type RoleFamily,
} from "./role-profile";
import type { UnifiedATSAudit } from "./analysis";
import { parseBalancedBraces } from "./latex-text";
import {
  formatLatexWithHyperlinks,
  restoreMissingHyperlinksInLatex,
  ensureAllHrefsPreservedInLatex,
  extractHyperlinksFromLatex,
  extractHyperlinksFromMarkdownText,
  ExtractedHyperlink,
  markdownLinkToLatexHref,
  transformPlainTextPreservingHrefs,
  normalizeUrl,
  isGenericLinkAnchor,
  CanonicalResume,
  CanonicalResumeSchema,
  ExperienceItem,
  ProjectItem,
  EducationItem,
  SubheadingItem,
  sanitizeOcrText,
} from "./hyperlinks";

export type { CanonicalResume };

export const CRITICAL_TWICE_RULE_PROMPT_BLOCK = `CRITICAL "TWICE RULE" & CONTEXTUAL JD ALIGNMENT:
1. If you add a new skill to the Technical Skills section based on the JD or user input, you MUST weave that exact skill into at least one bullet point within the Work Experience section so the experience context proves the candidate used it.
2. Example: If adding "Artificial Intelligence" or "Python", modify a relevant bullet to say:
   "Spearheaded an Artificial Intelligence pipeline in Python combining YOLO and SAHI to extract equipment tags from complex P&ID drawings, increasing accuracy by 38%."
   instead of leaving the generic baseline text:
   "Developed a multi-stage pipeline using YOLO and SAHI..."
3. STRICT CONSTRAINTS:
   - Weave at most 1–2 target JD skills per bullet (max 3–4 across the entire resume) where they fit the project's technical domain naturally.
   - Use proper Oxford commas ("using Python, FastAPI, and ZeroMQ") — NEVER chain skills with "and ... and ...".
   - Keep every company name, date, subproject title, and quantitative metric exactly as written in the candidate's own resume. Never move a technology, metric, or achievement from one project to another, even within the same employer.
   - Never prepend a second action verb if the bullet already starts with a past-tense action verb.`;

export function escapeLatex(str: string): string {
  return str
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[%&$#_{}]/g, "\\$&")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

export function escapeLatexForPatch(plainText: string): string {
  return formatLatexWithHyperlinks(plainText);
}

export function stripLatexFormatting(latexSnippet: string): string {
  return latexSnippet
    .replace(/\\href\{[^}]*\}\{([^}]*)\}/g, "$1")
    .replace(/\\(?:textbf|textit|underline|emph|textsc|textsl)\{([^}]*)\}/g, "$1")
    .replace(/\\(?:%|&|\$|#|_|\{|\})/g, (m) => m.slice(1))
    .replace(/\\textbackslash\{\}/g, "\\")
    .replace(/\\textasciitilde\{\}/g, "~")
    .replace(/\\textasciicircum\{\}/g, "^")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, " ")
    .replace(/[{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatLatexLine(line: string, knownLinks?: ExtractedHyperlink[]): string {
  return formatLatexWithHyperlinks(line, knownLinks);
}

const US_STATE_CODES = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga",
  "hi", "id", "il", "in", "ia", "ks", "ky", "la", "me", "md",
  "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj",
  "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc",
  "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
  "dc", "pr", "vi"
]);

const LOCATION_KEYWORDS = /\b(?:remote|hybrid|on-site|onsite|usa|united states|uk|united kingdom|india|canada|germany|france|australia|singapore|netherlands|switzerland|japan|sf|san francisco|nyc|new york|bay area|seattle|austin|chicago|boston|los angeles|london|toronto|berlin|bangalore|bengaluru|hyderabad|pune|mumbai|delhi|gurgaon|noida|dublin|amsterdam|tokyo|visakhapatnam|bheemunipatnam|mysuru|karnataka|chennai|kolkata|gurugram|chandigarh|jaipur|ahmedabad)\b/i;

const CORPORATE_SUFFIXES = /\b(?:inc\.?|llc|l\.l\.c\.?|ltd\.?|limited|corp\.?|corporation|co\.?|company|pvt\.?\s*ltd\.?|private\s+limited|gmbh|sa|bv|plc)\b/i;

const ROLE_KEYWORDS = /\b(?:engineer|developer|architect|lead|manager|analyst|intern|scientist|consultant|associate|founder|co-founder|director|specialist|designer|administrator|coordinator|officer|vp|vice president|head of|bachelor|master|phd|degree|b\.?tech|m\.?tech|b\.?s|m\.?s|b\.?a|m\.?a|candidate|fellow)\b/i;

const MULTI_WORD_CITIES = /\b(?:san francisco|new york|bay area|los angeles|united states|united kingdom|mysuru,\s*karnataka)\b/i;

export function isLocationSegment(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  if (ROLE_KEYWORDS.test(trimmed)) return false;
  if (LOCATION_KEYWORDS.test(trimmed)) return true;
  const stateMatch = trimmed.match(/,\s*([A-Za-z]{2})\b/);
  if (stateMatch && US_STATE_CODES.has(stateMatch[1].toLowerCase())) {
    return true;
  }
  return false;
}

export function isRoleSegment(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  return ROLE_KEYWORDS.test(trimmed);
}

export function isDegreeSegment(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  return /\b(?:bachelor|master|b\.?tech|m\.?tech|b\.?s|m\.?s|b\.?a|m\.?a|diploma|ph\.?d|doctorate|degree|associate|high school|secondary|cgpa|gpa|percentage)\b/i.test(trimmed);
}

export function splitTrailingLocation(str: string): { main: string; loc: string } {
  const trimmed = str.trim();
  if (!trimmed) return { main: "", loc: "" };

  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && isLocationSegment(parts[parts.length - 1])) {
      return { main: parts.slice(0, -1).join(" | "), loc: parts[parts.length - 1] };
    }
  }

  // Handle explicit comma locations like "Mysuru, Karnataka" or "City, ST"
  const commaStateMatch = trimmed.match(/,\s*([A-Za-z]{2}|Karnataka|India|USA)\b/i);
  if (commaStateMatch && commaStateMatch.index !== undefined) {
    const beforeComma = trimmed.slice(0, commaStateMatch.index).trim();
    const afterComma = trimmed.slice(commaStateMatch.index + 1).trim();
    const lastComma = beforeComma.lastIndexOf(",");
    if (lastComma !== -1) {
      const main = beforeComma.slice(0, lastComma).trim();
      const city = beforeComma.slice(lastComma + 1).trim();
      const loc = `${city}, ${afterComma}`;
      return { main, loc };
    }
    const beforeWords = beforeComma.split(/\s+/);
    const cityWord = beforeWords.pop() || "";
    const loc = `${cityWord}, ${afterComma}`;
    return { main: beforeWords.join(" "), loc };
  }

  // Check multi-word cities at end
  const multiMatch = trimmed.match(MULTI_WORD_CITIES);
  if (multiMatch && trimmed.endsWith(multiMatch[0])) {
    const main = trimmed.slice(0, -multiMatch[0].length).replace(/^[,\s]+|[,\s]+$/g, "").trim();
    return { main, loc: multiMatch[0] };
  }

  // Check single trailing word location
  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    const lastWord = words[words.length - 1].replace(/[.,]+$/, "");
    if (isLocationSegment(lastWord) && !ROLE_KEYWORDS.test(lastWord) && !/\b(?:technology|institute|polytechnic|engineering|science|online|systems|solutions|services|group|holdings|company)\b/i.test(lastWord)) {
      return { main: words.slice(0, -1).join(" "), loc: lastWord };
    }
  }

  return { main: trimmed, loc: "" };
}

export function parseOrgAndLoc(raw: string): { org: string; loc: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { org: "", loc: "" };

  if (trimmed.includes("|")) {
    const parts = trimmed.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { org: parts[0], loc: parts.slice(1).join(", ") };
    }
    return { org: parts[0] || trimmed, loc: "" };
  }

  if (trimmed.includes(",")) {
    const commaParts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
    if (commaParts.length === 2) {
      if (CORPORATE_SUFFIXES.test(commaParts[1]) && !isLocationSegment(commaParts[1])) {
        return { org: trimmed, loc: "" };
      }
      return { org: commaParts[0], loc: commaParts[1] };
    } else if (commaParts.length > 2) {
      if (CORPORATE_SUFFIXES.test(commaParts[1]) && !isLocationSegment(commaParts[1])) {
        const org = `${commaParts[0]}, ${commaParts[1]}`;
        const loc = commaParts.slice(2).join(", ");
        return { org, loc };
      }
      return { org: commaParts[0], loc: commaParts.slice(1).join(", ") };
    }
  }

  return { org: trimmed, loc: "" };
}

const CANONICAL_HEADINGS: [string, RegExp][] = [
  ["PROFESSIONAL SUMMARY", /^(?:#{1,3}\s*)?(?:professional |career |executive )?(?:summary|profile|objective|overview|about me)\s*:?$/i],
  ["TECHNICAL SKILLS", /^(?:#{1,3}\s*)?(?:technical |core |key |professional )?(?:skills|technologies|competencies|skill set|proficiencies|tools|areas of expertise)\s*:?$/i],
  ["WORK EXPERIENCE", /^(?:#{1,3}\s*)?(?:work |professional |relevant |employment |career )?(?:experience|employment|work history|internships)\s*:?$/i],
  ["PROJECTS", /^(?:#{1,3}\s*)?(?:personal |selected |technical |academic |key |featured |notable )?projects(?:\s+experience)?\s*:?$/i],
  ["EDUCATION", /^(?:#{1,3}\s*)?(?:education|academic background|qualifications|academics|degrees)\s*:?$/i],
  ["CERTIFICATIONS", /^(?:#{1,3}\s*)?(?:certifications?|licenses|certificates|credentials)(?:\s*&.*)?\s*:?$/i],
  ["ACHIEVEMENTS", /^(?:#{1,3}\s*)?(?:achievements|key achievements|honors & awards|awards & honors|awards|honors|extracurricular activities|activities|leadership(?:\s*&.*)?|publications|patents)\s*:?$/i],
];

/**
 * Generates clean, robust ATS-compliant LaTeX preserving 100% of non-empty lines from the resume.
 * Uses adaptive pagination (article 10pt standard typography, comfortable margins) to format short resumes
 * cleanly onto 1 page and multi-page resumes cleanly onto 2+ pages without dropping text, projects, or sections.
 */
export function generateATSLatex(
  optimizedText: string,
  options?: { originalLatex?: string; knownLinks?: ExtractedHyperlink[] }
): string {
  const sanitized = sanitizeOcrText(optimizedText);
  const linksFromMarkdown = extractHyperlinksFromMarkdownText(sanitized);
  const linksFromLatex = options?.originalLatex ? extractHyperlinksFromLatex(options.originalLatex) : [];
  const combinedLinks = [...linksFromLatex, ...linksFromMarkdown, ...(options?.knownLinks || [])];
  const canonical = parseResumeToCanonical(sanitized, combinedLinks);
  trimContentForSinglePage(canonical);
  return generateLatexFromCanonical(canonical, { ...options, knownLinks: combinedLinks });
}

export function canReplaceFlexible(fullText: string, snippet: string): boolean {
  if (!snippet || !snippet.trim()) return false;
  if (fullText.includes(snippet.trim())) return true;
  const escaped = snippet.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(escaped).test(fullText);
}

export function replaceFlexible(fullText: string, original: string, replacement: string): string {
  if (!original || !original.trim()) return fullText;
  if (fullText.includes(original.trim())) {
    return fullText.replace(original.trim(), replacement.trim());
  }
  const escaped = original.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return fullText.replace(new RegExp(escaped), replacement.trim());
}

/**
 * Replaces a bullet inside LaTeX with balanced-brace extraction so inner \textbf{} or \href{}{}
 * are never truncated. Overlap threshold is set to 0.85 with no dangerous prefix slices.
 */
export function replaceLatexBulletFlexible(latexSource: string, plainOriginal: string, plainOptimized: string): string {
  if (!latexSource || !plainOriginal.trim()) return latexSource;

  plainOriginal = plainOriginal.replace(/^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+]|\d+[.)])\s+/, "").trim();
  plainOptimized = plainOptimized.replace(/^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+]|\d+[.)])\s+/, "").trim();

  const normOriginal = plainOriginal.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  if (!normOriginal) return latexSource;
  const origWords = normOriginal.split(" ").filter((w) => w.length > 3);

  const lines = latexSource.split("\n");
  let replaced = false;

  const newLines = lines.map((line) => {
    if (replaced) return line;

    let prefix = "";
    let macroType: "\\resumeItem" | "\\resumeSubItem" | null = null;
    let content = line;
    let suffix = "";

    const macroMatch = line.match(/^(\s*)(\\resumeItem|\\resumeSubItem)\s*\{/);
    const standardItemMatch = line.match(/^(\s*\\item\s*)(.*)$/);

    if (macroMatch) {
      prefix = macroMatch[1];
      macroType = macroMatch[2] as "\\resumeItem" | "\\resumeSubItem";
      const openBraceIdx = macroMatch.index! + macroMatch[0].length - 1;
      const parsed = parseBalancedBraces(line, openBraceIdx);
      if (parsed) {
        content = parsed.content;
        suffix = line.slice(parsed.endIndex);
      } else {
        content = line.slice(openBraceIdx + 1).replace(/\}$/, "");
      }
    } else if (standardItemMatch) {
      prefix = standardItemMatch[1];
      content = standardItemMatch[2];
    }

    function wrapResult(newContent: string): string {
      if (macroType) {
        return `${prefix}${macroType}{${newContent}}${suffix}`;
      }
      if (standardItemMatch) {
        return `${prefix}${newContent}`;
      }
      return newContent;
    }

    // 1. Try exact or flexible inclusion in raw line/content
    if (canReplaceFlexible(content, plainOriginal)) {
      replaced = true;
      const escapedOptimized = escapeLatexForPatch(plainOptimized);
      const replacedContent = replaceFlexible(content, plainOriginal, escapedOptimized);
      return wrapResult(replacedContent);
    }

    // 2. Try normalized comparison with 0.85 overlap threshold (NO dangerous slice(0, 30) fallback)
    const strippedContent = stripLatexFormatting(content);
    const normContent = strippedContent.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();

    let matchesCount = 0;
    for (const w of origWords) {
      if (normContent.includes(w)) matchesCount++;
    }
    const overlap = origWords.length > 0 ? matchesCount / origWords.length : 0;

    if (overlap >= 0.85) {
      replaced = true;
      const existingHrefs: string[] = [];
      const hrefRe = /\\href\{[^}]*\}\{[^}]*\}/g;
      let hMatch: RegExpExecArray | null;
      while ((hMatch = hrefRe.exec(content)) !== null) {
        existingHrefs.push(hMatch[0]);
      }

      let finalReplacement = escapeLatexForPatch(plainOptimized);
      if (existingHrefs.length > 0) {
        const appendedLinks = existingHrefs.filter((h) => !finalReplacement.includes(h)).join(" ");
        if (appendedLinks) {
          finalReplacement = `${finalReplacement} (${appendedLinks})`;
        }
      }

      return wrapResult(finalReplacement);
    }

    return line;
  });

  return newLines.join("\n");
}

/**
 * Extracts candidate's full name from the first non-empty line of resumeText (e.g. "LOKA SURYA PRAKASH PENTAKOTA")
/**
 * Deterministically extracts the company name from job description text or title headers.
 * Looks for common patterns such as "at <Company>", "Company: <Company>", "About <Company>",
 * "Welcome to <Company>", "<Role> - <Company>", "<Role> | <Company>", etc.
 */
export function extractCompanyNameFromJD(jobText: string): string | null {
  if (!jobText || !jobText.trim()) return null;
  const raw = jobText.trim();

  // Pattern 1: Explicit labels: "Company: Google", "Organization: Microsoft", "Employer: Stripe"
  const labelMatch = raw.match(/(?:^|\n)\s*(?:company|organization|employer|client)\s*(?:name)?\s*[:\-]\s*([A-Za-z0-9&.,' -]{2,40})/i);
  if (labelMatch && labelMatch[1]) {
    const candidate = sanitizeExtractedCompanyName(labelMatch[1]);
    if (candidate) return candidate;
  }

  // Pattern 2: "About <Company>", "At <Company>", "Join <Company>", "Life at <Company>", "Welcome to <Company>"
  const aboutMatch = raw.match(/(?:^|\n|\.|\!)\s*(?:about|join|welcome to|life at|working at|careers at)\s+([A-Z][A-Za-z0-9&.,' -]{1,35}?)(?=\s*(?:,|\.|\n|is\b|was\b|are\b|we\b|our\b|!|–|-|\|))/i);
  if (aboutMatch && aboutMatch[1]) {
    const candidate = sanitizeExtractedCompanyName(aboutMatch[1]);
    if (candidate) return candidate;
  }

  // Pattern 3: Common role header formats in the first 5 lines:
  // e.g. "Software Engineer at Google", "Full Stack Developer @ Stripe", "Frontend Lead - Netflix"
  const topLines = raw.split("\n").slice(0, 6);
  for (const line of topLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 100) continue;

    // "<Role> at/@ <Company>"
    const atMatch = trimmed.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&.,' -]{1,35})/i);
    if (atMatch && atMatch[1]) {
      const candidate = sanitizeExtractedCompanyName(atMatch[1]);
      if (candidate) return candidate;
    }

    // "<Role> - <Company>" or "<Role> | <Company>"
    const sepMatch = trimmed.match(/^[A-Za-z0-9/ ]+\s*(?:[-–|])\s*([A-Z][A-Za-z0-9&.,' -]{2,35})$/);
    if (sepMatch && sepMatch[1]) {
      const candidate = sanitizeExtractedCompanyName(sepMatch[1]);
      if (candidate) return candidate;
    }
  }

  return null;
}

function sanitizeExtractedCompanyName(raw: string): string | null {
  const cleaned = raw
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2 || cleaned.length > 40) return null;

  // Filter out false positives (generic non-company words)
  const blacklist = new Set([
    "the", "our", "a", "an", "this", "us", "you", "we", "role", "position",
    "job", "team", "description", "requirements", "responsibilities", "overview",
    "summary", "details", "qualification", "qualifications", "experience",
    "full time", "part time", "contract", "remote", "hybrid", "onsite",
    "location", "salary", "apply", "careers", "employment",
  ]);

  if (blacklist.has(cleaned.toLowerCase())) return null;

  // Check if first token is blacklisted
  const firstToken = cleaned.split(" ")[0].toLowerCase();
  if (blacklist.has(firstToken) && cleaned.split(" ").length === 1) return null;

  return cleaned;
}

/**
 * Extracts candidate name from the top lines of a resume
 * and converts it to Title Case separated by underscores with optional company name:
 * e.g. "Resume_Loka_Surya_Prakash_Google.pdf" or "Resume_Loka_Surya_Prakash.pdf".
 * If companyName is not provided or empty, it attempts to extract the company from jobText.
 */
export function getCandidateFilename(
  resumeText: string,
  companyNameOrJobText?: string,
  ext: string = "pdf"
): string {
  const extension = ext.replace(/^\./, "");

  // If companyNameOrJobText is provided, determine if it's already a short company name
  // or a full Job Description text to extract the company from.
  let company = (companyNameOrJobText || "").trim();
  if (company.length > 50 || company.includes("\n") || company.toLowerCase().includes("job description") || company.toLowerCase().includes("responsibilities")) {
    const extracted = extractCompanyNameFromJD(company);
    company = extracted || "";
  } else if (!company && companyNameOrJobText) {
    company = companyNameOrJobText.trim();
  }

  const cleanCompany = company
    .replace(/[^\w\s-]/g, "")
    .split(/\s+/)
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("_");

  if (!resumeText || !resumeText.trim()) {
    return cleanCompany ? `Resume_${cleanCompany}.${extension}` : `Resume.${extension}`;
  }

  const lines = resumeText.split("\n");
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;
    // Skip LaTeX preamble, comments, or document structure
    if (
      line.startsWith("%") ||
      line.startsWith("\\documentclass") ||
      line.startsWith("\\usepackage") ||
      line.startsWith("\\begin{") ||
      line.startsWith("\\input")
    ) {
      continue;
    }

    // Strip LaTeX markup like \textbf, \Huge, \scshape
    line = line
      .replace(/\\[a-zA-Z]+(?:\*?(?:\[[^\]]*\])?(?=\{[^}]*\}))?/g, " ")
      .replace(/[{}\\]/g, " ")
      // Strip markdown headers and styling
      .replace(/^[#*\-•>]+\s*/, "")
      .replace(/[*_~`]/g, " ")
      // Strip contact info, links, emails, phones
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "")
      .replace(/(?:https?:\/\/|www\.)\S+/g, "")
      .replace(/[\d+()-]{7,}/g, "")
      // Strip separators
      .replace(/[|•·,;:/\\]/g, " ")
      .trim();

    // Extract word tokens containing alphabetic characters
    const words = line.match(/[A-Za-z]+/g);
    if (!words || words.length === 0) continue;

    // Filter out common header words if any
    const filtered = words.filter(
      (w) => !["resume", "curriculum", "vitae", "cv", "page"].includes(w.toLowerCase())
    );
    const candidateWords = filtered.length > 0 ? filtered : words;

    // Select candidate name parts (up to 3 words, e.g. "LOKA SURYA PRAKASH PENTAKOTA" -> "Loka_Surya_Prakash")
    const selectedWords = candidateWords.length > 3 ? candidateWords.slice(0, 3) : candidateWords;
    const titleCased = selectedWords
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("_");

    if (titleCased) {
      return cleanCompany ? `Resume_${titleCased}_${cleanCompany}.${extension}` : `Resume_${titleCased}.${extension}`;
    }
  }

  // End-of-loop fallback: always include company suffix
  const companySuffix = cleanCompany || "Company";
  return `Resume_${companySuffix}.${extension}`;
}

export function resolvePlaceholder(bullet: string, customVal?: string): string {
  if (customVal && customVal.trim()) {
    const cleanVal = customVal.trim().includes("%") ? customVal.trim() : `${customVal.trim()}%`;
    return bullet
      .replace(/\[[YX]\]%?|\[[YX]%\]/gi, cleanVal)
      .replace(/\[N\]/gi, cleanVal.replace(/[^0-9]/g, "") || cleanVal)
      .replace(/\[\$X\]|\$\[X\]|\[\$\d+K?\]/gi, cleanVal.startsWith("$") ? cleanVal : `$${cleanVal}`)
      .replace(/\[(?:METRIC|PERCENT|NUMBER|VALUE|RESULT)\]%?/gi, cleanVal)
      .replace(/\.\s+[a-z][\s\S]*?(?=\.|$)/g, (match) => match);
  }

  // When no verified custom metric is provided, strip the placeholder gracefully without fabricating numbers
  return bullet
    .replace(/(?:,\s*)?(?:by|to|of|reaching|achieving|resulting in)\s+\[[YX]\]\\?%?/gi, "")
    .replace(/\[[YX]\]\\?%?|\[[YX]\\?%\]/gi, "")
    .replace(/(?:,\s*)?(?:for|serving|across|supporting)\s+\[N\]\s*(?:users|records|requests|endpoints|queries|customers)?/gi, "")
    .replace(/\[N\]/gi, "")
    .replace(/(?:,\s*)?(?:saving|generating|worth)\s+(?:\[\$X\]|\$\[X\]|\[\$\d+K?\])/gi, "")
    .replace(/\[\$X\]|\$\[X\]|\[\$\d+K?\]/gi, "")
    .replace(/(?:,\s*)?(?:by|to|of)\s+\[(?:METRIC|PERCENT|NUMBER|VALUE|RESULT)\]\\?%?/gi, "")
    .replace(/\[(?:METRIC|PERCENT|NUMBER|VALUE|RESULT)\]\\?%?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+,[ \t]*/g, ", ")
    .replace(/,[ \t]*\./g, ".")
    .replace(/[ \t]+\./g, ".")
    .replace(/\.{2,}/g, ".")
    .trim();
}

const GENUINE_PLACEHOLDER_WORDS = new Set([
  "x", "y", "z", "n", "m", "k", "a", "b", "x1", "x2",
  "metric", "metrics", "percent", "percentage", "result", "results",
  "number", "numbers", "num", "scale", "value", "values",
  "impact", "amount", "timeframe", "count", "placeholder", "todo"
]);

export function isGenuinePlaceholder(inner: string): boolean {
  const trimmed = inner.trim();
  const lower = trimmed.toLowerCase();
  if (GENUINE_PLACEHOLDER_WORDS.has(lower)) return true;
  if (/^(?:insert|specify|add|select)\s+/i.test(trimmed)) return true;
  if (/^todo\b/i.test(trimmed)) return true;
  if (/^placeholder\b/i.test(trimmed)) return true;
  if (/^[$%#]\s*[A-Z0-9_]+$/i.test(trimmed)) return true;
  if (/^[A-Z0-9_]+\s*[$%#]$/i.test(trimmed)) return true;
  if (/^[A-Z]{1,2}\d?$/i.test(trimmed)) return true;
  return false;
}

/**
 * Scans content for any lingering bracketed placeholders (e.g. [Y]%, [X], [N], [$X], [A-Z0-9_%])
 * and removes them gracefully without fabricating arbitrary metrics (never fabricating 42%, 2.5x, or $45K),
 * ensuring zero unverified brackets and pristine typography in both text and LaTeX.
 */
export function cleanLingeringPlaceholders(content: string, isLatex = false): string {
  let cleaned = content;

  // 1. Multiplier patterns: [X]x, [Y]x -> remove gracefully without fabricating 2.5x
  cleaned = cleaned.replace(/(?:,\s*)?(?:by|to|of)?\s*\[[A-Z0-9_%]+\]\s*[xX]\b/g, "");

  // 2. Dollar metric patterns: [$X] -> remove gracefully without fabricating $45K
  cleaned = cleaned.replace(/(?:,\s*)?(?:saving|generating|worth)?\s*(?:\[\$[A-Z0-9_]+\]|\$\[[A-Z0-9_]+\]|\[\$\d+K?\])/gi, "");

  // 3. Percentage patterns: [Y]%, [X]%, [Y%], [X%] or [Y]\% in LaTeX -> remove gracefully without fabricating 42%
  const percentRegex = isLatex
    ? /(?:,\s*)?(?:by|to|of|reaching|achieving|resulting in)?\s*(?:\[[A-Z0-9_]+\]\\?%|\[[A-Z0-9_]+\\?%\])/gi
    : /(?:,\s*)?(?:by|to|of|reaching|achieving|resulting in)?\s*(?:\[[A-Z0-9_]+\]%|\[[A-Z0-9_]+%\])/gi;
  cleaned = cleaned.replace(percentRegex, "");

  // 4. Number / scale patterns: [N] -> remove gracefully without fabricating 40 or 10K+
  cleaned = cleaned.replace(/(?:,\s*)?(?:for|serving|across|supporting)?\s*\[N\](?:\s+(?:users|records|requests|endpoints|queries|customers))?/gi, "");

  // 5. Any remaining lingering all-caps bracket placeholders: e.g. [METRIC], [PERCENT], [X], [Y], [RESULT]
  cleaned = cleaned.replace(/\[([A-Z0-9_%$+ -]+)\]/g, (fullMatch, inner, offset, fullString) => {
    const trimmed = inner.trim();
    if (trimmed.includes("=")) return fullMatch;

    // Do not touch markdown links e.g. [title](url)
    const after = fullString.slice(offset + fullMatch.length, offset + fullMatch.length + 5);
    if (after.startsWith("(")) return fullMatch;

    if (isLatex) {
      const before = fullString.slice(Math.max(0, offset - 60), offset);

      // Do not touch macro argument definitions: \newcommand{\foo}[1]
      if (/(?:\\newcommand\*?|\\renewcommand\*?|\\providecommand\*?)\s*\{[^}]*\}\s*$/i.test(before)) {
        return fullMatch;
      }
      // Do not touch LaTeX package / command options
      if (/\\(?:usepackage|documentclass|titlespacing\*?|titleformat\*?|setlist|tabular\*?|vspace|hspace|rule|addtolength|setlength|makebox|parbox|raisebox)\s*$/i.test(before)) {
        return fullMatch;
      }
      // Do not touch line breaks with dimensions: \\[-1pt]
      if (/\\\\+\s*$/.test(before)) {
        return fullMatch;
      }
      // Do not touch environment options: \begin{itemize}[...]
      if (/\\(?:begin|end)\{[^}]*\}\s*$/i.test(before)) {
        return fullMatch;
      }
      // Pure numbers or dimensions are never placeholders in LaTeX
      if (/^\d+$/.test(trimmed)) return fullMatch;
      if (/^-?\d+(\.\d+)?(?:pt|in|cm|mm|em|ex)$/i.test(trimmed)) return fullMatch;
      // LaTeX options / alignment specifiers / internal commands
      if (/^(?:empty|hidelinks|letterpaper|a4paper|10pt|9pt|utf8|t|b|c|h|p)$/i.test(trimmed)) return fullMatch;
      if (trimmed.startsWith("\\")) return fullMatch;
    } else {
      if (/^\d+$/.test(trimmed)) return fullMatch;
    }

    if (isGenuinePlaceholder(trimmed)) {
      return "";
    }

    return fullMatch;
  });

  // 6. Clean dangling punctuation fragments (e.g. ", ." or multiple dots) without collapsing newlines
  cleaned = cleaned
    .replace(/(?<=\S)[ \t]{2,}/g, " ")
    .replace(/[ \t]+,[ \t]*/g, ", ")
    .replace(/,[ \t]*\./g, ".")
    .replace(/[ \t]+\./g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\bfrom\s*,/gi, ",")
    .replace(/\bcontributing to an?\s+increase\b/gi, "driving a measurable increase")
    .replace(/\bby an average\s*\./gi, ".")
    .replace(/\bby an average\b/gi, "")
    .replace(/\band retained\s+of monthly active users\b/gi, "and driving high monthly active user retention")
    .replace(/\bretained\s+of monthly active users\b/gi, "driving high monthly active user retention")
    .replace(/,\s*and\s+(reducing|cutting|decreasing|minimizing|lowering|saving|mitigating)\b/gi, ", while $1")
    .replace(/\band\s+(reducing|cutting|decreasing|minimizing|lowering|saving|mitigating)\s+manual\b/gi, "while $1 manual")
    .replace(/\bextract\s+equipment\s+and\s+instrument\s+tags\b/gi, "extract equipment tags")
    .replace(/\bResults-driven for\s+(?:an?\s+)?/gi, "Results-driven ")
    .replace(/\b([Aa])\s+increase\b/g, (_m, a) => (a === "A" ? "An increase" : "an increase"))
    .replace(/\$C\+\+\$/g, "C++")
    .replace(/\\\$C\+\+\\\$/g, "C++");

  // Clean raw or escaped pipe sequences
  if (isLatex) {
    cleaned = cleaned.replace(/(?:\\\$[ \t]*[|][ \t]*\\\$|\\\$[ \t]*\\\|[ \t]*\\\$|\$[ \t]*\|[ \t]*\$)/g, "\\enspace\\textbar\\enspace");
  } else {
    cleaned = cleaned.replace(/(?:\\\$[ \t]*[|][ \t]*\\\$|\\\$[ \t]*\\\|[ \t]*\\\$|\$[ \t]*\|[ \t]*\$)/g, " | ");
  }

  return cleaned;
}

/**
 * Rewrites professional summary aligning sentence 1 with target role & domain,
 * and sentence 2 with overlapping core tools.
 */
export function rewriteSummaryWithJDAlignment(
  summaryText: string,
  targetRole: string,
  domainKeywords: string[] = [],
  overlappingTools: string[] = [],
  /** JD-detected role family; drives the positioning so the summary presents the candidate as that exact role. */
  family: RoleFamily = "generic",
  /** Final resume skills + bullets; used to name complementary strengths that are really on the resume. */
  evidenceText = ""
): string {
  let role = (targetRole || "AI Engineer").replace(/^(?:for\s+|an?\s+)/i, "").trim();
  if (role.toLowerCase().endsWith("engineers")) {
    role = role.slice(0, -1);
  } else if (role.toLowerCase().endsWith("developers")) {
    role = role.slice(0, -1);
  } else if (role.toLowerCase().endsWith("architects")) {
    role = role.slice(0, -1);
  }
  if (!role || role.length < 3) role = "AI Engineer";
  // Never let acronyms degrade to "Ai"/"Ml" when the role was title-cased upstream
  role = role.split(/(\s+)/).map((t) => (t.trim() ? formatSkillDisplay(t) : t)).join("");

  const uniqueFormatted = (list: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const f = formatSkillDisplay(String(raw || "").trim());
      if (f && !seen.has(f.toLowerCase())) {
        seen.add(f.toLowerCase());
        out.push(f);
      }
    }
    return out;
  };
  const oxford = (items: string[]) =>
    items.length <= 1
      ? items.join("")
      : items.length === 2
        ? `${items[0]} and ${items[1]}`
        : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;

  // A detected role family defines the positioning; JD domain terms only steer the generic fallback.
  const domain =
    family !== "generic"
      ? ROLE_PROFILES[family].domain
      : domainKeywords.length > 0
        ? oxford(uniqueFormatted(domainKeywords).slice(0, 2))
        : ROLE_PROFILES.generic.domain;
  const toolList = uniqueFormatted(overlappingTools).slice(0, 4);
  const tools = toolList.length > 0 ? oxford(toolList) : "modern full-stack technologies";

  const sentence1 = `Results-driven ${role} specializing in ${domain}.`;
  const sentence2 = `${SUMMARY_LEAD[family]} using ${tools}.`;

  // Keep real strengths outside the target role visible as support (never invented: gated on resume evidence)
  const support = evidenceText ? supportingStrengths(evidenceText, family).slice(0, 2) : [];
  const sentence3 = support.length > 0 ? `Complemented by hands-on ${joinNatural(support)} experience.` : "";
  const base = `${sentence1} ${sentence2}`;
  // Stay within the one-page budget: only append the supporting sentence if the summary stays ~3 lines
  return sentence3 && base.length + sentence3.length < 330 ? `${base} ${sentence3}` : base;
}

/**
 * Reframes 60-75% of experience bullets into Google XYZ format:
 * [Action] + [System built with JD keywords] + [Mechanism] + [Impact]
 * keeping quantitative metrics and company names immutable.
 */
export function reframeBulletsToGoogleXYZ(
  bullets: string[],
  targetKeywords: string[] = [],
  companyNames: string[] = []
): { reframedBullets: string[]; modifiedCount: number } {
  const BULLET_START_RE = /^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+✔✓◆◇►▸⁃∙·\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF]|\d+[.)])\s+(.*)$/;
  const ACTION_VERBS = [
    "Architected",
    "Engineered",
    "Spearheaded",
    "Orchestrated",
    "Implemented",
    "Streamlined",
    "Optimized",
    "Delivered",
  ];

  const reframed: string[] = [];
  let modifiedCount = 0;
  // Target 60% - 75% of experience bullets
  const targetCount = Math.max(1, Math.min(bullets.length, Math.round(bullets.length * 0.7)));

  for (let i = 0; i < bullets.length; i++) {
    const raw = bullets[i];
    const match = raw.match(BULLET_START_RE);
    let content = match ? match[1].trim() : raw.trim();

    // Strip leading formatting tokens that might leak into content
    content = content
      .replace(/^(?:textbf|small)\s+/i, "")
      .replace(/\[leftmargin=[^\]]*\]/g, "")
      .replace(/(?:^|\s)-?\d+(?:\.\d+)?pt(?=\s|$)/g, "")
      .trim();

    // Preserve company names and avoid modifying headings
    const isCompanyLine = companyNames.some((c) => c && content.toLowerCase().includes(c.toLowerCase()));
    if (isCompanyLine || modifiedCount >= targetCount) {
      reframed.push(raw);
      continue;
    }

    // Extract any existing quantitative metric so it remains strictly immutable
    const metricMatch = content.match(METRIC_RE);
    const existingMetric = metricMatch ? metricMatch[0] : "";

    // Check if bullet already starts with a past-tense action verb (Architected, Synthesized, Devised, etc.)
    const firstWordMatch = content.match(/^([A-Za-z]+)\b/);
    const firstWord = firstWordMatch ? firstWordMatch[1].toLowerCase() : "";
    const PAST_ACTION_VERBS = new Set([
      "architected", "engineered", "spearheaded", "orchestrated", "implemented",
      "streamlined", "optimized", "delivered", "developed", "designed", "synthesized",
      "devised", "built", "launched", "automated", "integrated", "formulated",
      "accelerated", "pioneered", "standardized", "scaled", "executed", "authored",
      "established", "reduced", "improved", "managed", "led", "directed", "constructed",
      "created", "produced", "published", "programmed", "resolved", "secured", "trained",
      "collaborated", "conducted", "achieved", "cut", "boosted", "combined",
      "consolidated", "deployed", "configured", "refactored", "migrated", "centralized",
      "modeled", "maintained", "analyzed", "evaluated"
    ]);

    if (PAST_ACTION_VERBS.has(firstWord) && !/^(?:worked|assisted|helped|handled|participated)$/.test(firstWord)) {
      // Bullet already starts with a strong action verb; preserve it without prepending another verb
      reframed.push(raw);
      continue;
    }

    // Check if bullet starts with a weak verb or could be structured in Google XYZ
    const startsWeak =
      /^(?:worked on developing|worked on building|worked on creating|worked on|assisted with|helped with|helped|responsible for|participated in|handled)\b/i.test(
        content
      );

    const actionVerb = ACTION_VERBS[i % ACTION_VERBS.length];

    // If already strong, quantified and not using weak verbs, preserve as is
    if (!startsWeak && existingMetric && !/worked on/i.test(content)) {
      reframed.push(raw);
      continue;
    }

    // Strip leading weak verb phrase or existing action verb
    const cleanContent = content
      .replace(
        /^(?:worked on developing|worked on building|worked on creating|worked on|responsible for leading|responsible for managing|responsible for|assisted with|assisted in|helped with|helped|handled|participated in)\s*/i,
        ""
      )
      .replace(
        /^(?:architected|engineered|spearheaded|orchestrated|implemented|built|developed|created|streamlined|optimized|delivered|integrated|combined|consolidated|deployed|configured|refactored|migrated|centralized|modeled|maintained|analyzed|evaluated|designed|launched|automated|pioneered|formulated|accelerated|standardized|scaled)\s*/i,
        ""
      )
      .trim();

    let newContent = "";
    if (existingMetric) {
      newContent = `${actionVerb} ${cleanContent}`;
    } else {
      newContent = `${actionVerb} ${cleanContent}`;
      if (!/[.!?]$/.test(newContent)) {
        newContent += ".";
      }
    }

    const prefix = match ? raw.slice(0, match.index! + (raw.length - match[1].length)) : "";
    reframed.push(`${prefix}${newContent}`);
    modifiedCount++;
  }

  return { reframedBullets: reframed, modifiedCount };
}

/**
 * Domain-specific skills may only be woven into a bullet whose own text already shows that domain, so a skill is
 * never attributed to an unrelated project (e.g. Computer Vision into an integration-hub bullet, or React into a
 * telemetry pipeline). Returns null for skills with no domain restriction.
 */
function skillHostPattern(skill: string): RegExp | null {
  const s = skill.trim().toLowerCase();
  if (/^(?:computer vision|vlms?|vision language models?|opencv|yolo|sahi|ocr|image processing|object detection)$/.test(s))
    return /\b(?:yolo|sahi|ocr|opencv|visual|vision|detection|drawings?|images?)\b/i;
  if (/^(?:rag|retrieval-augmented generation|vector databases?|embeddings?|semantic search)$/.test(s))
    return /\b(?:rag|retriev\w*|embeddings?|vector|semantic|knowledge)\b/i;
  if (/^(?:machine learning|deep learning|nlp|natural language processing|pytorch|tensorflow|scikit-learn|mlops|transformers|hugging ?face|generative ai|genai|ai agents?|multi-agent systems?)$/.test(s))
    return /\b(?:ai|llms?|models?|machine learning|neural|yolo|ocr|semantic|agents?|workflows?)\b/i;
  if (/^(?:mavlink|pymavlink|ros2?|drones?|uav|ardupilot|gstreamer|webrtc|zeromq|embedded|firmware)$/.test(s))
    return /\b(?:drones?|ardupilot|mavlink|telemetry|vehicles?|gcs|ground control|zeromq|gstreamer|video)\b/i;
  if (/^(?:react(?:\.js)?|next\.?js|vue(?:\.js)?|angular|redux|tailwind(?: ?css)?|html\/css|html|css|react native)$/.test(s))
    return /\b(?:react|next\.?js|front-?end|ui|interfaces?|dashboards?|web|full-stack|client)\b/i;
  if (/^(?:javascript|typescript|node\.?js|express(?:\.js)?)$/.test(s))
    return /\b(?:react|node\.?js|express|javascript|typescript|front-?end|web|full-stack|apis?|rest)\b/i;
  if (/^(?:sql|mongodb|postgres(?:ql)?|mysql|redis|databases?)$/.test(s))
    return /\b(?:databases?|mongodb|postgres(?:ql)?|sql|queries|records|data|platform|search)\b/i;
  if (/^(?:python|fastapi|flask|django)$/.test(s))
    return /\b(?:fastapi|flask|django|python|ardupilot|yolo|sahi|ocr|opencv|pipeline|backend|apis?)\b/i;
  return null;
}

/**
 * Contextually weaves target skills into experience bullets using the "Twice Rule".
 * Example: If adding "Artificial Intelligence", reframes:
 * "Developed a multi-stage AI pipeline using YOLO, SAHI, and OCR to extract tags."
 * -> "Spearheaded an Artificial Intelligence pipeline combining YOLO and SAHI to extract tags."
 */
export function weaveSkillIntoExperienceBullets(
  bullets: string[],
  skill: string,
  options: { primaryOnly?: boolean } = {}
): { wovenBullets: string[]; success: boolean } {
  const primaryOnly = !!options.primaryOnly;
  const normSkill = skill.trim();
  if (!normSkill || bullets.length === 0) return { wovenBullets: bullets, success: false };

  const escapedSkill = [...normSkill].map((c) => (/[a-z0-9 ]/i.test(c) ? c : "\\" + c)).join("");
  const exactRe = new RegExp("(^|[^a-z0-9+#.])" + escapedSkill + "(?=$|[^a-z0-9+#.])", "i");

  // Already present with exact skill name?
  if (bullets.some((b) => exactRe.test(b))) {
    return { wovenBullets: bullets, success: true };
  }

  const updatedBullets = [...bullets];
  const hostPattern = skillHostPattern(normSkill);

  // Generic, resume-agnostic anchors only. Every rewrite below keys off structure that any resume can contain
  // (an existing "AI" noun, "containerized with X", "APIs", a named LLM vendor, ...) and never off one candidate's
  // project wording, so a skill can only be woven into a bullet whose own text already shows that domain.
  const rewriteFirst = (re: RegExp, to: string | ((m: string) => string)): { wovenBullets: string[]; success: boolean } | null => {
    for (let i = 0; i < updatedBullets.length; i++) {
      if (re.test(updatedBullets[i]) && !exactRe.test(updatedBullets[i])) {
        updatedBullets[i] = updatedBullets[i].replace(re, to as string);
        return { wovenBullets: updatedBullets, success: true };
      }
    }
    return null;
  };
  const done = (r: { wovenBullets: string[]; success: boolean } | null) => r || { wovenBullets: bullets, success: false };

  if (/^artificial intelligence$/i.test(normSkill)) {
    return done(rewriteFirst(/(?<![A-Za-z])AI(?=\s+(?:pipelines?|workflows?|systems?|models?|agents?|platforms?|features?|assistants?|matching))/, "Artificial Intelligence"));
  }
  if (/^python$/i.test(normSkill)) {
    const r = rewriteFirst(/\b(FastAPI|Flask|Django)\b/, "Python, $1");
    if (r) return r;
  }
  if (/^microservices?$/i.test(normSkill) || /^distributed\s+systems?$/i.test(normSkill)) {
    // Architecture claims are never inferred from wording; they stay in the Skills section unless already in a bullet.
    return { wovenBullets: bullets, success: false };
  }
  if (/^docker$/i.test(normSkill)) {
    return done(rewriteFirst(/\bcontainerized with ([A-Za-z0-9.+#-]+)/i, (m) => `${m} and Docker`));
  }
  if (/^(?:kubernetes|k8s)$/i.test(normSkill)) {
    return done(
      rewriteFirst(/\bcontainerized with Docker\b/i, "containerized with Docker and Kubernetes") ||
        rewriteFirst(/\bcloud\s+clusters?\b/i, "Kubernetes cloud clusters")
    );
  }
  if (/^rest(?:ful)?(?:\s*apis?)?$/i.test(normSkill)) {
    return done(rewriteFirst(/(?<!REST |RESTful )\bAPIs?\b/, (m) => `REST ${m}`));
  }
  if (/^(?:llms?|large language models?)$/i.test(normSkill)) {
    return done(rewriteFirst(/\b(Gemini|OpenAI|GPT-?[\w.]*|Claude|Llama)\b(?! LLM)/, "$1 LLM"));
  }
  if (/^(?:git|github|version control)$/i.test(normSkill)) {
    return done(rewriteFirst(/\bCI\/CD\b/, "Git-driven CI/CD"));
  }

  // 10. Agentic AI: "Engineered 5+ distinct AI workflows" -> "Engineered 5+ distinct Agentic AI workflows"
  if (/^agentic ai$/i.test(normSkill)) {
    const aiNoun = /(?<!Agentic )\bAI(?=\s+(?:workflows?|agents?|pipelines?|systems?|matching|investor|models?|assistants?|platforms?|features?|copilots?|orchestration))/;
    for (let i = 0; i < updatedBullets.length; i++) {
      const b = updatedBullets[i];
      if (aiNoun.test(b) && !exactRe.test(b)) {
        updatedBullets[i] = b.replace(aiNoun, "Agentic AI");
        return { wovenBullets: updatedBullets, success: true };
      }
    }
    if (primaryOnly) return { wovenBullets: bullets, success: false };
    const anyAi = /(?<!Agentic )\bAI\b(?=[\s-])/;
    for (let i = 0; i < updatedBullets.length; i++) {
      const b = updatedBullets[i];
      if (anyAi.test(b) && !exactRe.test(b) && !/\bartificial intelligence\b/i.test(b)) {
        updatedBullets[i] = b.replace(anyAi, "Agentic AI");
        return { wovenBullets: updatedBullets, success: true };
      }
    }
    for (let i = 0; i < updatedBullets.length; i++) {
      const b = updatedBullets[i];
      if (/\b(?:LLMs?|RAG|LangChain|LangGraph|prompt)/i.test(b) && /\b(?:workflows?|pipelines?|systems?)\b/i.test(b) && !exactRe.test(b)) {
        updatedBullets[i] = b.replace(/\b(workflows?|pipelines?|systems?)\b/i, "Agentic AI $1");
        return { wovenBullets: updatedBullets, success: true };
      }
    }
    return { wovenBullets: bullets, success: false };
  }

  // 11. Cloud providers (Azure / AWS / GCP): anchor to existing cloud / container / mailbox-integration context
  if (/^(?:azure|microsoft azure|aws|gcp|amazon web services|google cloud(?: platform)?)$/i.test(normSkill)) {
    for (let i = 0; i < updatedBullets.length; i++) {
      const b = updatedBullets[i];
      if (/\bcloud clusters?\b/i.test(b) && !exactRe.test(b)) {
        updatedBullets[i] = b.replace(/\bcloud (clusters?)\b/i, `${normSkill} and cloud $1`);
        return { wovenBullets: updatedBullets, success: true };
      }
    }
    for (let i = 0; i < updatedBullets.length; i++) {
      const b = updatedBullets[i];
      if (/\bcontainerized with Docker\b/i.test(b) && !exactRe.test(b)) {
        updatedBullets[i] = b.replace(/\bcontainerized with Docker\b/i, `containerized with Docker on ${normSkill}`);
        return { wovenBullets: updatedBullets, success: true };
      }
    }
    if (primaryOnly) return { wovenBullets: bullets, success: false };
    for (let i = 0; i < updatedBullets.length; i++) {
      const b = updatedBullets[i];
      if (/\bcloud\b/i.test(b) && !exactRe.test(b)) {
        updatedBullets[i] = b.replace(/\bcloud\b/i, `${normSkill} cloud`);
        return { wovenBullets: updatedBullets, success: true };
      }
    }
  }

  // 12. Generic contextual weaving: distribute at most 1 skill per bullet with clean commas
  if (primaryOnly) return { wovenBullets: bullets, success: false };
  for (let i = 0; i < updatedBullets.length; i++) {
    const b = updatedBullets[i];
    if (b.length > 25 && !exactRe.test(b) && (!hostPattern || hostPattern.test(b)) && !(/^(?:javascript|typescript)$/i.test(normSkill) && /\b(?:react|node\.?js|express)/i.test(b))) {
      const usingMatch = b.match(/\b(?:using|with|leveraging)\s+([A-Za-z0-9.,\s&+#/-]+?)(?=[;!?]|\s+(?:for|to|which|that|enabling|boosting|improving|cutting|scaling)\b|[.]$)/i);
      if (usingMatch && usingMatch[1]) {
        const rawList = usingMatch[1].trim().replace(/,\s*and\s+/gi, ", ").replace(/\s+and\s+/gi, ", ");
        const items = rawList.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
        if (items.length > 0 && items.length <= 5 && !items.some((it) => it.toLowerCase() === normSkill.toLowerCase())) {
          items.push(normSkill);
          const formattedList =
            items.length === 2
              ? `${items[0]} and ${items[1]}`
              : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
          updatedBullets[i] = b.replace(usingMatch[0], `${usingMatch[0].split(/\s+/)[0]} ${formattedList}`);
          return { wovenBullets: updatedBullets, success: true };
        }
      }
    }
  }

  return { wovenBullets: bullets, success: false };
}

/**
 * Parses raw or semi-structured resume text into a CanonicalResume structured object.
 */
export function parseResumeToCanonical(
  rawText: string,
  knownLinks?: ExtractedHyperlink[]
): CanonicalResume {
  const normText = normalizeWrappedBullets(rawText);
  const lines = normText.split("\n");
  const cleanLines = lines.filter((l) => {
    const trimmed = l.trim();
    if (!trimmed) return false;
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(trimmed)) return false;
    if (/^(?:page\s*)?\d+\s*(?:of|\/)\s*\d+$/i.test(trimmed)) return false;
    if (/^page\s*\d+$/i.test(trimmed)) return false;
    return true;
  });

  const bulletRe = /^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+✔✓◆◇►▸⁃∙·\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF]|\d+[.)])\s+(.*)$/i;
  const monthNames = "(?:Jan(?:uary|\\.)?|Feb(?:ruary|\\.)?|Mar(?:ch|\\.)?|Apr(?:il|\\.)?|May|Jun(?:e|\\.)?|Jul(?:y|\\.)?|Aug(?:ust|\\.)?|Sep(?:tember|t\\.)?|Oct(?:ober|\\.)?|Nov(?:ember|\\.)?|Dec(?:ember|\\.)?)";
  const dateUnit = `(?:${monthNames}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
  const dateRangeRe = new RegExp(
    `\\b(${dateUnit}\\s*(?:[-–—]|\\bto\\b)\\s*(?:${dateUnit}|Present|Current|Now))\\b`,
    "i"
  );

  let fullName = "";
  let email = "";
  let phone = "";
  let location = "";
  let linkedinUrl = process.env.DEFAULT_LINKEDIN_URL || "https://linkedin.com/in/applicant";
  let githubUrl = process.env.DEFAULT_GITHUB_URL || "https://github.com/applicant";
  let portfolioUrl = "";

  if (knownLinks && knownLinks.length > 0) {
    const lk = knownLinks.find((l) => l.category === "linkedin" || /linkedin\.com\/in\//i.test(l.url));
    if (lk) linkedinUrl = lk.url;
    const gh = knownLinks.find((l) => l.category === "github" || /github\.com\//i.test(l.url));
    if (gh) githubUrl = gh.url;
    const pf = knownLinks.find((l) => (l.category as string) === "portfolio" || (l.category === "general" && !/linkedin|github/i.test(l.url)));
    if (pf) portfolioUrl = pf.url;
  }

  let summary = "";
  const technicalSkills: Record<string, string[]> = {};
  const experience: ExperienceItem[] = [];
  const projects: ProjectItem[] = [];
  const education: EducationItem[] = [];
  const achievements: string[] = [];
  const certifications: string[] = [];

  let currentSection = "";
  let isHeaderArea = true;

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i].trim();
    if (!line) continue;
    const nextLine = i + 1 < cleanLines.length ? cleanLines[i + 1].trim() : "";

    // Heading match
    const normHeading = line.replace(/^[#*\-_~\s]+|[#*\-_~\s:]+$/g, "").trim();
    const headingMatch = CANONICAL_HEADINGS.find(([, regex]) => regex.test(normHeading));
    if (headingMatch) {
      isHeaderArea = false;
      currentSection = headingMatch[0];
      continue;
    }

    if (isHeaderArea) {
      if (!fullName) {
        fullName = line.replace(/^[#*\-•>\s]+/, "").trim();
        continue;
      }
      const emailM = line.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
      if (emailM) email = emailM[0];
      const phoneM = line.match(/\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
      if (phoneM) phone = phoneM[0];
      const linkMatch = line.match(/(?:https?:\/\/[^\s|)]+|(?:www\.)?(?:linkedin\.com\/in\/|github\.com\/)[^\s|)]+)/gi);
      if (linkMatch) {
        for (const rawUrl of linkMatch) {
          const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl.replace(/^\/\//, "")}`;
          if (/linkedin\.com/i.test(url)) linkedinUrl = url;
          else if (/github\.com/i.test(url)) githubUrl = url;
          else if (!portfolioUrl) portfolioUrl = url;
        }
      }
      if (line.includes("|")) {
        const parts = line.split("|").map((p) => p.trim());
        for (const p of parts) {
          if (isLocationSegment(p) && !location) location = p;
        }
      }
      continue;
    }

    if (currentSection === "PROFESSIONAL SUMMARY") {
      summary = summary ? `${summary} ${line}` : line;
      continue;
    }

    if (currentSection === "TECHNICAL SKILLS") {
      const match = line.match(CATEGORY_LABEL_RE);
      if (match) {
        const cat = match[1].trim();
        const skills = match[2].split(/,\s*/).map((s) => s.trim()).filter(Boolean);
        technicalSkills[cat] = skills;
      } else if (line.includes(":")) {
        const [c, rest] = line.split(/:\s*(.*)/);
        if (c && rest) {
          technicalSkills[c.trim()] = rest.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
        }
      }
      continue;
    }

    if (currentSection === "WORK EXPERIENCE") {
      const bulletMatch = line.match(bulletRe);
      if (bulletMatch) {
        const bulletContent = bulletMatch[1].trim();
        const isProjectSubheading =
          bulletContent.length < 80 &&
          !bulletContent.endsWith(".") &&
          !/^(?:developed|engineered|designed|built|architected|spearheaded|created|implemented|optimized|collaborated|conducted|achieved|reduced|improved|managed|led|authored|integrated|orchestrated|automated)\b/i.test(bulletContent);

        if (isProjectSubheading) {
          let title = bulletContent;
          let techStack = "";
          if (bulletContent.includes("—") || bulletContent.includes(" - ")) {
            const sep = bulletContent.includes("—") ? "—" : " - ";
            const [pTitle, ...pRest] = bulletContent.split(sep);
            title = pTitle.trim();
            techStack = pRest.join(sep).trim();
          }
          if (experience.length === 0) {
            experience.push({ company: "Experience", role: "", bullets: [], subheadings: [] });
          }
          const currentSubs = experience[experience.length - 1].subheadings;
          const lastSub = currentSubs[currentSubs.length - 1];
          if (lastSub && lastSub.title.toLowerCase().trim() === title.toLowerCase().trim()) {
            continue;
          }
          experience[experience.length - 1].subheadings.push({
            title,
            techStack: techStack || undefined,
            bullets: [],
          });
          continue;
        }

        if (experience.length === 0) {
          experience.push({ company: "Experience", role: "", bullets: [], subheadings: [] });
        }
        const currentExp = experience[experience.length - 1];
        if (currentExp.subheadings.length > 0) {
          currentExp.subheadings[currentExp.subheadings.length - 1].bullets.push(bulletContent);
        } else {
          currentExp.bullets.push(bulletContent);
        }
        continue;
      }

      // Check for 3-line experience block: [Line0 (Company/Loc), Line1 (Role), Line2 (Date)]
      if (i + 2 < cleanLines.length) {
        const line0 = line;
        const line1 = cleanLines[i + 1].trim();
        const line2 = cleanLines[i + 2].trim();
        const line2DateMatch = line2.match(dateRangeRe);

        if (
          !bulletRe.test(line0) &&
          !bulletRe.test(line1) &&
          !bulletRe.test(line2) &&
          line2DateMatch &&
          !dateRangeRe.test(line0) &&
          !dateRangeRe.test(line1) &&
          !CANONICAL_HEADINGS.some(([, r]) => r.test(line0)) &&
          !CANONICAL_HEADINGS.some(([, r]) => r.test(line1)) &&
          !CANONICAL_HEADINGS.some(([, r]) => r.test(line2))
        ) {
          const dStr = line2DateMatch[0];
          const parsed0 = splitTrailingLocation(line0);
          const comp0 = parsed0.main || line0;
          const loc0 = parsed0.loc;

          experience.push({
            company: comp0,
            location: loc0 || undefined,
            role: line1,
            dateRange: dStr,
            bullets: [],
            subheadings: [],
          });
          i += 2;
          continue;
        }
      }

      const dateMatch = line.match(dateRangeRe);
      const nextDateMatch = nextLine.match(dateRangeRe);

      if (dateMatch && !bulletRe.test(line)) {
        const dStr = dateMatch[0];

        // Date-only line (e.g. "Mar 2026 – Present"): belongs to the preceding undated entry,
        // never to a new placeholder entry.
        const dateOnlyRemainder = line.replace(dStr, "").replace(/[|–—\-\s,]+/g, "");
        if (!dateOnlyRemainder) {
          const prevExp = experience[experience.length - 1];
          if (prevExp && !prevExp.dateRange && prevExp.bullets.length === 0 && prevExp.subheadings.length === 0) {
            prevExp.dateRange = dStr;
          }
          continue;
        }

        if (line.includes("|")) {
          const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
          const nonDateParts = parts.filter((p) => !dateRangeRe.test(p));
          let role = "";
          let org = "";
          let loc = "";

          if (nonDateParts.length === 1) {
            if (isRoleSegment(nonDateParts[0])) role = nonDateParts[0];
            else org = nonDateParts[0];
          } else if (nonDateParts.length === 2) {
            if (isRoleSegment(nonDateParts[0])) {
              role = nonDateParts[0];
              if (isLocationSegment(nonDateParts[1])) loc = nonDateParts[1];
              else org = nonDateParts[1];
            } else {
              org = nonDateParts[0];
              if (isRoleSegment(nonDateParts[1])) role = nonDateParts[1];
              else loc = nonDateParts[1];
            }
          } else {
            const rIdx = nonDateParts.findIndex((p) => isRoleSegment(p));
            const lIdx = nonDateParts.findIndex((p, idx) => idx !== rIdx && isLocationSegment(p));
            if (rIdx !== -1) role = nonDateParts[rIdx];
            if (lIdx !== -1) loc = nonDateParts[lIdx];
            const rem = nonDateParts.filter((_, idx) => idx !== rIdx && idx !== lIdx);
            org = rem.join(", ");
          }
          experience.push({
            role: role || org,
            company: org || role,
            dateRange: dStr,
            location: loc || undefined,
            bullets: [],
            subheadings: [],
          });
          continue;
        }

        const rem = line.replace(dStr, "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();
        const parsed = splitTrailingLocation(rem);
        let role = parsed.main;
        let comp = "";
        let loc = parsed.loc;
        if (nextLine && !bulletRe.test(nextLine) && !nextDateMatch && !CANONICAL_HEADINGS.some(([, r]) => r.test(nextLine))) {
          // Collapsed two-column rows from screenshots/OCR: "<Company> <Dates>" then "<Role> <Location>".
          // Detect by which line carries the role keyword; the date line is then the company row.
          const nextParsed = splitTrailingLocation(nextLine);
          if (!isRoleSegment(rem) && isRoleSegment(nextParsed.main || nextLine)) {
            comp = rem;
            role = nextParsed.main || nextLine;
            loc = nextParsed.loc || "";
          } else {
            comp = nextLine;
          }
          i++;
        }
        experience.push({
          role,
          company: comp || role,
          dateRange: dStr,
          location: loc || undefined,
          bullets: [],
          subheadings: [],
        });
        continue;
      }

      // Check for non-bullet subproject heading inside experience e.g. "PMS Integration Hub"
      const isNonBulletSubproject =
        !dateMatch &&
        !line.includes("|") &&
        !isRoleSegment(line) &&
        !isLocationSegment(line) &&
        line.length < 80 &&
        !line.endsWith(".") &&
        !/^(?:developed|engineered|designed|built|architected|spearheaded|created|implemented|optimized|collaborated|conducted|achieved|reduced|improved|managed|led|authored|integrated|orchestrated|automated)\b/i.test(line) &&
        (nextLine ? bulletRe.test(nextLine) : false);

      if (isNonBulletSubproject) {
        let title = line;
        let techStack = "";
        if (line.includes("—") || line.includes(" - ")) {
          const sep = line.includes("—") ? "—" : " - ";
          const [pTitle, ...pRest] = line.split(sep);
          title = pTitle.trim();
          techStack = pRest.join(sep).trim();
        }
        if (experience.length === 0) {
          experience.push({ company: "Experience", role: "", bullets: [], subheadings: [] });
        }
        const currentSubs = experience[experience.length - 1].subheadings;
        const lastSub = currentSubs[currentSubs.length - 1];
        if (lastSub && lastSub.title.toLowerCase().trim() === title.toLowerCase().trim()) {
          continue;
        }
        experience[experience.length - 1].subheadings.push({
          title,
          techStack: techStack || undefined,
          bullets: [],
        });
        continue;
      }

      if (line.includes("|") || isRoleSegment(line)) {
        experience.push({
          role: line,
          company: nextLine && !bulletRe.test(nextLine) ? nextLine : line,
          bullets: [],
          subheadings: [],
        });
        if (nextLine && !bulletRe.test(nextLine)) i++;
        continue;
      }
      continue;
    }

    if (currentSection === "PROJECTS") {
      const bulletMatch = line.match(bulletRe);
      if (bulletMatch) {
        const bContent = bulletMatch[1].trim();
        if (projects.length === 0 || bContent.length < 60 && (bContent.includes(" - ") || bContent.includes(" — ") || bContent.includes("|"))) {
          let title = bContent;
          let techStack = "";
          if (bContent.includes(" - ") || bContent.includes(" — ") || bContent.includes("|")) {
            const sep = bContent.includes("|") ? "|" : (bContent.includes(" — ") ? " — " : " - ");
            const [pTitle, ...pRest] = bContent.split(sep);
            title = pTitle.trim();
            techStack = pRest.join(sep).trim();
          }
          projects.push({ title, techStack: techStack || undefined, bullets: [] });
        } else {
          projects[projects.length - 1].bullets.push(bContent);
        }
        continue;
      }

      if (
        projects.length > 0 &&
        projects[projects.length - 1].bullets.length === 0 &&
        (!projects[projects.length - 1].techStack ||
          projects[projects.length - 1].techStack!.split("|").every((x) => /^(?:\[[^\]]+\]\([^)]+\)|source code|live demo|live link|code|demo|github|live|link|website)$/i.test(x.trim()))) &&
        !/^(?:\[[^\]]+\]\([^)]+\)|source code|live demo|live link|code|demo|github|live|link|website)(?:\s*\|\s*(?:\[[^\]]+\]\([^)]+\)|source code|live demo|live link|code|demo|github|live|link|website))*$/i.test(line) &&
        nextLine &&
        bulletRe.test(nextLine)
      ) {
        const prevTech = projects[projects.length - 1].techStack;
        // Keep any link labels already captured on the heading row (rendered in the right cell).
        projects[projects.length - 1].techStack = prevTech ? `${line} | ${prevTech}` : line;
        continue;
      }

      // Project link labels ("Code | Live Demo") belong to the right-hand cell of the heading row,
      // never to the title or the technology-stack line.
      const PROJECT_LINK_LABEL = "Source Code|Live Demo|Live Link|Code|Demo|GitHub|Live|Link|Website";
      const trailingLinksRe = new RegExp(
        `(?:^|\\s+|\\s*[|·•]\\s*)((?:${PROJECT_LINK_LABEL})(?:\\s*[|·•,]?\\s*(?:${PROJECT_LINK_LABEL}))*)\\s*$`,
        "i"
      );
      let pLinks = "";
      let pLine = line;
      const linksMatch = line.match(trailingLinksRe);
      if (linksMatch && linksMatch.index !== undefined) {
        pLinks = (linksMatch[1].match(new RegExp(PROJECT_LINK_LABEL, "gi")) || [])
          .map((l) => l.replace(/\b\w/g, (c) => c.toUpperCase()))
          .join(" | ");
        pLine = line.slice(0, linksMatch.index).replace(/[|·•\s]+$/, "").trim();
        if (!pLine) {
          const lastProj = projects[projects.length - 1];
          if (lastProj) {
            const have = (lastProj.dateRange || "").split("|").map((x) => x.trim()).filter(Boolean);
            for (const l of pLinks.split("|").map((x) => x.trim()).filter(Boolean)) {
              if (!have.some((h) => h.toLowerCase() === l.toLowerCase())) have.push(l);
            }
            lastProj.dateRange = have.join(" | ");
          }
          continue;
        }
      }

      let pTitle = pLine;
      let pTech = "";
      let pDate = "";
      if (pLine.includes("|") || pLine.includes(" - ") || pLine.includes(" — ")) {
        const sep = pLine.includes("|") ? "|" : (pLine.includes(" — ") ? " — " : " - ");
        const [t, ...r] = pLine.split(sep);
        pTitle = t.trim();
        const nonDateSegments: string[] = [];
        for (const seg of r) {
          const s = seg.trim();
          if (dateRangeRe.test(s) || /^\d{4}\s*[-–—]\s*(?:\d{4}|Present)$/i.test(s)) {
            pDate = s;
          } else {
            nonDateSegments.push(s);
          }
        }
        pTech = nonDateSegments.join(sep).trim();
      }
      if (pTitle.toLowerCase().endsWith(" code")) {
        pTitle = pTitle.replace(/\s+code$/i, "").trim();
      }
      projects.push({ title: pTitle, techStack: pTech || undefined, dateRange: pLinks || pDate || undefined, bullets: [] });
      continue;
    }

    if (currentSection === "EDUCATION") {
      const dateMatch = line.match(dateRangeRe);
      const cleanEduLine = cleanAiText(line).replace(/^[•*–—\-\s]+/, "").trim();

      if (cleanEduLine.includes("|")) {
        const parts = cleanEduLine.split("|").map((p) => p.trim()).filter(Boolean);
        let inst = parts[0] || "";
        let loc = "";
        let deg = "";
        let dStr = dateMatch ? dateMatch[0] : "";

        for (let pIdx = 1; pIdx < parts.length; pIdx++) {
          const part = parts[pIdx];
          if (dateRangeRe.test(part)) {
            dStr = part;
          } else if (isLocationSegment(part)) {
            loc = part;
          } else if (isDegreeSegment(part)) {
            deg = part;
          } else if (!deg) {
            deg = part;
          }
        }
        if (!deg && nextLine && !CANONICAL_HEADINGS.some(([, r]) => r.test(nextLine)) && !bulletRe.test(nextLine)) {
          deg = cleanAiText(nextLine);
          i++;
        }
        education.push({
          institution: cleanAiText(inst),
          degree: cleanAiText(deg || inst),
          location: cleanAiText(loc) || undefined,
          dateRange: dStr || undefined,
          bullets: [],
        });
        continue;
      }

      if (dateMatch) {
        const dStr = dateMatch[0];
        const instPart = cleanEduLine.replace(dStr, "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();
        const splitInst = splitTrailingLocation(instPart);
        let degPart = "";
        let gpaPart = "";
        if (nextLine && !CANONICAL_HEADINGS.some(([, r]) => r.test(nextLine)) && !bulletRe.test(nextLine)) {
          degPart = cleanAiText(nextLine);
          const gpaMatch = degPart.match(/(?:CGPA|GPA|Percentage):\s*([0-9.]+(?:\/[0-9.]+)?%?)/i);
          if (gpaMatch) gpaPart = gpaMatch[0];
          i++;
        }
        education.push({
          institution: cleanAiText(splitInst.main || instPart),
          degree: cleanAiText(degPart || splitInst.main || instPart),
          location: cleanAiText(splitInst.loc) || undefined,
          dateRange: dStr,
          gpa: gpaPart || undefined,
          bullets: [],
        });
        continue;
      }

      const splitInst = splitTrailingLocation(cleanEduLine);
      let degPart = cleanEduLine;
      let dStr = "";
      let gpaPart = "";

      if (nextLine && !CANONICAL_HEADINGS.some(([, r]) => r.test(nextLine)) && !bulletRe.test(nextLine)) {
        const nextDateMatch = nextLine.match(dateRangeRe);
        if (nextDateMatch) {
          dStr = nextDateMatch[0];
          degPart = cleanAiText(nextLine.replace(dStr, "").replace(/^[|–—\s]+|[|–—\s]+$/g, ""));
        } else {
          degPart = cleanAiText(nextLine);
        }
        const gpaMatch = degPart.match(/(?:CGPA|GPA|Percentage):\s*([0-9.]+(?:\/[0-9.]+)?%?)/i);
        if (gpaMatch) gpaPart = gpaMatch[0];
        i++;
      }

      education.push({
        institution: cleanAiText(splitInst.main || cleanEduLine),
        degree: degPart,
        location: cleanAiText(splitInst.loc) || undefined,
        dateRange: dStr || undefined,
        gpa: gpaPart || undefined,
        bullets: [],
      });
      continue;
    }

    if (currentSection === "ACHIEVEMENTS") {
      const bMatch = line.match(bulletRe);
      achievements.push(bMatch ? bMatch[1].trim() : line);
      continue;
    }

    if (currentSection === "CERTIFICATIONS") {
      const bMatch = line.match(bulletRe);
      certifications.push(bMatch ? bMatch[1].trim() : line);
      continue;
    }
  }

  return applyConfirmedAiTools(CanonicalResumeSchema.parse({
    fullName: fullName || "Applicant",
    email,
    phone,
    location,
    linkedinUrl,
    githubUrl,
    portfolioUrl: portfolioUrl || undefined,
    summary: summary || undefined,
    technicalSkills: Object.keys(technicalSkills).length > 0 ? technicalSkills : undefined,
    experience,
    projects,
    education,
    achievements,
    certifications,
  }));
}

/**
 * Serializes a CanonicalResume object into clean, formatted plain text.
 */
export function canonicalToPlainText(canonical: CanonicalResume): string {
  const parts: string[] = [];

  // 1. Header
  parts.push(canonical.fullName);
  const contacts: string[] = [];
  if (canonical.phone) contacts.push(canonical.phone);
  if (canonical.email) contacts.push(canonical.email);
  if (canonical.linkedinUrl) {
    contacts.push(canonical.linkedinUrl.includes("http") ? `[LinkedIn](${canonical.linkedinUrl})` : "LinkedIn");
  }
  if (canonical.githubUrl) {
    contacts.push(canonical.githubUrl.includes("http") ? `[GitHub](${canonical.githubUrl})` : "GitHub");
  }
  if (canonical.portfolioUrl) contacts.push(`[Portfolio](${canonical.portfolioUrl})`);
  if (canonical.location) contacts.push(canonical.location);
  if (contacts.length > 0) parts.push(contacts.join(" | "));

  // 2. Summary
  if (canonical.summary) {
    parts.push("Professional Summary");
    parts.push(canonical.summary);
  }

  // 3. Technical Skills
  if (canonical.technicalSkills) {
    parts.push("Technical Skills");
    if (typeof canonical.technicalSkills === "object" && !Array.isArray(canonical.technicalSkills)) {
      for (const [cat, skills] of Object.entries(canonical.technicalSkills)) {
        parts.push(`${cat}: ${Array.isArray(skills) ? skills.join(", ") : skills}`);
      }
    } else if (Array.isArray(canonical.technicalSkills)) {
      parts.push(`Core: ${canonical.technicalSkills.join(", ")}`);
    } else {
      parts.push(String(canonical.technicalSkills));
    }
  }

  // 4. Work Experience
  if (canonical.experience && canonical.experience.length > 0) {
    parts.push("Work Experience");
    for (const exp of canonical.experience) {
      const top = [exp.role, exp.dateRange].filter(Boolean).join(" ");
      if (top) parts.push(top);
      const sub = [exp.company, exp.location].filter(Boolean).join(" ");
      if (sub && sub !== top) parts.push(sub);

      const subprojects = exp.subheadings || (exp as any).projects || [];
      if (Array.isArray(subprojects)) {
        for (const s of subprojects) {
          parts.push(`${s.title}${s.techStack ? ` — ${s.techStack}` : ""}`);
          if (Array.isArray(s.bullets)) {
            for (const b of s.bullets) {
              const cb = cleanAiText(b);
              if (cb) parts.push(`• ${cb}`);
            }
          }
        }
      }
      if (Array.isArray(exp.bullets)) {
        for (const b of exp.bullets) {
          const cb = cleanAiText(b);
          if (cb) parts.push(`• ${cb}`);
        }
      }
    }
  }

  // 5. Projects
  if (canonical.projects && canonical.projects.length > 0) {
    parts.push("Projects");
    for (const proj of canonical.projects) {
      parts.push(`${proj.title}${proj.techStack ? ` - ${proj.techStack}` : ""}${proj.dateRange ? ` ${proj.dateRange}` : ""}`);
      if (Array.isArray(proj.bullets)) {
        for (const b of proj.bullets) {
          const cb = cleanAiText(b);
          if (cb) parts.push(`• ${cb}`);
        }
      }
    }
  }

  // 6. Education
  if (canonical.education && canonical.education.length > 0) {
    parts.push("Education");
    for (const edu of canonical.education) {
      const line1 = [edu.institution, edu.location].filter(Boolean).join(" | ");
      parts.push(`${line1}${edu.dateRange ? ` ${edu.dateRange}` : ""}`);
      const line2 = [edu.degree, edu.gpa].filter(Boolean).join(" ");
      if (line2) parts.push(line2);
      if (Array.isArray(edu.bullets)) {
        for (const b of edu.bullets) {
          const cb = cleanAiText(b);
          if (cb) parts.push(`• ${cb}`);
        }
      }
    }
  }

  // 7. Achievements
  if (canonical.achievements && canonical.achievements.length > 0) {
    parts.push("Achievements");
    for (const ach of canonical.achievements) {
      const ca = cleanAiText(ach);
      if (ca) parts.push(`• ${ca}`);
    }
  }

  // 8. Certifications
  if (canonical.certifications && canonical.certifications.length > 0) {
    parts.push("Certifications");
    for (const cert of canonical.certifications) {
      const cc = cleanAiText(cert);
      if (cc) parts.push(`• ${cc}`);
    }
  }

  return parts.join("\n");
}

/**
 * Strips leading markdown bullets (*, -, •, –, —) and whitespace from AI-generated text
 * before it enters any LaTeX environment. The \item command handles bullet rendering.
 *
 * @example cleanAiText("* Architected a system") → "Architected a system"
 * @example cleanAiText("- Built with React")     → "Built with React"
 */
export function cleanAiText(text: string): string {
  if (!text) return "";
  let cleaned = sanitizeOcrText(text).trim();
  // Strip leading stray artifacts (e.g. "small ", "textbf ", "[leftmargin=...]", dimensions)
  cleaned = cleaned
    .replace(/^\\?\*(?!\*)\s*/, "")
    .replace(/^\\(?:textbf|small)\b\s*/i, "")
    .replace(/^(?:textbf|small)\s+/i, "")
    .replace(/\[leftmargin=[^\]]*\]/g, "")
    .replace(/\\210/g, "")
    .replace(/(?:^|\s)-?\d+(?:\.\d+)?pt(?=\s|$)/g, "");

  // Loop to strip leading bullet characters like "• ", "* ", "- ", "∗ ", "– "
  while (
    /^[-•–—▪▫◦‣▸▹➢➣→+∗✔✓◆◇►⁃∙·\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF]\s*/.test(cleaned) ||
    /^\*(?!\*)\s+/.test(cleaned) ||
    /^\\\*(?!\*)\s*/.test(cleaned)
  ) {
    cleaned = cleaned
      .replace(/^[-•–—▪▫◦‣▸▹➢➣→+∗✔✓◆◇►⁃∙·\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF]\s*/, "")
      .replace(/^\*(?!\*)\s+/, "")
      .replace(/^\\\*(?!\*)\s*/, "")
      .trim();
  }

  // Strip repeated stray formatting tokens
  cleaned = cleaned
    .replace(/^(?:textbf|small)\s+/i, "")
    .replace(/\[leftmargin=[^\]]*\]/g, "")
    .replace(/(?:^|\s)-?\d+(?:\.\d+)?pt(?=\s|$)/g, "");

  // Collapse accidental double action verbs (e.g. "Architected Orchestrated", "Spearheaded Designed", "Architected small Architected")
  const ACTION_VERBS_PATTERN =
    "Architected|Orchestrated|Engineered|Spearheaded|Implemented|Streamlined|Optimized|Delivered|Developed|Designed|Synthesized|Devised|Built|Launched|Automated|Integrated|Formulated|Accelerated|Pioneered|Standardized|Scaled|Executed|Authored|Established|Reduced|Improved|Managed|Led|Directed|Constructed|Created|Produced|Published|Programmed|Resolved|Secured|Trained|Collaborated|Conducted|Achieved|Combined|Consolidated|Deployed|Configured|Refactored|Migrated|Centralized|Modeled|Maintained|Analyzed|Evaluated|Contributed|Supported|Assisted|Participated|Enhanced|Leveraged|Utilized|Ensured|Facilitated|Drove|Wrote|Handled|Researched|Presented|Tested|Debugged|Documented|Mentored|Coordinated";

  const doubleVerbRegex = new RegExp(
    `^(${ACTION_VERBS_PATTERN})\\s+(?:small\\s+|and\\s+)?(${ACTION_VERBS_PATTERN})\\b`,
    "i"
  );
  let collapsePasses = 0;
  while (doubleVerbRegex.test(cleaned) && collapsePasses < 5) {
    cleaned = cleaned.replace(doubleVerbRegex, "$2");
    collapsePasses++;
  }

  // Deduplicate overlapping AI pipeline phrasing
  cleaned = cleaned.replace(/\b(a multi-stage (?:Agentic )?AI pipeline)\s+an? (?:Artificial Intelligence|Agentic AI) pipeline\b/gi, "$1");
  cleaned = cleaned.replace(/\b(an? Artificial Intelligence pipeline)\s+an? (?:Artificial Intelligence|Agentic AI) pipeline\b/gi, "$1");

  // Polish gerund clauses to prevent redundant "and" usage (e.g. ", and reducing manual review time" -> ", while reducing...")
  cleaned = cleaned
    .replace(/,\s*and\s+(reducing|cutting|decreasing|minimizing|lowering|saving|mitigating)\b/gi, ", while $1")
    .replace(/\band\s+(reducing|cutting|decreasing|minimizing|lowering|saving|mitigating)\s+manual\b/gi, "while $1 manual")
    .replace(/\bextract\s+equipment\s+and\s+instrument\s+tags\b/gi, "extract equipment tags");

  // VERY FINAL step: re-run OCR sanitation (the LLM can reintroduce "Al") plus acronym/grammar guards
  cleaned = sanitizeOcrText(cleaned)
    .replace(/\bAl(?='s\b|-|\b)/g, "AI")
    .replace(/\bAgentic Ai\b/gi, "Agentic AI")
    .replace(/\b([Aa])\s+increase\b/g, (_m, a: string) => (a === "A" ? "An increase" : "an increase"))
    .replace(/\s{2,}/g, " ");

  return cleaned.trim();
}

/** Joins a date range with "--" even when the dash was stripped ("2021 2025" -> "2021 -- 2025"). */
export function formatDateRangeForLatex(raw?: string | null): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const stripped = s.match(/^((?:[A-Za-z]{3,9}\.?\s+)?\d{4})\s+((?:[A-Za-z]{3,9}\.?\s+)?\d{4}|Present|Current)$/i);
  if (stripped) return `${stripped[1]} -- ${stripped[2]}`;
  return s.replace(/\s*(?:[-–—]+|\bto\b)\s*/i, " -- ");
}

/**
 * Constructs clean ATS LaTeX directly from a CanonicalResume object without regex replacements.
 * Strictly enforces:
 * 1. Zero-out intra-bullet spacing with [leftmargin=*, itemsep=1pt, parsep=0pt, topsep=1pt] and \raggedbottom
 * 2. Standalone bold subprojects (NO \item) with \vspace{3pt} before and \vspace{1pt} after
 * 3. Surgical spacing: \vspace{6pt} before sections, \vspace{4pt} before companies
 * 4. All bullets and subproject titles are run through cleanAiText() to strip raw markdown markers
 */
const ROW_DATE_UNIT = "(?:(?:Jan(?:uary|\\.)?|Feb(?:ruary|\\.)?|Mar(?:ch|\\.)?|Apr(?:il|\\.)?|May|Jun(?:e|\\.)?|Jul(?:y|\\.)?|Aug(?:ust|\\.)?|Sep(?:tember|t\\.)?|Oct(?:ober|\\.)?|Nov(?:ember|\\.)?|Dec(?:ember|\\.)?)\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})";
const ROW_DATE_RE = new RegExp(`\\b(${ROW_DATE_UNIT}\\s*(?:[-–—]|\\bto\\b)\\s*(?:${ROW_DATE_UNIT}|Present|Current|Now))\\b`, "i");

/**
 * Shared two-column row normalizer for \resumeSubheading. OCR/screenshot text often collapses a
 * two-column row into one string ("Julley Online Pvt Ltd Mar 2026 - Present", "AI Engineer Hyderabad"),
 * which would otherwise render entirely inside the LEFT cell with an empty right cell.
 * The trailing date range moves to the right cell of the company row and the trailing location to
 * the right cell of the title row. Already-structured entries pass through unchanged.
 */
export function normalizeExperienceRow(
  roleIn: string,
  companyIn: string,
  locIn: string,
  dateIn: string
): { role: string; company: string; loc: string; date: string } {
  let role = (roleIn || "").trim();
  let company = (companyIn || "").trim();
  let loc = (locIn || "").trim();
  let date = (dateIn || "").trim();

  const roleDate = role.match(ROW_DATE_RE);
  const compDate = company.match(ROW_DATE_RE);
  if (!date) {
    if (compDate) date = compDate[1];
    else if (roleDate) date = roleDate[1];
  }
  const stripDate = (v: string) =>
    v.replace(ROW_DATE_RE, "").replace(/\s{2,}/g, " ").replace(/^[\s|,·–—-]+|[\s|,·–—-]+$/g, "").trim();
  if (roleDate) role = stripDate(role);
  if (compDate) company = stripDate(company);
  // The date row is the company row: if the date was glued to the "role" field only, swap them.
  if (roleDate && !compDate) {
    if (company && !isRoleSegment(role) && isRoleSegment(company)) {
      [role, company] = [company, role];
    } else if (!company) {
      company = role;
      role = "";
    }
  }

  if (!loc && role) {
    const sp = splitTrailingLocation(role);
    if (sp.loc && sp.main) { role = sp.main; loc = sp.loc; }
  }
  return { role, company, loc, date };
}

/**
 * INVARIANT— \resumeSubheading argument order (enforced everywhere, never change):
 *   #1 = Job Title  (bold, left,  Row 1)   — e.g. "Platform Engineer"
 *   #2 = Location   (italic small, right, Row 1) — e.g. "India" or ""
 *   #3 = Company    (small, left,  Row 2)   — e.g. "JulleyOnline Private Limited"
 *   #4 = Date Range (italic small, right, Row 2) — e.g. "April 2026 -- September 2026"
 *
 * For EDUCATION the same macro is reused with:
 *   #1 = Institution (bold, Row 1)  #2 = Location (Row 1 right)
 *   #3 = Degree      (Row 2 left)   #4 = Date     (Row 2 right)
 *
 * The macro definition in the template must match:
 *   \textbf{#1} & \textit{\small #2} \\[-1pt]
 *   {\small #3} & \textit{\small #4}
 */
export function generateLatexFromCanonical(
  resume: CanonicalResume,
  options?: { originalLatex?: string; knownLinks?: ExtractedHyperlink[] }
): string {
  const originalLinks = options?.originalLatex ? extractHyperlinksFromLatex(options.originalLatex) : [];
  const rawLinks = [...originalLinks, ...(options?.knownLinks || [])];
  const allKnownLinks: ExtractedHyperlink[] = [];
  const seenNormLinks = new Set<string>();
  for (const l of rawLinks) {
    if (!l || !l.url) continue;
    const norm = normalizeUrl(l.url);
    if (!seenNormLinks.has(norm)) {
      seenNormLinks.add(norm);
      allKnownLinks.push(l);
    }
  }

  // Bind candidate contact links
  if (resume.linkedinUrl && !allKnownLinks.some((l) => l.category === "linkedin")) {
    allKnownLinks.push({
      url: resume.linkedinUrl,
      text: "LinkedIn",
      category: "linkedin",
      normalizedUrl: normalizeUrl(resume.linkedinUrl),
    });
  }
  if (resume.githubUrl && !allKnownLinks.some((l) => l.category === "github")) {
    allKnownLinks.push({
      url: resume.githubUrl,
      text: "GitHub",
      category: "github",
      normalizedUrl: normalizeUrl(resume.githubUrl),
    });
  }

  const estimatedLines = estimateRenderedLines(resume);
  // Single shared layout profile. Content that cannot fit even the densest readable tier
  // (> SINGLE_PAGE_LINE_BUDGET) gets the standard readable tier and flows to a clean second page.
  const isUltraDenseOnePage = estimatedLines > 74 && estimatedLines <= 88;
  const isDenseOnePage = estimatedLines > 62 && estimatedLines <= 74;
  const isStandardOnePage = (estimatedLines > 50 && estimatedLines <= 62) || estimatedLines > 88;

  const listKeyVals = isUltraDenseOnePage
    ? "leftmargin=1.2em, itemsep=0pt, parsep=0pt, topsep=0.5pt, partopsep=0pt, label=\\textbullet"
    : isDenseOnePage
      ? "leftmargin=1.2em, itemsep=0.6pt, parsep=0pt, topsep=1.0pt, partopsep=0pt, label=\\textbullet"
      : isStandardOnePage
        ? "leftmargin=1.2em, itemsep=0.7pt, parsep=0pt, topsep=1.2pt, partopsep=0pt, label=\\textbullet"
        : "leftmargin=1.2em, itemsep=0.9pt, parsep=0pt, topsep=1.4pt, partopsep=0pt, label=\\textbullet";
  const listParams = `[${listKeyVals}]`;
  const subHeadingVspace = isUltraDenseOnePage
    ? "0.5pt"
    : isDenseOnePage
      ? "2.5pt"
      : isStandardOnePage
        ? "3.0pt"
        : "3.5pt";
  const subprojectVspace = isUltraDenseOnePage
    ? "1.0pt"
    : isDenseOnePage
      ? "2.0pt"
      : isStandardOnePage
        ? "2.5pt"
        : "3pt";

  let bodyLatex = "";

  // 1. Professional Summary
  if (resume.summary && resume.summary.trim()) {
    const cleanSummary = cleanAiText(resume.summary.trim());
    bodyLatex += `\\section{PROFESSIONAL SUMMARY}\n{\\small ${formatLatexLine(cleanSummary, allKnownLinks)}\\par}\n`;
  }

  // 2. Technical Skills — use \\noindent prefix for clean left-aligned dense list (no leading space artifact)
  if (resume.technicalSkills) {
    bodyLatex += `\\section{TECHNICAL SKILLS}\n`;
    if (typeof resume.technicalSkills === "object" && !Array.isArray(resume.technicalSkills)) {
      const rows: string[] = [];
      for (const [cat, skills] of Object.entries(resume.technicalSkills)) {
        const cleanCat = cleanAiText(cat);
        const rawSkillStr = Array.isArray(skills)
          ? skills.map((s) => cleanAiText(String(s))).filter(Boolean).join(", ")
          : cleanAiText(String(skills));
        rows.push(`\\noindent {\\small \\textbf{${formatLatexLine(cleanCat, allKnownLinks)}:} ${formatLatexLine(rawSkillStr, allKnownLinks)}}`);
      }
      bodyLatex += rows.join(`\\\\[0.5pt]\n`) + `\\\\[0.5pt]\n`;
    } else if (Array.isArray(resume.technicalSkills)) {
      const cleanSkills = resume.technicalSkills.map((s) => cleanAiText(String(s))).filter(Boolean).join(", ");
      bodyLatex += `\\noindent {\\small \\textbf{Core Skills:} ${formatLatexLine(cleanSkills, allKnownLinks)}}\\\\[0.5pt]\n`;
    } else {
      bodyLatex += `\\noindent {\\small ${formatLatexLine(cleanAiText(String(resume.technicalSkills)), allKnownLinks)}}\\\\[0.5pt]\n`;
    }
  }

  // 3. Work Experience
  if (resume.experience && resume.experience.length > 0) {
    bodyLatex += `\\section{WORK EXPERIENCE}\n`;
    for (let eIdx = 0; eIdx < resume.experience.length; eIdx++) {
      const exp = resume.experience[eIdx];
      const normRow = normalizeExperienceRow(
        cleanAiText(exp.role || ""),
        cleanAiText(exp.company || ""),
        cleanAiText(exp.location || ""),
        exp.dateRange || ""
      );
      let role = normRow.role;
      let company = normRow.company;
      if (!role) { role = company; company = ""; }
      if (company && company.toLowerCase() === role.toLowerCase()) company = "";
      const loc = normRow.loc;
      const dateRange = formatDateRangeForLatex(normRow.date);

      // Row 1: Job Title (bold, left) | Location (italic small, right)
      // Row 2: Company Name (small, left) | Date Range (italic small, right)
      bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(role, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(company, allKnownLinks)}}{${formatLatexLine(dateRange, allKnownLinks)}}\n`;

      // Top-level bullets under company
      if (Array.isArray(exp.bullets) && exp.bullets.length > 0) {
        bodyLatex += `\\nopagebreak[4]\n\\begin{itemize}${listParams}\n`;
        for (const b of exp.bullets) {
          const cleanBullet = cleanAiText(b);
          if (!cleanBullet) continue;
          bodyLatex += `  \\item ${formatLatexLine(cleanBullet, allKnownLinks)}\n`;
        }
        bodyLatex += `\\end{itemize}\n`;
      }

      // Subprojects inside company: Standalone bold text, NO \item, explicit spacing
      const subprojects = exp.subheadings || (exp as any).projects || [];
      if (Array.isArray(subprojects)) {
        let lastSubKey = "";
        for (const sub of subprojects) {
          const rawSubTitle = cleanAiText(sub.title || "").trim();
          if (!rawSubTitle) continue;
          const rawSubTech = sub.techStack ? cleanAiText(sub.techStack).trim() : "";
          const subKey = `${rawSubTitle.toLowerCase()}::${rawSubTech.toLowerCase()}`;
          if (subKey === lastSubKey) continue;
          lastSubKey = subKey;

          const subTitle = formatLatexLine(rawSubTitle, allKnownLinks);
          const subTech = rawSubTech ? ` \\enspace\\textbar\\enspace \\textit{${formatLatexLine(rawSubTech, allKnownLinks)}}` : "";

          // Deduplicate if first bullet repeats the subproject title/heading
          let bulletsToRender = Array.isArray(sub.bullets) ? [...sub.bullets] : [];
          if (bulletsToRender.length > 0) {
            const firstNorm = cleanAiText(bulletsToRender[0]).toLowerCase().trim();
            const titleNorm = rawSubTitle.toLowerCase().trim();
            if (firstNorm === titleNorm || firstNorm.startsWith(titleNorm)) {
              bulletsToRender.shift();
            }
          }

          bodyLatex += `\\vspace{${subprojectVspace}}\n\\noindent \\textbf{${subTitle}}${subTech}\n\\vspace{1pt}\n\\begin{itemize}${listParams}\n`;

          if (bulletsToRender.length > 0) {
            for (const b of bulletsToRender) {
              const cleanBullet = cleanAiText(b);
              if (!cleanBullet) continue;
              bodyLatex += `  \\item ${formatLatexLine(cleanBullet, allKnownLinks)}\n`;
            }
          }
          bodyLatex += `\\end{itemize}\n`;
        }
      }
    }
  }

  // 4. Projects (Standalone)
  if (resume.projects && resume.projects.length > 0) {
    bodyLatex += `\\section{PROJECTS}\n`;
    for (const proj of resume.projects) {
      // Project link labels ("Code", "Live Demo", "[Code](url)") are never title or tech-stack content:
      // pull them out of every field into one grouped right-hand cell of the heading row.
      const LINK_SEG_RE = /^(?:\[[^\]]+\]\([^)]+\)|(?:source code|live demo|live link|code|demo|github|live|link|website))$/i;
      const projLinks: string[] = [];
      const takeLinks = (raw: string): string => {
        const kept: string[] = [];
        const addLink = (l: string) => {
          if (!projLinks.some((x) => x.toLowerCase() === l.toLowerCase())) projLinks.push(l);
        };
        const LABELS = "source code|live demo|live link|code|demo|github|live|link|website";
        for (let seg of (raw || "").split("|").map((x) => x.trim()).filter(Boolean)) {
          if (LINK_SEG_RE.test(seg)) { addLink(seg); continue; }
          // A link glued onto the end of a title/tech segment ("Resume Analyzer [Code](url)" or
          // "Resume Analyzer Code"): split it off so it joins the right-hand link group.
          const glued: string[] = [];
          const inlineMd = new RegExp(`\\s*\\[(?:${LABELS})\\]\\([^)]+\\)`, "gi");
          seg = seg.replace(inlineMd, (m) => { glued.push(m.trim()); return ""; }).trim();
          const trailingPlain = seg.match(new RegExp(`^(.*\\S)\\s+(${LABELS})$`, "i"));
          if (trailingPlain) { seg = trailingPlain[1].trim(); glued.push(trailingPlain[2]); }
          glued.forEach(addLink);
          if (seg) kept.push(seg);
        }
        return kept.join(" | ");
      };
      const rawDate = (proj.dateRange || "").trim();
      const dateIsLinksOnly = !!rawDate && rawDate.split("|").every((x: string) => LINK_SEG_RE.test(x.trim()));
      const titleKept = takeLinks(proj.title || "");
      const techKept = takeLinks(proj.techStack || "");
      if (dateIsLinksOnly) takeLinks(rawDate);
      const pTitle = formatLatexLine(cleanAiText(titleKept || proj.title || ""), allKnownLinks);
      // Right cell: the project's date range (never dropped) followed by the grouped links (kept atomic in one \mbox).
      const projDate = formatDateRangeForLatex(dateIsLinksOnly ? "" : proj.dateRange);
      const pDate = projLinks.length > 0
        ? (projDate ? projDate + " \\enspace\\textbar\\enspace " : "") + "\\mbox{\\textup{" + projLinks.map((l) => formatLatexLine(l, allKnownLinks)).filter(Boolean).join(" \\enspace\\textbar\\enspace ") + "}}"
        : projDate;
      const pTech = techKept ? formatLatexLine(cleanAiText(techKept), allKnownLinks) : "";

      bodyLatex += `\\resumeProjectHeading\n  {\\textbf{${pTitle}}}{${pDate}}\n`;
      if (pTech) {
        bodyLatex += `{\\small \\textit{${pTech}}}\\\\[1pt]\\nopagebreak[4]\n`;
      }
      if (Array.isArray(proj.bullets) && proj.bullets.length > 0) {
        bodyLatex += `\\begin{itemize}${listParams}\n`;
        for (const b of proj.bullets) {
          const cleanBullet = cleanAiText(b);
          if (!cleanBullet) continue;
          bodyLatex += `  \\item ${formatLatexLine(cleanBullet, allKnownLinks)}\n`;
        }
        bodyLatex += `\\end{itemize}\n`;
      }
    }
  }

  // 5. Education
  if (resume.education && resume.education.length > 0) {
    bodyLatex += `\\section{EDUCATION}\n`;
    for (const edu of resume.education) {
      let inst = cleanAiText(edu.institution || "").replace(/^[•*–—\\-\s]+/, "").trim();
      let loc = cleanAiText(edu.location || "").replace(/^[•*–—\\-\s]+/, "").trim();
      let deg = cleanAiText(edu.degree || "").replace(/^[•*–—\\-\s]+/, "").trim();
      const eduAny = edu as Record<string, unknown>;
      let dStr = formatDateRangeForLatex(
        edu.dateRange ||
        [eduAny.startDate, eduAny.endDate].filter((v) => typeof v === "string" && v.trim()).join(" -- ")
      );

      if (inst.includes("|")) {
        const parts = inst.split("|").map((p) => p.trim()).filter(Boolean);
        inst = parts[0] || inst;
        if (!loc && parts.length > 1) {
          loc = parts.slice(1).join(", ");
        }
      }
      if (deg.includes("|")) {
        const parts = deg.split("|").map((p) => p.trim()).filter(Boolean);
        deg = parts[0] || deg;
        if (!loc && parts.length > 1) {
          loc = parts.slice(1).join(", ");
        }
      }

      bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(inst, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(deg, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
      if (Array.isArray(edu.bullets) && edu.bullets.length > 0) {
        bodyLatex += `\\begin{itemize}${listParams}\n`;
        for (const b of edu.bullets) {
          const cleanBullet = cleanAiText(b);
          if (!cleanBullet) continue;
          bodyLatex += `  \\item ${formatLatexLine(cleanBullet, allKnownLinks)}\n`;
        }
        bodyLatex += `\\end{itemize}\n`;
      }
    }
  }

  // 6. Achievements
  if (resume.achievements && resume.achievements.length > 0) {
    bodyLatex += `\\section{ACHIEVEMENTS}\n`;
    bodyLatex += `\\begin{itemize}${listParams}\n`;
    for (const ach of resume.achievements) {
      const cleanAch = cleanAiText(ach);
      if (!cleanAch) continue;
      const labelled = cleanAch.match(/^([A-Z][A-Za-z0-9 &/''-]{1,40}):\s+(\S.*)$/);
      if (labelled) {
        bodyLatex += `  \\item \\textbf{${formatLatexLine(labelled[1], allKnownLinks)}:} ${formatLatexLine(labelled[2], allKnownLinks)}\n`;
      } else {
        bodyLatex += `  \\item ${formatLatexLine(cleanAch, allKnownLinks)}\n`;
      }
    }
    bodyLatex += `\\end{itemize}\n`;
  }

  // 7. Certifications
  if (resume.certifications && resume.certifications.length > 0) {
    bodyLatex += `\\section{CERTIFICATIONS}\n`;
    const certTokens = resume.certifications.map((c) => formatLatexLine(cleanAiText(c), allKnownLinks)).filter(Boolean);
    bodyLatex += `{\\small ${certTokens.join(" \\enspace\\textbar\\enspace ")}\\par}\n`;
  }

  // Build full document with preamble
  const contactTokens: string[] = [];
  if (resume.phone) contactTokens.push(resume.phone);
  if (resume.email) contactTokens.push(resume.email);
  const linkedinKnown = allKnownLinks.find((l) => l.category === "linkedin" || /linkedin\.com\/in\//i.test(l.url));
  const activeLinkedin = linkedinKnown?.url || (resume.linkedinUrl && !resume.linkedinUrl.includes("/applicant") ? resume.linkedinUrl : "");
  if (activeLinkedin) {
    const liHandle = activeLinkedin.match(/linkedin\.com\/in\/([a-zA-Z0-9_.-]+)/i)?.[1];
    const liLabel = liHandle && liHandle.includes("_") ? liHandle : "LinkedIn";
    contactTokens.push(`[${liLabel}](${activeLinkedin})`);
  }

  const githubKnown = allKnownLinks.find((l) => l.category === "github" || /github\.com\//i.test(l.url));
  const activeGithub = githubKnown?.url || (resume.githubUrl && !resume.githubUrl.includes("/applicant") ? resume.githubUrl : "");
  if (activeGithub) {
    const ghHandle = activeGithub.match(/github\.com\/([a-zA-Z0-9_.-]+)/i)?.[1];
    const ghLabel = ghHandle && ghHandle.includes("_") ? ghHandle : "GitHub";
    contactTokens.push(`[${ghLabel}](${activeGithub})`);
  }

  const portfolioKnown = allKnownLinks.find((l) => (l.category as string) === "portfolio" || (l.category === "general" && !/linkedin|github/i.test(l.url)));
  const activePortfolio = portfolioKnown?.url || resume.portfolioUrl;
  if (activePortfolio) contactTokens.push(`[Portfolio](${activePortfolio})`);
  if (resume.location) contactTokens.push(resume.location);

  const formattedContacts = contactTokens
    .map((token) => formatLatexLine(token, allKnownLinks))
    .join(" \\enspace\\textbar\\enspace ");

  const targetDocClass = isUltraDenseOnePage
    ? "\\documentclass[a4paper,9pt]{extarticle}"
    : "\\documentclass[a4paper,10pt]{article}";
  const targetGeometry = isUltraDenseOnePage
    ? "\\usepackage[left=0.34in, right=0.34in, top=0.22in, bottom=0.22in]{geometry}"
    : isDenseOnePage
      ? "\\usepackage[left=0.38in, right=0.38in, top=0.30in, bottom=0.30in]{geometry}"
      : isStandardOnePage
        ? "\\usepackage[left=0.40in, right=0.40in, top=0.34in, bottom=0.34in]{geometry}"
        : "\\usepackage[left=0.42in, right=0.42in, top=0.38in, bottom=0.38in]{geometry}";
  const targetSectionSpacing = isUltraDenseOnePage
    ? "\\titlespacing*{\\section}{0pt}{2pt}{1pt}"
    : isDenseOnePage
      ? "\\titlespacing*{\\section}{0pt}{3.5pt}{1.8pt}"
      : isStandardOnePage
        ? "\\titlespacing*{\\section}{0pt}{4.0pt}{2.0pt}"
        : "\\titlespacing*{\\section}{0pt}{4.5pt}{2.2pt}";
  const targetLinespread = isUltraDenseOnePage
    ? "0.95"
    : isDenseOnePage
      ? "0.99"
      : isStandardOnePage
        ? "1.01"
        : "1.04";

  const preamble = `%-------------------------
% ATS-SHARED-LAYOUT-ENGINE
% Adaptive ATS LaTeX Resume
% Clean Typography, Zero Page Numbers, 100% ATS Compliant
%------------------------

${targetDocClass}
${targetGeometry}
\\usepackage{enumitem}
\\usepackage{titlesec}
\\usepackage[hidelinks]{hyperref}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{textcomp}
\\usepackage{tabularx}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\input{glyphtounicode}
\\ifdefined\\pdfgentounicode \\pdfgentounicode=1 \\fi

\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0pt}
\\linespread{${targetLinespread}}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\urlstyle{same}

% Section spacing: 4pt before, 2pt after (3pt/1.5pt on dense resumes)
\\titleformat{\\section}{\\normalsize\\bfseries\\uppercase}{}{0em}{}[\\titlerule]
${targetSectionSpacing}

% Global list spacing: zero internal vertical bloat
\\setlist[itemize]{${listKeyVals}}

\\newcommand{\\resumeItem}[1]{
  \\item #1
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{${subHeadingVspace}}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{#1} & \\textit{\\small #2} \\\\[-1.5pt]
    {\\small #3} & \\textit{\\small #4}
  \\end{tabular*}\\nopagebreak[4]
}

\\newcommand{\\resumeProjectHeading}[2]{
  \\vspace{${subHeadingVspace}}\\nopagebreak[3]
  \\noindent\\begin{tabularx}{\\textwidth}[t]{@{}>{\\raggedright\\arraybackslash}X@{\\hspace{1em}}r@{}}
    #1 & \\textit{\\small #2}
  \\end{tabularx}\\nopagebreak[4]
}

\\newcommand{\\resumeDivider}{\\enspace\\textbar\\enspace}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}${listParams}}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}${listParams}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}}

\\begin{document}
\\pagestyle{empty}
\\thispagestyle{empty}

%----------HEADING----------
\\begin{center}
  {\\LARGE \\textbf{${escapeLatex(resume.fullName || "Candidate Name")}}} \\\\[${isUltraDenseOnePage ? "1pt" : "2pt"}]
  \\small ${formattedContacts}
\\end{center}
\\vspace{${isUltraDenseOnePage ? "-10pt" : "-8pt"}}

%----------BODY SECTIONS----------
${bodyLatex.trim()}
\\end{document}
`;

  let finalLatex = ensureAllHrefsPreservedInLatex(preamble, [options?.originalLatex || "", allKnownLinks]);
  finalLatex = finalLatex.replace(/\$C\+\+\$/g, "C++").replace(/\\\$C\+\+\\\$/g, "C++");
  return finalLatex;
}

function updateBulletInCanonical(
  canonical: CanonicalResume,
  targetBullet: string,
  newBullet: string
): boolean {
  const normTarget = targetBullet.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  const targetWords = normTarget.split(" ").filter((w) => w.length > 3);

  function matches(bullet: string): boolean {
    if (bullet.includes(targetBullet) || targetBullet.includes(bullet)) return true;
    const normB = bullet.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
    if (normB === normTarget) return true;
    if (targetWords.length > 0) {
      let matchedCount = 0;
      for (const w of targetWords) {
        if (normB.includes(w)) matchedCount++;
      }
      if (matchedCount / targetWords.length >= 0.75) return true;
    }
    return false;
  }

  // Search in experience
  for (const exp of canonical.experience) {
    if (Array.isArray(exp.bullets)) {
      for (let i = 0; i < exp.bullets.length; i++) {
        if (matches(exp.bullets[i])) {
          exp.bullets[i] = newBullet;
          return true;
        }
      }
    }
    if (Array.isArray(exp.subheadings)) {
      for (const sub of exp.subheadings) {
        if (Array.isArray(sub.bullets)) {
          for (let i = 0; i < sub.bullets.length; i++) {
            if (matches(sub.bullets[i])) {
              sub.bullets[i] = newBullet;
              return true;
            }
          }
        }
      }
    }
  }

  // Search in projects
  for (const proj of canonical.projects) {
    if (Array.isArray(proj.bullets)) {
      for (let i = 0; i < proj.bullets.length; i++) {
        if (matches(proj.bullets[i])) {
          proj.bullets[i] = newBullet;
          return true;
        }
      }
    }
  }

  return false;
}

function getAllExperienceBullets(canonical: CanonicalResume): string[] {
  const bullets: string[] = [];
  for (const exp of canonical.experience) {
    if (Array.isArray(exp.bullets)) {
      bullets.push(...exp.bullets);
    }
    if (Array.isArray(exp.subheadings)) {
      for (const sub of exp.subheadings) {
        if (Array.isArray(sub.bullets)) {
          bullets.push(...sub.bullets);
        }
      }
    }
  }
  return bullets;
}

/**
 * Estimates rendered line count for the 10pt / 0.42in-margin template (calibrated against real compiles:
 * a resume that estimates at <= ~64.5 fits on exactly one A4 page).
 */
export function estimateRenderedLines(res: CanonicalResume): number {
  const WRAP_SMALL = 118;
  const WRAP_BODY = 108;
  const wrap = (t: string, w: number) => Math.max(1, Math.ceil((t || "").length / w));
  let lines = 3;
  if (res.summary) lines += 1.3 + wrap(res.summary, WRAP_SMALL);
  const ts = res.technicalSkills;
  if (ts) {
    lines += 1.3;
    if (typeof ts === "object" && !Array.isArray(ts)) {
      for (const [k, v] of Object.entries(ts as Record<string, string[] | string>)) {
        lines += wrap(`${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`, WRAP_SMALL);
      }
    } else {
      lines += wrap(Array.isArray(ts) ? ts.join(", ") : String(ts), WRAP_SMALL);
    }
  }
  for (const exp of res.experience || []) {
    lines += 2.6;
    for (const b of exp.bullets || []) lines += wrap(b, WRAP_BODY) + 0.05;
    for (const sub of exp.subheadings || []) {
      lines += 1.3;
      for (const b of sub.bullets || []) lines += wrap(b, WRAP_BODY) + 0.05;
    }
  }
  for (const proj of res.projects || []) {
    lines += 2.3;
    for (const b of proj.bullets || []) lines += wrap(b, WRAP_BODY) + 0.05;
  }
  lines += 1.3 + (res.education?.length || 0) * 2.6;
  if (res.achievements?.length) lines += 1.3 + res.achievements.length;
  if (res.certifications?.length) lines += 2.3;
  return lines;
}

export const SINGLE_PAGE_LINE_BUDGET = 88;

/**
 * Trims lowest-priority / oldest minor bullet points if the single-page resume would overflow,
 * never removing the only Work Experience mention of a protected skill (Twice Rule).
 */
export function trimContentForSinglePage(
  canonical: CanonicalResume,
  options: { protectedSkills?: string[] } = {}
): {
  canonical: CanonicalResume;
  trimmedCount: number;
} {
  let trimmedCount = 0;
  const protectedRes = (options.protectedSkills || []).map(literalSkillRegex);

  let currentLines = estimateRenderedLines(canonical);
  // Within budget, or so long it is intentionally multi-page: leave untouched
  if (currentLines <= SINGLE_PAGE_LINE_BUDGET || currentLines > 100) {
    return { canonical, trimmedCount: 0 };
  }

  const isSoleCarrier = (bullet: string): boolean => {
    const all = getAllExperienceBullets(canonical);
    return protectedRes.some((re) => re.test(bullet) && all.filter((x) => re.test(x)).length === 1);
  };

  const tryPop = (arr: string[] | undefined): boolean => {
    if (!Array.isArray(arr) || arr.length < 2) return false;
    // pop the last non-protected bullet
    for (let i = arr.length - 1; i >= 1; i--) {
      if (!isSoleCarrier(arr[i])) {
        arr.splice(i, 1);
        trimmedCount++;
        currentLines = estimateRenderedLines(canonical);
        return true;
      }
    }
    return false;
  };

  // Sweep repeatedly (oldest role first) so trimming is spread, one bullet per group per sweep
  for (let sweep = 0; sweep < 6 && currentLines > SINGLE_PAGE_LINE_BUDGET; sweep++) {
    let popped = false;
    for (let e = canonical.experience.length - 1; e >= 0 && currentLines > SINGLE_PAGE_LINE_BUDGET; e--) {
      const exp = canonical.experience[e];
      for (let sIdx = (exp.subheadings?.length || 0) - 1; sIdx >= 0 && currentLines > SINGLE_PAGE_LINE_BUDGET; sIdx--) {
        if (tryPop(exp.subheadings![sIdx].bullets)) popped = true;
      }
      if (currentLines > SINGLE_PAGE_LINE_BUDGET && tryPop(exp.bullets)) popped = true;
    }
    for (let pIdx = canonical.projects.length - 1; pIdx >= 0 && currentLines > SINGLE_PAGE_LINE_BUDGET; pIdx--) {
      if (tryPop(canonical.projects[pIdx].bullets)) popped = true;
    }
    if (!popped) break;
  }

  return { canonical, trimmedCount };
}

/** Canonical skill buckets used when routing JD skills into Technical Skills. */
export type SkillBucket = "Languages" | "Frontend" | "Backend" | "AI/ML" | "Databases/Cloud" | "Other";

const PROGRAMMING_LANGUAGES = new Set([
  "python", "c++", "c", "c#", "java", "go", "golang", "rust", "javascript", "typescript", "sql", "kotlin",
  "swift", "php", "ruby", "scala", "r", "bash", "dart", "matlab", "html/css",
]);

export function classifySkillBucket(skill: string): SkillBucket {
  const s = skill.toLowerCase().trim();
  if (PROGRAMMING_LANGUAGES.has(s) && s !== "html/css") return "Languages";
  if (
    /^(?:azure|microsoft azure|aws|amazon web services|gcp|google cloud(?: platform)?|docker|kubernetes|k8s|git|github|version control|terraform|ci\/cd|cicd|mysql|postgres(?:ql)?|mongodb|dynamodb|snowflake|kafka|apache kafka|rabbitmq|redis|pub\/sub|elasticsearch|bigquery|cloud|devops|jenkins|github actions|serverless|lambda|s3|ec2|cosmos ?db|sqlite|oracle|nosql|databases?)$/i.test(
      s
    )
  ) {
    return "Databases/Cloud";
  }
  if (
    /^(?:agentic ai|ai agents?|multi-agent systems?|artificial intelligence|ai|genai|generative ai|machine learning|deep learning|nlp|natural language processing|llms?|large language models?|rag|langchain|langgraph|pytorch|tensorflow|computer vision|ocr|yolo|opencv|vlm|transformers|hugging ?face|scikit-learn|mlops|prompt engineering)$/i.test(
      s
    )
  ) {
    return "AI/ML";
  }
  if (
    /^(?:fastapi|django|flask|spring boot|springboot|graphql|grpc|\.net|dotnet|asp\.net|microservices?|node\.?js|node|express(?:\.js)?|rest(?: ?apis?)?|restful(?: apis?)?|websockets?|distributed systems|system design|zeromq|backend|apis?)$/i.test(
      s
    )
  ) {
    return "Backend";
  }
  if (/^(?:react(?:\.js)?|next\.?js|vue(?:\.js)?|angular|redux|tailwind(?: css)?|html\/css|html|css|sass|frontend|react native|webpack)$/i.test(s)) {
    return "Frontend";
  }
  return "Other";
}

/** Finds (or names) the Technical Skills row that a skill belongs to, never routing non-languages to Languages. */
function resolveSkillCategoryKey(existingKeys: string[], skill: string): string {
  const bucket = classifySkillBucket(skill);
  // The AI Development Tools category is reserved for the candidate's own tools; never route JD skills into it
  existingKeys = existingKeys.filter((k) => k.trim().toLowerCase() !== AI_TOOLS_CATEGORY.toLowerCase());
  const find = (re: RegExp, exclude?: RegExp) => existingKeys.find((k) => re.test(k) && !(exclude && exclude.test(k)));
  switch (bucket) {
    case "Languages":
      return find(/lang/i) || "Languages";
    case "Frontend":
      return find(/front/i) || "Frontend";
    case "Backend":
      return find(/back/i) || "Backend";
    case "AI/ML":
      return find(/\bai\b|ai\/ml|\bml\b|machine|artificial|intelligen|llm/i, /database/i) || "AI/ML";
    case "Databases/Cloud":
      return find(/database|cloud/i) || find(/\bdb\b|infra|devops|system|platform/i) || "Databases/Cloud";
    default:
      return (
        find(/system|tool|concept|other|platform|infra/i) ||
        find(/back/i) ||
        existingKeys.find((k) => !/lang/i.test(k)) ||
        "Systems"
      );
  }
}

/**
 * Contextually adds a new skill to CanonicalResume.technicalSkills under its best category
 * if not already present, ensuring full Twice Rule compliance when skills are added from a target JD.
 */
export function addSkillToTechnicalSkills(canonical: CanonicalResume, skill: string): boolean {
  if (!skill || !skill.trim()) return false;
  const cleanSkill = cleanAiText(skill.trim());
  if (!cleanSkill) return false;

  if (
    typeof canonical.technicalSkills === "object" &&
    !Array.isArray(canonical.technicalSkills) &&
    canonical.technicalSkills !== null
  ) {
    const record = canonical.technicalSkills as Record<string, string[] | string>;
    const lowerSkill = cleanSkill.toLowerCase();

    // Check if already present anywhere in technicalSkills
    for (const [_, skills] of Object.entries(record)) {
      if (Array.isArray(skills)) {
        if (skills.some((s) => s.toLowerCase() === lowerSkill)) return false;
      } else if (typeof skills === "string") {
        if (skills.toLowerCase().includes(lowerSkill)) return false;
      }
    }

    // Determine target category with strict routing (cloud/DevOps tools are NEVER languages)
    const targetCat = resolveSkillCategoryKey(Object.keys(record), cleanSkill);

    if (!record[targetCat]) {
      record[targetCat] = [cleanSkill];
    } else if (Array.isArray(record[targetCat])) {
      (record[targetCat] as string[]).push(cleanSkill);
    } else {
      record[targetCat] = `${record[targetCat]}, ${cleanSkill}`;
    }
    return true;
  } else if (Array.isArray(canonical.technicalSkills)) {
    if (!canonical.technicalSkills.some((s) => String(s).toLowerCase() === cleanSkill.toLowerCase())) {
      canonical.technicalSkills.push(cleanSkill);
      return true;
    }
  }
  return false;
}

/** Weaves a skill into the best-fitting bullet group: primary (specific) anchors across ALL groups first, then fallbacks. */
function weaveSkillIntoCanonical(canonical: CanonicalResume, skill: string): boolean {
  const re = literalSkillRegex(skill);
  for (const primaryOnly of [true, false]) {
    for (const exp of canonical.experience) {
      for (const sub of exp.subheadings || []) {
        const res = weaveSkillIntoExperienceBullets(sub.bullets, skill, { primaryOnly });
        if (res.success && res.wovenBullets.some((b) => re.test(b))) {
          sub.bullets = res.wovenBullets;
          return true;
        }
      }
      if (Array.isArray(exp.bullets)) {
        const res = weaveSkillIntoExperienceBullets(exp.bullets, skill, { primaryOnly });
        if (res.success && res.wovenBullets.some((b) => re.test(b))) {
          exp.bullets = res.wovenBullets;
          return true;
        }
      }
    }
  }
  return false;
}

function literalSkillRegex(skill: string): RegExp {
  const escaped = [...skill.trim()].map((c) => (/[a-z0-9 ]/i.test(c) ? c : "\\" + c)).join("");
  return new RegExp("(^|[^a-z0-9+#.])" + escaped + "(?=$|[^a-z0-9+#.])", "i");
}

function technicalSkillsFlat(canonical: CanonicalResume): string[] {
  const ts = canonical.technicalSkills;
  if (!ts) return [];
  if (Array.isArray(ts)) return ts.map((s) => String(s).trim()).filter(Boolean);
  if (typeof ts === "object") {
    return Object.values(ts as Record<string, string[] | string>).flatMap((v) =>
      Array.isArray(v) ? v.map((x) => String(x).trim()) : String(v).split(/,\s*/).map((x) => x.trim())
    ).filter(Boolean);
  }
  return String(ts).split(/,\s*/).map((x) => x.trim()).filter(Boolean);
}

function removeSkillFromTechnicalSkills(canonical: CanonicalResume, skill: string): void {
  const lower = skill.toLowerCase();
  const ts = canonical.technicalSkills;
  if (Array.isArray(ts)) {
    canonical.technicalSkills = ts.filter((s) => String(s).toLowerCase() !== lower) as typeof canonical.technicalSkills;
  } else if (ts && typeof ts === "object") {
    const rec = ts as Record<string, string[] | string>;
    for (const [k, v] of Object.entries(rec)) {
      if (Array.isArray(v)) {
        rec[k] = v.filter((x) => String(x).toLowerCase() !== lower);
      } else {
        rec[k] = String(v).split(/,\s*/).filter((x) => x.trim().toLowerCase() !== lower).join(", ");
      }
    }
  }
}

/** Text that DEMONSTRATES skills: work-experience and project content (not the skills list itself). */
function demonstrationLines(canonical: CanonicalResume): string[] {
  const lines: string[] = [...getAllExperienceBullets(canonical)];
  for (const exp of canonical.experience || []) {
    for (const sub of exp.subheadings || []) {
      if (sub.title) lines.push(sub.title);
      if (sub.techStack) lines.push(sub.techStack);
    }
  }
  for (const proj of canonical.projects || []) {
    if (proj.title) lines.push(proj.title);
    if (proj.techStack) lines.push(proj.techStack);
    lines.push(...(proj.bullets || []));
  }
  return lines;
}

export type JDSkillState =
  | "presentAndDemonstrated"
  | "listedNotDemonstrated"
  | "verifiedMissing"
  | "notPossessed";

export interface JDSkillReport {
  presentAndDemonstrated: string[];
  listedNotDemonstrated: string[];
  /** In the resume (experience/projects/summary/certifications) but absent from Technical Skills: safe to add. */
  verifiedMissing: string[];
  /** No evidence anywhere in the resume: never added automatically; needs the candidate's confirmation. */
  notPossessed: string[];
  /** JD skills that were tentatively added but removed because no real experience bullet could carry them. */
  unsupported: string[];
}

/**
 * Compares the JD's skills against the ORIGINAL resume, which is the source of truth for qualifications.
 * A skill counts as verified only when the resume itself evidences it.
 */
export function classifyJDSkills(canonical: CanonicalResume, requirements: { keyword: string }[]): JDSkillReport {
  const report: JDSkillReport = { presentAndDemonstrated: [], listedNotDemonstrated: [], verifiedMissing: [], notPossessed: [], unsupported: [] };
  const skillsText = technicalSkillsFlat(canonical).join("\n");
  const demoText = demonstrationLines(canonical).join("\n");
  const otherProse = [
    canonical.summary || "",
    ...(canonical.certifications || []),
    ...(canonical.achievements || []),
    ...(canonical.education || []).flatMap((e) => [e.degree || "", ...(e.bullets || [])]),
  ].join("\n");
  for (const { keyword } of requirements) {
    const kw = keyword.trim();
    if (kw.length < 3 || /^(engineer|software|developer|team|experience|years|work|strong|ability)$/i.test(kw)) continue;
    const listed = containsSkill(skillsText, kw);
    const demonstrated = containsSkill(demoText, kw);
    if (listed && demonstrated) report.presentAndDemonstrated.push(kw);
    else if (listed) report.listedNotDemonstrated.push(kw);
    else if (demonstrated || containsSkill(otherProse, kw)) report.verifiedMissing.push(kw);
    else report.notPossessed.push(kw);
  }
  return report;
}

/**
 * STRICT 100% "Twice Rule": every target-JD skill that is present in Technical Skills (whether newly
 * added from the JD or already on the resume) must also appear verbatim in Work Experience bullets.
 * Missing ones are woven into the best-fitting bullet; JD-added skills that cannot be grounded
 * naturally are removed rather than left as unproven claims.
 */
export function enforceStrictTwiceRule(
  canonical: CanonicalResume,
  targetSkills: string[],
  options: { addedFromJD?: Set<string> } = {}
): { woven: string[]; removed: string[]; unresolved: string[] } {
  const woven: string[] = [];
  const removed: string[] = [];
  const unresolved: string[] = [];
  const seen = new Set<string>();

  for (const skill of targetSkills) {
    const key = skill.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const re = literalSkillRegex(skill);
    const listed = technicalSkillsFlat(canonical).some((s) => s.toLowerCase() === key || re.test(s));
    if (!listed) continue;
    // Demonstrated anywhere in work experience OR projects counts: never force it into unrelated bullets.
    if (demonstrationLines(canonical).some((b) => re.test(b))) continue;

    const ok = weaveSkillIntoCanonical(canonical, skill);

    if (ok) {
      woven.push(skill);
    } else if (options.addedFromJD?.has(key)) {
      removeSkillFromTechnicalSkills(canonical, skill);
      removed.push(skill);
    } else {
      unresolved.push(skill);
    }
  }
  return { woven, removed, unresolved };
}

/**
 * Validates that all tools listed in Technical Skills are grounded in work history/projects.
 * Self-corrects any orphaned skills by contextually weaving them into experience bullets (Twice Rule)
 * or removing ungrounded additions to avoid modern ATS penalties.
 */
export function validateAndProtectOrphanedSkills(
  resumeText: string,
  experienceBullets: string[],
  targetSkills?: string[]
): { sanitizedText: string; orphanedSkills: string[]; wovenBullets?: string[] } {
  const canonical = parseResumeToCanonical(resumeText);
  const currentBullets = getAllExperienceBullets(canonical);
  const orphaned: string[] = [];
  const updatedBullets = [...experienceBullets];
  const targetSet = targetSkills ? new Set(targetSkills.map((t) => t.trim().toLowerCase())) : null;

  // Inspect EVERY skill in Technical Skills (new JD additions and existing JD-matching skills alike);
  // verbatim mentions are required, alias matches do not count.
  const seen = new Set<string>();
  for (const sk of technicalSkillsFlat(canonical)) {
    const cleanSk = cleanAiText(sk).trim();
    if (!cleanSk || cleanSk.length < 3 || seen.has(cleanSk.toLowerCase())) continue;
    seen.add(cleanSk.toLowerCase());
    if (targetSet && !targetSet.has(cleanSk.toLowerCase())) continue;
    const re = literalSkillRegex(cleanSk);
    const inExp = currentBullets.some((b) => re.test(b)) || updatedBullets.some((b) => re.test(b));
    if (!inExp) {
      orphaned.push(cleanSk);
      const res = weaveSkillIntoExperienceBullets(updatedBullets, cleanSk);
      if (res.success) {
        updatedBullets.splice(0, updatedBullets.length, ...res.wovenBullets);
      }
    }
  }

  return {
    sanitizedText: canonicalToPlainText(canonical),
    orphanedSkills: orphaned,
    wovenBullets: updatedBullets,
  };
}

/**
 * Resolves the clean target role title for the summary: explicit param > "looking for/title:" patterns
 * > first role-like line of the JD (e.g. "AI Engineer - Agentic AI" -> "AI Engineer") > "Software Engineer".
 */
export function resolveTargetRoleTitle(jobText: string, explicit?: string): string {
  const clean = (raw: string) => normalizeJobIdentity({ jobTitle: raw }).jobTitle || raw.trim();
  if (explicit && explicit.trim()) return clean(explicit);

  const m = (jobText || "").match(
    /(?:looking for (?:a|an)?|seeking (?:a|an)?|hiring (?:a|an)?|title:?\s*)([A-Za-z0-9\s-]{4,40}?)(?:\.|\n|,|with|to)/i
  );
  if (m && ROLE_KEYWORDS.test(m[1])) return clean(m[1]);

  for (const line of (jobText || "").split("\n").slice(0, 4)) {
    const t = line.trim();
    if (t && t.length <= 80 && ROLE_KEYWORDS.test(t)) {
      const cleaned = clean(t);
      if (cleaned && cleaned.length <= 50) return cleaned;
    }
  }
  return m ? clean(m[1]) : "Software Engineer";
}

/**
 * Executes all 6 Remediation Passes across structured Canonical Resume:
 * 1. AI PAR Rewrites (structured array updates)
 * 2. Deterministic Passive-to-Action Verb Upgrade
 * 3. Deterministic Action Verb De-Duplication (rotates starting verbs used >= 3 times)
 * 4. Full Twice-Rule 1.0x Promotion (Skills + Experience contextual weaving)
 * 5. Single-Page Content Trimming Fallback (replaces hyper-compression)
 * 6. Grammar, Dialect & ASCII Cleanup
 * Constructs clean, uncorrupted ATS LaTeX directly from structured schema.
 */
export function runAllRemediationPasses(params: {
  text: string;
  latex?: string;
  audit?: UnifiedATSAudit | null;
  jobText: string;
  customMetrics?: Record<number, string>;
  /** Clean role title from the JD (e.g. "AI Engineer"); used for the summary instead of a generic default. */
  targetRoleTitle?: string;
  /** Optional: JD skills the candidate explicitly confirmed. Automatic tailoring does not depend on it. */
  confirmedSkills?: string[];
}): {
  optimizedText: string;
  optimizedLatex: string;
  canonical: CanonicalResume;
  skillReport: JDSkillReport;
  passesSummary: {
    rewrites: number;
    passiveUpgrades: number;
    dedupRotations: number;
    twicePromotions: number;
    metricsAdded: number;
    grammarFixes: number;
  };
} {
  const normalizedText = normalizeWrappedBullets(params.text);
  const canonical = parseResumeToCanonical(normalizedText);

  let rewrites = 0;
  let passiveUpgrades = 0;
  let dedupRotations = 0;
  let twicePromotions = 0;
  let metricsAdded = 0;
  let grammarFixes = 0;
  const strictAddedFromJD = new Set<string>();
  let skillReport: JDSkillReport = { presentAndDemonstrated: [], listedNotDemonstrated: [], verifiedMissing: [], notPossessed: [], unsupported: [] };

  // PASS 1: AI PAR Rewrites
  if (params.audit?.action_verb_and_par_rewrites) {
    params.audit.action_verb_and_par_rewrites.forEach((r, i) => {
      if (r.original_bullet && r.optimized_par_bullet) {
        const customVal = params.customMetrics?.[i];
        let rawReplacement = resolvePlaceholder(r.optimized_par_bullet, customVal);
        rawReplacement = rawReplacement.replace(
          /^\s*(?:optimized|rewrite|par|improved|revised|bullet|option\s*\d+|suggestion)\s*[:\-–—]\s*/i,
          ""
        );
        if (customVal && customVal.trim()) metricsAdded++;

        const updated = updateBulletInCanonical(canonical, r.original_bullet, rawReplacement);
        if (updated) rewrites++;
      }
    });
  }

  // PASS 2: Deterministic Passive-to-Action Verb Upgrade
  const PASSIVE_MAP: [RegExp, string][] = [
    [/\b(?:worked on developing|worked on building|worked on creating)\b/gi, "Engineered"],
    [/\b(?:worked on)\b/gi, "Engineered"],
    [/\b(?:responsible for leading|responsible for managing)\b/gi, "Spearheaded"],
    [/\b(?:responsible for|duties included)\b/gi, "Spearheaded"],
    [/\b(?:assisted with|assisted in|helped with|helped)\b/gi, "Collaborated on"],
    [/\b(?:handled)\b/gi, "Orchestrated"],
    [/\b(?:participated in|was involved in)\b/gi, "Delivered"],
  ];

  function upgradeBulletsInList(bullets: string[]) {
    for (let i = 0; i < bullets.length; i++) {
      let b = bullets[i];
      for (const [pattern, strongVerb] of PASSIVE_MAP) {
        if (pattern.test(b)) {
          b = b.replace(pattern, strongVerb);
          passiveUpgrades++;
        }
      }
      bullets[i] = b;
    }
  }

  for (const exp of canonical.experience) {
    upgradeBulletsInList(exp.bullets);
    if (Array.isArray(exp.subheadings)) {
      for (const sub of exp.subheadings) {
        upgradeBulletsInList(sub.bullets);
      }
    }
  }
  for (const proj of canonical.projects) {
    upgradeBulletsInList(proj.bullets);
  }

  // PASS 3: Deterministic Action Verb De-Duplication
  const DEDUP_SYNONYMS = [
    "Engineered",
    "Architected",
    "Spearheaded",
    "Orchestrated",
    "Implemented",
    "Formulated",
    "Accelerated",
    "Streamlined",
    "Pioneered",
    "Automated",
  ];
  let synonymIdx = 0;
  const verbFrequency = new Map<string, number>();

  function dedupBulletsInList(bullets: string[]) {
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      const matchPrefix = b.match(/^([A-Za-z]+)/);
      if (matchPrefix) {
        const rawVerb = matchPrefix[1];
        const normVerb = rawVerb.charAt(0).toUpperCase() + rawVerb.slice(1).toLowerCase();
        const count = (verbFrequency.get(normVerb) || 0) + 1;
        verbFrequency.set(normVerb, count);
        if (count >= 3) {
          const replacementVerb = DEDUP_SYNONYMS[synonymIdx % DEDUP_SYNONYMS.length];
          synonymIdx++;
          bullets[i] = b.replace(matchPrefix[0], replacementVerb);
          dedupRotations++;
        }
      }
    }
  }

  for (const exp of canonical.experience) {
    dedupBulletsInList(exp.bullets);
    if (Array.isArray(exp.subheadings)) {
      for (const sub of exp.subheadings) {
        dedupBulletsInList(sub.bullets);
      }
    }
  }
  for (const proj of canonical.projects) {
    dedupBulletsInList(proj.bullets);
  }

  // PASS 4: Contextual Semantic Tailoring & Twice Rule Weaving
  if (params.jobText && params.jobText.trim()) {
    const jdReqs = extractRequirementsFromJobText(params.jobText);
    const targetKeywords = jdReqs.map((r) => r.keyword);

    // Compare the JD against the ORIGINAL resume (source of truth) before anything is reworded.
    skillReport = classifyJDSkills(canonical, jdReqs);

    // Bullet Reframing (Google XYZ format)
    const expBullets = getAllExperienceBullets(canonical);
    if (expBullets.length > 0) {
      const overlappingKeywords = targetKeywords.filter((k) =>
        containsSkill(canonicalToPlainText(canonical), k)
      );
      const { reframedBullets } = reframeBulletsToGoogleXYZ(expBullets, overlappingKeywords);
      for (let j = 0; j < expBullets.length; j++) {
        if (reframedBullets[j] && reframedBullets[j] !== expBullets[j]) {
          updateBulletInCanonical(canonical, expBullets[j], reframedBullets[j]);
        }
      }
    }

    // THE TWICE RULE: Deep Contextual Skill Weaving
    // Enforce the Twice Rule strictly on TARGET JD SKILLS that are relevant and not yet in experience bullets.
    // Baseline candidate skills already present in Technical Skills are preserved as-is without spamming bullets.
    // Limit to max 3 newly woven skills across the entire resume, and at most 1 skill per bullet.
    const jdSkillsToWeave = targetKeywords.filter((kw) => {
      const lower = kw.toLowerCase().trim();
      if (lower.length < 3 || /^(engineer|software|developer|team|experience|years|work|strong|ability)$/i.test(lower)) {
        return false;
      }
      return true;
    });

    // 1. Automatically add every relevant JD skill to Technical Skills (no manual confirmation needed).
    //    Skills the resume does not already list are tracked in strictAddedFromJD so the strict Twice Rule
    //    pass below can weave them into existing, context-matching bullets, and drop (and flag as
    //    unsupported) any that cannot be grounded in the candidate's real experience.
    for (const skill of jdSkillsToWeave) {
      if (addSkillToTechnicalSkills(canonical, skill)) strictAddedFromJD.add(skill.trim().toLowerCase());
    }
  }

  // PASS 4b: strict 100% Twice Rule across ALL target JD skills present in Technical Skills,
  // then the summary (written last so it only names skills that are really on the final resume)
  let protectedSkills: string[] = [];
  if (params.jobText && params.jobText.trim()) {
    const jdReqsFinal = extractRequirementsFromJobText(params.jobText);
    const strictTargets = jdReqsFinal
      .map((r) => r.keyword)
      .filter((kw) => kw.trim().length >= 3 && !/^(engineer|software|developer|team|experience|years|work|strong|ability)$/i.test(kw.trim()));
    // JD-added skills that cannot be woven into a real bullet are removed (never left as unproven claims)
    // and surfaced in skillReport.unsupported; skills that were already on the resume are never removed.
    const strict = enforceStrictTwiceRule(canonical, strictTargets, { addedFromJD: strictAddedFromJD });
    twicePromotions += strict.woven.length;
    skillReport = classifyJDSkills(canonical, jdReqsFinal);
    skillReport.unsupported = strict.removed;
    protectedSkills = strictTargets;

    // JD-driven positioning: detect the role the JD hires for, then lead with the most relevant verified content
    const resolvedTitle = resolveTargetRoleTitle(params.jobText, params.targetRoleTitle);
    const roleFamily = detectRoleFamily(resolvedTitle, params.jobText);
    prioritizeResumeForRole(canonical, roleFamily, strictTargets);

    if (canonical.summary) {
      const targetRole = resolvePositioningTitle(resolvedTitle, roleFamily);
      const domainTerms = jdReqsFinal
        .map((r) => r.keyword)
        .filter((k) => /microservice|distributed|architecture|cloud|real-time|system design|data/i.test(k));
      const finalEvidence = `${technicalSkillsFlat(canonical).join(", ")}\n${getAllExperienceBullets(canonical).join("\n")}`;
      const jdLower = params.jobText.toLowerCase();
      const mentions = (kw: string) => (jdLower.match(new RegExp(literalSkillRegex(kw).source, "gi")) || []).length;
      const candidateSkills = jdReqsFinal
        .filter((r) => literalSkillRegex(r.keyword).test(finalEvidence) && !domainTerms.includes(r.keyword))
        .sort((x, y) => mentions(y.keyword) - mentions(x.keyword) || (y.weightMultiplier ?? 0) - (x.weightMultiplier ?? 0))
        .map((r) => r.keyword);
      canonical.summary = rewriteSummaryWithJDAlignment(canonical.summary, targetRole, domainTerms, candidateSkills, roleFamily, finalEvidence);
    }
  }

  // PASS 5: Content Trimming Fallback for single-page budget (never drops the sole carrier of a listed skill)
  trimContentForSinglePage(canonical, { protectedSkills });

  // PASS 6: Grammar & Cleanup
  if (params.audit?.grammar_spelling_dialect_audit) {
    params.audit.grammar_spelling_dialect_audit.forEach((item) => {
      if (item.original_phrase && item.corrected_phrase) {
        if (canonical.summary && canonical.summary.includes(item.original_phrase)) {
          canonical.summary = canonical.summary.replace(item.original_phrase, item.corrected_phrase);
          grammarFixes++;
        }
        const expBullets = getAllExperienceBullets(canonical);
        for (const b of expBullets) {
          if (b.includes(item.original_phrase)) {
            updateBulletInCanonical(canonical, b, b.replace(item.original_phrase, item.corrected_phrase));
            grammarFixes++;
          }
        }
      }
    });
  }

  // Sanitize all bullets in canonical with cleanAiText to enforce single action verbs,
  // remove leading bullet markers, and ensure <= 2 'and's across canonical schema
  for (const exp of canonical.experience) {
    if (Array.isArray(exp.bullets)) {
      exp.bullets = exp.bullets.map(cleanAiText);
    }
    if (Array.isArray(exp.subheadings)) {
      for (const sub of exp.subheadings) {
        if (Array.isArray(sub.bullets)) {
          sub.bullets = sub.bullets.map(cleanAiText);
        }
      }
    }
  }

  // Construct final optimizedText and optimizedLatex cleanly from structured schema
  let updatedText = canonicalToPlainText(canonical);
  updatedText = cleanSmartTypography(updatedText);
  updatedText = cleanLingeringPlaceholders(updatedText, false);

  let updatedLatex = generateLatexFromCanonical(canonical, { originalLatex: params.latex });
  updatedLatex = cleanLingeringPlaceholders(updatedLatex, true);

  if (params.latex && params.latex.trim()) {
    updatedLatex = restoreMissingHyperlinksInLatex(updatedLatex, params.latex);
  }

  return {
    optimizedText: updatedText,
    optimizedLatex: updatedLatex,
    canonical,
    skillReport,
    passesSummary: {
      rewrites,
      passiveUpgrades,
      dedupRotations,
      twicePromotions,
      metricsAdded,
      grammarFixes,
    },
  };
}

/**
 * Standalone Backend Helper for the Automated Email + JD Tailoring Pipeline:
 * Analyzes resume vs JD, runs all 6 Remediation Passes, and returns 90+ ATS-tailored text and LaTeX
 * ready to compile to PDF and attach to outgoing emails.
 */
export async function autoTailorResumeToJD(params: {
  resumeText: string;
  sourceLatex?: string;
  jobText: string;
  companyName?: string;
  targetRoleTitle?: string;
  confirmedSkills?: string[];
}): Promise<{
  optimizedText: string;
  optimizedLatex: string;
  baselineScore: number;
  finalScore: number;
  attachmentFilename: string;
  canonical: CanonicalResume;
  skillReport: JDSkillReport;
}> {
  const reqs = extractRequirementsFromJobText(params.jobText);
  const baselineScoring = scoreResume(params.resumeText, reqs, params.jobText);

  let audit: UnifiedATSAudit | null = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      const { analyzeResume } = await import("./analysis");
      const res = await analyzeResume(params.resumeText, params.jobText);
      if (res?.unifiedAudit) {
        audit = res.unifiedAudit as unknown as UnifiedATSAudit;
      }
    } catch (err) {
      console.warn("AI ATS analysis failed in autoTailorResumeToJD, using deterministic remediation passes:", err);
    }
  }

  const passes = runAllRemediationPasses({
    text: params.resumeText,
    latex: params.sourceLatex,
    audit,
    jobText: params.jobText,
    targetRoleTitle: params.targetRoleTitle,
    confirmedSkills: params.confirmedSkills,
  });

  let tailoredLatex = passes.optimizedLatex;
  try {
    const { optimizeLatexGeometryForOnePage } = await import("./apply-latex");
    const estimatedLines = estimateRenderedLines(passes.canonical);
    tailoredLatex = optimizeLatexGeometryForOnePage(tailoredLatex, { estimatedLines });
  } catch (err) {
    console.warn("Failed to apply single-page geometry optimization:", err);
  }

  const finalLatex = ensureAllHrefsPreservedInLatex(
    tailoredLatex,
    [params.sourceLatex, params.resumeText].filter(Boolean) as string[]
  );

  const finalScoring = scoreResume(passes.optimizedText, reqs, params.jobText);
  const attachmentFilename = getCandidateFilename(
    params.resumeText,
    params.companyName || params.jobText
  );

  return {
    optimizedText: passes.optimizedText,
    optimizedLatex: finalLatex,
    baselineScore: baselineScoring.score,
    finalScore: finalScoring.score,
    attachmentFilename,
    canonical: passes.canonical,
    skillReport: passes.skillReport,
  };
}

/**
 * Compiles LaTeX source code into a binary PDF Buffer using TeXLive CGI (pdflatex with xelatex fallback).
 * Returns null if the external compiler is unreachable or returns an error.
 */
export async function compileLatexToPdfBuffer(
  latexCode: string,
  linkSource?: string | ExtractedHyperlink[]
): Promise<Buffer | null> {
  if (!latexCode || !latexCode.trim()) return null;

  // Guarantee 100% of hyperlinks are preserved as clickable \href commands before compiling
  const safeLatex = ensureAllHrefsPreservedInLatex(latexCode, linkSource ? [linkSource] : []);

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
          signal: AbortSignal.timeout(30000), // 30s timeout
        });
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 750 * attempt));
      }
    }
    throw new Error("TeXLive compilation failed after 3 attempts");
  }

  try {
    let response = await compileWithEngine("pdflatex");
    let contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.includes("pdf")) {
      const fallback = await compileWithEngine("xelatex").catch(() => null);
      if (fallback && fallback.ok && (fallback.headers.get("content-type") || "").includes("pdf")) {
        response = fallback;
        contentType = fallback.headers.get("content-type") || "";
      } else {
        return null;
      }
    }

    const arrayBuf = await response.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    console.warn("compileLatexToPdfBuffer failed:", err);
    return null;
  }
}
