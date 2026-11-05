import {
  scoreResume,
  extractRequirementsFromJobText,
  cleanSmartTypography,
  normalizeWrappedBullets,
  CATEGORY_LABEL_RE,
  containsSkill,
  METRIC_RE,
} from "./scoring";
import { analyzeResume, UnifiedATSAudit } from "./analysis";
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
} from "./hyperlinks";

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
  const originalLinks = options?.originalLatex ? extractHyperlinksFromLatex(options.originalLatex) : [];
  const mdLinks = extractHyperlinksFromMarkdownText(optimizedText);
  const rawLinks = [...originalLinks, ...(options?.knownLinks || []), ...mdLinks];
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
  const normalized = normalizeWrappedBullets(optimizedText);
  const rawLines = normalized.split("\n");

  const cleanLines = rawLines.filter((l) => {
    const trimmed = l.trim();
    if (!trimmed) return false;
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(trimmed)) return false;
    if (/^(?:page\s*)?\d+\s*(?:of|\/)\s*\d+$/i.test(trimmed)) return false;
    if (/^page\s*\d+$/i.test(trimmed)) return false;
    if (/^\s*[-–—*]?\s*\d+\s*[-–—*]?\s*$/.test(trimmed)) return false;
    if (/^(?:curriculum vitae|resume)$/i.test(trimmed)) return false;
    if (/^[ƒ§ï\u2022\u2217\u25cf\u25cb\u25aa\u25ab\u25e6\u2023\u25b8\u25b9\u27a4\u27a7\u2794\u279c\s]+$/.test(trimmed)) return false;
    return true;
  });

  const bulletRe = /^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+✔✓◆◇►▸⁃∙·\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF]|\d+[.)])\s+(.*)$/i;
  const monthNames = "(?:Jan(?:uary|\\.)?|Feb(?:ruary|\\.)?|Mar(?:ch|\\.)?|Apr(?:il|\\.)?|May|Jun(?:e|\\.)?|Jul(?:y|\\.)?|Aug(?:ust|\\.)?|Sep(?:tember|t\\.)?|Oct(?:ober|\\.)?|Nov(?:ember|\\.)?|Dec(?:ember|\\.)?)";
  const dateUnit = `(?:${monthNames}\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4})`;
  const dateRangeRe = new RegExp(
    `\\b(${dateUnit}\\s*(?:[-–—]|\\bto\\b)\\s*(?:${dateUnit}|Present|Current|Now))\\b`,
    "i"
  );

  // Project "Code" / "Live Demo" links in reading order; consumed one per project heading.
  const projectCodeLinks = allKnownLinks.filter((l) => l.category === "project_code");
  const projectDemoLinks = allKnownLinks.filter((l) => l.category === "project_demo");
  let nextCodeLink = 0;
  let nextDemoLink = 0;

  let candidateName = "";
  const contactTokens: string[] = [];
  let isHeaderArea = true;
  let inItemize = false;
  let bodyLatex = "";
  let currentSectionName = "";

  function closeItemize() {
    if (inItemize) {
      bodyLatex += "\\end{itemize}\\vspace{2pt}\n";
      inItemize = false;
    }
  }

  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i].trim();
    if (!line) continue;

    // 1. Major Section Heading Check
    const normalizedHeading = line.replace(/^[#*\-_~\s]+|[#*\-_~\s:]+$/g, "").trim();
    const headingMatch = CANONICAL_HEADINGS.find(([, regex]) => regex.test(normalizedHeading));

    if (headingMatch) {
      isHeaderArea = false;
      closeItemize();
      currentSectionName = headingMatch[0];
      // Show the heading the candidate wrote ("EXPERIENCE"), not our internal canonical name.
      bodyLatex += `\n\\section{${escapeLatex(normalizedHeading.toUpperCase())}}\n`;
      continue;
    }

    // 2. Candidate Header Area (Name, Contact Info)
    if (isHeaderArea) {
      if (!candidateName) {
        candidateName = line.replace(/^[#*\-•>\s]+/, "").trim();
        continue;
      }
      const hasContactSignal =
        /[@|]|github|linkedin|portfolio|website|\b\d{3}[-.]?\d{3}[-.]?\d{4}\b|\b\+?\d{1,3}[-.\s]?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/i.test(line);
      const isLocationOrCityState =
        /^[A-Za-z\s.-]+,\s*[A-Z]{2}(?:\s+\d{5})?$/.test(line) ||
        /^[A-Za-z\s.-]+,\s*[A-Za-z\s.-]+$/.test(line);
      const looksLikeContact = hasContactSignal || (isLocationOrCityState && line.length < 50);

      if (looksLikeContact) {
        const parts = transformPlainTextPreservingHrefs(line, (plain) =>
          plain.replace(/[|•–—\t]+/g, "\u0000")
        )
          .split("\u0000")
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length > 0) {
          contactTokens.push(...parts);
        } else {
          contactTokens.push(line);
        }
        continue;
      }
      isHeaderArea = false;
    }

    // 3. Bullet Points or Sub-Project Headings
    const bulletMatch = line.match(bulletRe);
    if (bulletMatch) {
      const bulletContent = bulletMatch[1].trim();

      const isProjectSubheading =
        bulletContent.length < 80 &&
        !bulletContent.endsWith(".") &&
        !/^(?:developed|engineered|designed|built|architected|spearheaded|created|implemented|optimized|collaborated|conducted|achieved|reduced|improved|managed|led|authored|integrated|orchestrated|automated)\b/i.test(bulletContent);

      if (isProjectSubheading) {
        closeItemize();
        if (bulletContent.includes("—") || bulletContent.includes(" - ")) {
          const sep = bulletContent.includes("—") ? "—" : " - ";
          const [pTitle, ...pRest] = bulletContent.split(sep);
          const techOrLink = pRest.join(sep).trim();
          bodyLatex += `\\vspace{4.5pt plus 2pt minus 1pt} \\noindent \\textbf{${formatLatexLine(pTitle.trim(), allKnownLinks)}} \\enspace\\textbar\\enspace \\textit{${formatLatexLine(techOrLink, allKnownLinks)}} \\vspace{1.5pt}\n`;
        } else {
          bodyLatex += `\\vspace{4.5pt plus 2pt minus 1pt} \\noindent \\textbf{${formatLatexLine(bulletContent, allKnownLinks)}} \\vspace{1.5pt}\n`;
        }
        continue;
      }

      if (!inItemize) {
        bodyLatex += "\\nopagebreak[4]\n\\begin{itemize}\n";
        inItemize = true;
      }
      // "Kaggle Bronze Medalist: ..." / "Leadership: ..." - bold the lead-in label like the reference.
      const labelled = currentSectionName === "ACHIEVEMENTS" && !bulletContent.includes("**")
        ? bulletContent.match(/^([A-Z][A-Za-z0-9 &/'’-]{1,40}):\s+(\S.*)$/)
        : null;
      if (labelled) {
        bodyLatex += `  \\resumeItem{\\textbf{${formatLatexLine(labelled[1], allKnownLinks)}:} ${formatLatexLine(labelled[2], allKnownLinks)}}\n`;
      } else {
        bodyLatex += `  \\resumeItem{${formatLatexLine(bulletContent, allKnownLinks)}}\n`;
      }
      continue;
    }

    // 4. Non-Bullet Lines
    closeItemize();

    if (currentSectionName === "PROFESSIONAL SUMMARY") {
      bodyLatex += `{\\small ${formatLatexLine(line, allKnownLinks)}\\par}\\vspace{3.5pt plus 1pt}\n`;
      continue;
    }

    const categoryMatch = line.match(CATEGORY_LABEL_RE);
    if (categoryMatch && !line.includes("|") && !dateRangeRe.test(line)) {
      bodyLatex += `{\\small \\textbf{${formatLatexLine(categoryMatch[1], allKnownLinks)}:} ${formatLatexLine(categoryMatch[2], allKnownLinks)}}\\\\[3.2pt plus 1pt]\n`;
      continue;
    }

    const isNextBulletOrHeading = (l: string) =>
      !l ||
      bulletRe.test(l) ||
      /^[-–—*∗▪▫◦‣▸▹➢➣→+]\s+/.test(l) ||
      CANONICAL_HEADINGS.some(([, regex]) => regex.test(l.replace(/^[#*\-_~\s]+|[#*\-_~\s:]+$/g, "").trim()));

    const dateMatch = line.match(dateRangeRe);
    const nextLine = i + 1 < cleanLines.length ? cleanLines[i + 1].trim() : "";
    const nextDateMatch = nextLine.match(dateRangeRe);

    // 5. Dedicated EDUCATION section parser
    if (currentSectionName === "EDUCATION") {
      // Check for Columnar split: e.g. Inst 1, Deg 1, Inst 2, Deg 2, Loc 1, Date 1, Loc 2, Date 2
      const eduLines: string[] = [];
      let peekIdx = i;
      while (peekIdx < cleanLines.length) {
        const pl = cleanLines[peekIdx].trim();
        if (bulletRe.test(pl) || CANONICAL_HEADINGS.some(([, regex]) => regex.test(pl.replace(/^[#*\-_~\s]+|[#*\-_~\s:]+$/g, "").trim()))) {
          break;
        }
        eduLines.push(pl);
        peekIdx++;
      }

      if (eduLines.length >= 4 && eduLines.length % 4 === 0) {
        const half = eduLines.length / 2;
        let isColumnSplit = true;
        for (let j = 0; j < half; j++) {
          if (splitTrailingLocation(eduLines[j]).loc || dateRangeRe.test(eduLines[j])) isColumnSplit = false;
        }
        for (let j = 0; j < half; j += 2) {
          const locCandidate = eduLines[half + j];
          const dateCandidate = eduLines[half + j + 1];
          if (!splitTrailingLocation(locCandidate).loc && !locCandidate.match(/^[A-Za-z\s,.-]+$/)) isColumnSplit = false;
          if (locCandidate.length > 35 || locCandidate.includes(";")) isColumnSplit = false;
          if (!dateRangeRe.test(dateCandidate) && !dateCandidate.match(/\b(20\d{2}|19\d{2})\b/)) isColumnSplit = false;
        }

        if (isColumnSplit) {
          for (let j = 0; j < half; j += 2) {
            const inst = eduLines[j];
            const deg = eduLines[j + 1];
            const loc = eduLines[half + j];
            const dStr = (eduLines[half + j + 1].match(dateRangeRe)?.[0] || eduLines[half + j + 1]).replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
            bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(inst, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(deg, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
          }
          i = peekIdx - 1;
          continue;
        }
      }

      // Single line pipe separated e.g. "Vignan's Institute... | Visakhapatnam | B.Tech... | 2023 - 2026"
      if (line.includes("|") && (dateMatch || nextDateMatch)) {
        const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
        const inst = parts[0] || "";
        let loc = "";
        let deg = "";
        let dStr = dateMatch ? dateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ") : "";

        for (let pIdx = 1; pIdx < parts.length; pIdx++) {
          const part = parts[pIdx];
          if (dateRangeRe.test(part)) {
            dStr = part.replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
          } else if (isLocationSegment(part)) {
            loc = part;
          } else if (isDegreeSegment(part)) {
            deg = part;
          } else if (!deg) {
            deg = part;
          }
        }
        bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(inst, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(deg || inst, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
        continue;
      }

      // 2-line structure: Line i (Institution with trailing location) & Line i+1 (Degree with trailing date)
      const splitInst = splitTrailingLocation(line);
      if (nextLine && nextDateMatch && (splitInst.loc || splitTrailingLocation(nextLine).loc)) {
        const dStr = nextDateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
        const degPart = nextLine.replace(nextDateMatch[0], "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();
        bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(splitInst.main, allKnownLinks)}}{${formatLatexLine(splitInst.loc, allKnownLinks)}}\n  {${formatLatexLine(degPart, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
        i++;
        continue;
      }

      // 4-line structure per entry: Inst \n Deg \n Loc \n Date OR Inst \n Loc \n Deg \n Date (when no trailing location)
      if (i + 3 < cleanLines.length) {
        const l1 = cleanLines[i + 1].trim();
        const l2 = cleanLines[i + 2].trim();
        const l3 = cleanLines[i + 3].trim();
        if (dateRangeRe.test(l3) && !bulletRe.test(l1) && !bulletRe.test(l2)) {
          const dStr = l3.match(dateRangeRe)![0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
          let inst = line;
          let deg = "";
          let loc = "";
          if (isLocationSegment(l1)) {
            loc = l1;
            deg = l2;
          } else {
            deg = l1;
            loc = l2;
          }
          bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(inst, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(deg, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
          i += 3;
          continue;
        }
      }

      // Line i itself has date
      if (dateMatch) {
        const dStr = dateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
        const remaining = line.replace(dateMatch[0], "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();
        const splitRem = splitTrailingLocation(remaining);
        bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(splitRem.main, allKnownLinks)}}{${formatLatexLine(splitRem.loc, allKnownLinks)}}\n  {${formatLatexLine(splitRem.main, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
        continue;
      }

      bodyLatex += `${formatLatexLine(line, allKnownLinks)}\\\\[1pt]\n`;
      continue;
    }

    // 6. Dedicated WORK EXPERIENCE section parser
    if (currentSectionName === "WORK EXPERIENCE") {
      // Pipe separated: Role | Location | Company | Date
      if (line.includes("|") && dateMatch) {
        const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
        const dStr = dateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
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
          // 3 or more parts: e.g. Role | Location | Company or Company | Role | Location
          const rIdx = nonDateParts.findIndex((p) => isRoleSegment(p));
          const lIdx = nonDateParts.findIndex((p, idx) => idx !== rIdx && isLocationSegment(p));
          if (rIdx !== -1) role = nonDateParts[rIdx];
          if (lIdx !== -1) loc = nonDateParts[lIdx];
          const rem = nonDateParts.filter((_, idx) => idx !== rIdx && idx !== lIdx);
          org = rem.join(", ");
        }

        const topPart = org || role || "Role";
        const bottomPart = (org && role) ? role : (org || role || "Company");
        bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(topPart, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(bottomPart, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
        continue;
      }

      // 2-line structure (preferred when location is already on line i or line i+1):
      // Line i: Role or Company with trailing location (e.g. "AI Engineer Hyderabad" or "Software Engineer Intern Mysuru, Karnataka")
      // Line i+1: Company or Role with trailing date (e.g. "Julley Online Pvt Ltd Mar 2026 – Present")
      const splitRole = splitTrailingLocation(line);
      if (nextLine && nextDateMatch && (splitRole.loc || splitTrailingLocation(nextLine).loc)) {
        const dStr = nextDateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
        const compPart = nextLine.replace(nextDateMatch[0], "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();
        let effectiveLoc = splitRole.loc;
        let effectiveComp = compPart;
        if (!effectiveLoc) {
          const splitComp = splitTrailingLocation(compPart);
          effectiveLoc = splitComp.loc;
          effectiveComp = splitComp.main;
        }
        const effectiveRole = splitRole.main;

        bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(effectiveRole, allKnownLinks)}}{${formatLatexLine(effectiveLoc, allKnownLinks)}}\n  {${formatLatexLine(effectiveComp, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
        i++;
        continue;
      }

      // 4-line structure: Role \n Company \n Location \n Date
      if (i + 3 < cleanLines.length) {
        const l1 = cleanLines[i + 1].trim();
        const l2 = cleanLines[i + 2].trim();
        const l3 = cleanLines[i + 3].trim();
        if (dateRangeRe.test(l3) && !bulletRe.test(l1) && !bulletRe.test(l2)) {
          const dStr = l3.match(dateRangeRe)![0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
          let role = line;
          let comp = l1;
          let loc = l2;
          bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(role, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(comp, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
          i += 3;
          continue;
        }
      }

      // 3-line structure:
      // Case A: Role \n Company \n Location Date (e.g. "Julley Online" \n "Hyderabad Mar 2026 - Present")
      if (
        nextLine &&
        cleanLines[i + 2] &&
        !dateMatch &&
        !bulletRe.test(nextLine) &&
        !bulletRe.test(cleanLines[i + 2])
      ) {
        const nextNextLine = cleanLines[i + 2].trim();
        const nextNextDateMatch = nextNextLine.match(dateRangeRe);
        if (nextNextDateMatch) {
          const dStr = nextNextDateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
          const locPart = nextNextLine.replace(nextNextDateMatch[0], "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();
          let topPart = line;
          let bottomPart = nextLine;
          bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(topPart, allKnownLinks)}}{${formatLatexLine(locPart, allKnownLinks)}}\n  {${formatLatexLine(bottomPart, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
          i += 2;
          continue;
        }
      }

      // 3-line structure:
      // Line i: Company + Location (e.g. "Cyberdyne Technologies, Los Angeles, CA")
      // Line i+1: Role (e.g. "Principal Infrastructure Engineer")
      // Line i+2: Date (e.g. "Jan. 2020 to Present")
      if (
        nextLine &&
        cleanLines[i + 2] &&
        !dateMatch &&
        !nextDateMatch &&
        !bulletRe.test(nextLine) &&
        !bulletRe.test(cleanLines[i + 2])
      ) {
        const nextNextLine = cleanLines[i + 2].trim();
        const nextNextDateMatch = nextNextLine.match(dateRangeRe) || nextNextLine.match(/\b(20\d{2}|19\d{2})\b/);
        if (nextNextDateMatch) {
          const dStr = nextNextDateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
          const parsedOrg = parseOrgAndLoc(line);
          const org = parsedOrg.org || line;
          const loc = parsedOrg.loc;
          const role = nextLine.replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();

          bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(org, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(role, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
          i += 2;
          continue;
        }
      }

      if (dateMatch) {
        const dStr = dateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
        const remaining = line.replace(dateMatch[0], "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();
        const splitRem = splitTrailingLocation(remaining);
        bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(splitRem.main, allKnownLinks)}}{${formatLatexLine(splitRem.loc, allKnownLinks)}}\n  {${formatLatexLine(splitRem.main, allKnownLinks)}}{${formatLatexLine(dStr, allKnownLinks)}}\n`;
        continue;
      }

      bodyLatex += `${formatLatexLine(line, allKnownLinks)}\\\\[1pt]\n`;
      continue;
    }

    // 7. Dedicated PROJECTS section parser
    if (currentSectionName === "PROJECTS") {
      // If line is just "Project" or "Projects", skip completely to prevent duplicate labels
      if (/^(?:project|projects)$/i.test(line)) {
        continue;
      }

      let cleanProjLine = line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^\*{1,3}\s*/, "")
        .replace(/\s*\*{1,3}$/, "")
        .replace(/\s*[|–—]\s*Project\b/gi, "")
        .replace(/\s+Project$/gi, "");

      const projectHrefs: string[] = [];
      cleanProjLine = cleanProjLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        projectHrefs.push(markdownLinkToLatexHref(label, url));
        return "";
      });

      // Date first, so "Title  Code | Live Demo  2024" and "Title  2024  Code" both parse.
      let projDateStr = "";
      const pDateMatch = cleanProjLine.match(dateRangeRe) || cleanProjLine.match(/\b(20\d{2}|19\d{2})\b/);
      if (pDateMatch) {
        projDateStr = pDateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
        cleanProjLine = cleanProjLine.replace(pDateMatch[0], "");
      }

      // Trailing "Code | Live Demo" / "Code" / "Live Demo" labels. Anchored to the END of the line so a
      // title such as "Code Review Bot" keeps its words. Each label takes the next unused project link
      // (links are in reading order), so the k-th project gets the k-th Code / Demo URL.
      const linkLabel = (label: string, url?: string) =>
        url ? markdownLinkToLatexHref(label, url) : `\\textit{${label}}`;
      const trailing = cleanProjLine.match(/\s+(?:(Code|Source|Repo)(?:\s*[|•]?\s*(Live Demo|Demo))?|(Live Demo|Demo))\s*$/i);
      if (trailing) {
        if (trailing[1]) projectHrefs.push(linkLabel(trailing[1], projectCodeLinks[nextCodeLink++]?.url));
        const demoLabel = trailing[2] || trailing[3];
        if (demoLabel) projectHrefs.push(linkLabel(demoLabel, projectDemoLinks[nextDemoLink++]?.url));
        cleanProjLine = cleanProjLine.slice(0, trailing.index);
      }

      // Links whose anchor text is a (non-generic) phrase that appears in the line, e.g. a linked title.
      for (const kLink of allKnownLinks) {
        if (!kLink.url) continue;
        const anchor = kLink.text.trim();
        if (anchor.length < 3 || isGenericLinkAnchor(anchor) || /^https?:/i.test(anchor)) continue;
        const anchorRe = new RegExp(`(?<![A-Za-z0-9])${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`);
        if (anchorRe.test(cleanProjLine)) {
          projectHrefs.push(markdownLinkToLatexHref(anchor, kLink.url));
          cleanProjLine = cleanProjLine.replace(anchorRe, "");
        }
      }

      let cleanTitle = cleanProjLine
        .replace(/^[|–—\s]+|[|–—\s]+$/g, "")
        .trim();

      // Check if next lines contain techStack or separate "Code | Live Demo" line
      let techStack = "";
      let titlePart = cleanTitle;

      if (cleanTitle.includes("|") || cleanTitle.includes(" — ") || cleanTitle.includes(" - ")) {
        const sep = cleanTitle.includes("|") ? "|" : (cleanTitle.includes(" — ") ? " — " : " - ");
        const [pTitle, ...pRest] = cleanTitle.split(sep);
        titlePart = pTitle.trim();
        techStack = pRest.join(sep).trim();
      }

      // Check upcoming lines before bullets or headings
      while (i + 1 < cleanLines.length) {
        const nextL = cleanLines[i + 1].trim();
        if (bulletRe.test(nextL) || CANONICAL_HEADINGS.some(([, regex]) => regex.test(nextL.replace(/^[#*\-_~\s]+|[#*\-_~\s:]+$/g, "").trim()))) {
          break;
        }

        const isLinkLine = /^(?:\[?(?:Code|Source|Repo)\]?(?:\([^)]*\))?\s*[|•\s]*\[?(?:Live Demo|Demo)\]?(?:\([^)]*\))?|\[?(?:Live Demo|Demo)\]?(?:\([^)]*\))?)$/i.test(nextL);
        if (isLinkLine) {
          // Consume separate link line
          if (nextL.includes("Code") || nextL.includes("Source") || nextL.includes("Repo")) {
            projectHrefs.push(linkLabel("Code", projectCodeLinks[nextCodeLink++]?.url));
          }
          if (nextL.includes("Live Demo") || nextL.includes("Demo")) {
            projectHrefs.push(linkLabel("Live Demo", projectDemoLinks[nextDemoLink++]?.url));
          }
          i++;
        } else if (!techStack) {
          // Consume tech stack line
          techStack = nextL.replace(/\s*[|–—]\s*Project\b/gi, "").replace(/\s+Project$/gi, "").trim();
          i++;
        } else {
          break;
        }
      }

      const rightParts = [...projectHrefs];
      if (projDateStr) rightParts.push(projDateStr);
      const rightCol = rightParts.length > 0 ? rightParts.join(" \\enspace\\textbar\\enspace ") : "";

      techStack = techStack.replace(/\s*[|–—]\s*Project\b/gi, "").replace(/\s+Project$/gi, "").trim();

      if (techStack) {
        bodyLatex += `\\resumeProjectHeading\n  {\\textbf{${formatLatexLine(titlePart, allKnownLinks)}}}{${rightCol}}\n{\\small \\textit{${formatLatexLine(techStack, allKnownLinks)}}}\\\\[1pt]\\nopagebreak[4]\n`;
      } else {
        bodyLatex += `\\resumeProjectHeading\n  {\\textbf{${formatLatexLine(titlePart, allKnownLinks)}}}{${rightCol}}\n`;
      }
      continue;
    }

    // Certifications: one flowing row of entries (never a left/right split)
    if (currentSectionName === "CERTIFICATIONS") {
      const certTokens = line.split(/\s*[|•\t]+\s*/).map((p) => formatLatexLine(p.trim(), allKnownLinks)).filter(Boolean);
      bodyLatex += `{\\small ${certTokens.join(" \\enspace\\textbar\\enspace ")}\\par}\\vspace{1.5pt}\n`;
      continue;
    }

    // Pipe-separated headers without date
    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        bodyLatex += `\\textit{${formatLatexLine(parts[0], allKnownLinks)}} \\hfill \\textit{${parts.slice(1).map((p) => formatLatexLine(p, allKnownLinks)).join(" \\enspace\\textbar\\enspace ")}}\\\\[1pt]\n`;
      } else {
        bodyLatex += `${formatLatexLine(line, allKnownLinks)}\\\\[1pt]\n`;
      }
      continue;
    }

    // Plain line
    bodyLatex += `${formatLatexLine(line, allKnownLinks)}\\\\[1pt]\n`;
  }

  closeItemize();

  const cleanContacts = contactTokens
    .map((t) => t.replace(/[ƒ§ï\u2217*]/g, "").trim())
    .filter(Boolean);
  const formattedContacts = cleanContacts
    .map((token) => formatLatexLine(token, allKnownLinks))
    .join(" \\enspace\\textbar\\enspace ");

  const totalWords = cleanLines.join(" ").split(/\s+/).length;
  const totalCleanLines = cleanLines.length;
  const isMultiPage = totalWords > 850 || totalCleanLines > 72;

  let docClass: string;
  let geometrySetting: string;
  let titlespacingSetting: string;
  let itemizeSetting: string;

  if (isMultiPage) {
    docClass = "\\documentclass[a4paper,10pt]{article}";
    geometrySetting = "\\usepackage[a4paper,left=0.5in,right=0.5in,top=0.45in,bottom=0.45in]{geometry}";
    titlespacingSetting = "\\titlespacing*{\\section}{0pt}{4pt}{2pt}";
    itemizeSetting =
      "\\setlist[itemize]{leftmargin=0.15in, label=\\raisebox{0.15ex}{\\small\\textbullet}, itemsep=2.0pt, parsep=0pt, topsep=1.5pt, partopsep=0pt}";
  } else if (totalWords < 450 && totalCleanLines < 45) {
    // Low/medium density single-page resume: expand to 10.5pt font and generous spacing for 95%-98% full-page vertical fill
    docClass = "\\documentclass[a4paper,10.5pt]{extarticle}";
    geometrySetting = "\\usepackage[a4paper,left=0.5in,right=0.5in,top=0.45in,bottom=0.45in]{geometry}";
    titlespacingSetting = "\\titlespacing*{\\section}{0pt}{7.5pt plus 3pt minus 1pt}{4pt plus 1pt minus 0.5pt}";
    itemizeSetting =
      "\\setlist[itemize]{leftmargin=0.15in, label=\\raisebox{0.15ex}{\\small\\textbullet}, itemsep=3.0pt plus 1pt minus 0.5pt, parsep=0pt, topsep=2pt, partopsep=0pt}";
  } else {
    // Standard and high density: preserve hard readability minimums (10pt standard, 9.5pt min; itemsep >= 2pt; 0.5in margins)
    docClass = totalWords > 650 || totalCleanLines > 58 ? "\\documentclass[a4paper,9.5pt]{extarticle}" : "\\documentclass[a4paper,10pt]{article}";
    geometrySetting = "\\usepackage[a4paper,left=0.5in,right=0.5in,top=0.45in,bottom=0.45in]{geometry}";
    titlespacingSetting = "\\titlespacing*{\\section}{0pt}{6.0pt plus 2.5pt minus 1pt}{3.5pt plus 1pt minus 0.5pt}";
    itemizeSetting =
      "\\setlist[itemize]{leftmargin=0.15in, label=\\raisebox{0.15ex}{\\small\\textbullet}, itemsep=2.4pt plus 0.8pt minus 0.4pt, parsep=0pt, topsep=1.5pt, partopsep=0pt}";
  }

  let resultLatex = `%-------------------------
% Adaptive ATS LaTeX Resume
% Clean Typography, Zero Page Numbers, 100% ATS Compliant
%------------------------

${docClass}
${geometrySetting}
\\linespread{1.15}
\\usepackage{titlesec}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{enumitem}
\\usepackage{textcomp}
\\usepackage[hidelinks]{hyperref}
\\usepackage{tabularx}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\input{glyphtounicode}
\\pdfgentounicode=1

\\urlstyle{same}
${isMultiPage ? "\\raggedbottom\n" : ""}\\raggedright
\\setlength{\\tabcolsep}{0in}

\\titleformat{\\section}{\\scshape\\raggedright\\large\\bfseries}{}{0em}{}[\\color{black}\\titlerule]
${titlespacingSetting}

${itemizeSetting}

\\newcommand{\\resumeItem}[1]{
  \\item #1
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{5.5pt plus 2.5pt minus 1pt}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{#1} & \\textit{\\small #2} \\\\[-1pt]
    \\textit{\\small #3} & \\textit{\\small #4}
  \\end{tabular*}\\vspace{1.5pt}\\nopagebreak[4]
}

\\newcommand{\\resumeProjectHeading}[2]{
  \\vspace{5.5pt plus 2.5pt minus 1pt}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    #1 & \\textit{\\small #2}
  \\end{tabular*}\\vspace{1.5pt}\\nopagebreak[4]
}

\\newcommand{\\resumeDivider}{\\enspace\\textbar\\enspace}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}}

\\begin{document}
\\pagestyle{empty}
\\thispagestyle{empty}

%----------HEADING----------
\\begin{center}
  {\\LARGE \\scshape \\textbf{${escapeLatex(candidateName || "Candidate Name")}}} \\\\[2pt]
  \\small ${formattedContacts}
\\end{center}
\\vspace{-8pt}

%----------BODY SECTIONS----------
${bodyLatex}

\\end{document}
`;

  resultLatex = ensureAllHrefsPreservedInLatex(
    resultLatex,
    [options?.originalLatex, ...(options?.knownLinks ? [options.knownLinks] : []), optimizedText].filter(Boolean) as (string | ExtractedHyperlink[])[]
  );

  resultLatex = cleanLingeringPlaceholders(resultLatex, true);

  return resultLatex;
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
      return cleanCompany
        ? `Resume_${titleCased}_${cleanCompany}.${extension}`
        : `Resume_${titleCased}.${extension}`;
    }
  }

  return cleanCompany ? `Resume_${cleanCompany}.${extension}` : `Resume.${extension}`;
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
    .replace(/\.{2,}/g, ".");

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
  overlappingTools: string[] = []
): string {
  const role = targetRole || "Software Engineer";
  const domain =
    domainKeywords.length > 0 ? domainKeywords.slice(0, 2).join(" and ") : "scalable distributed architectures";
  const tools =
    overlappingTools.length > 0 ? overlappingTools.slice(0, 3).join(", ") : "modern full-stack technologies";

  const sentence1 = `Results-driven ${role} specializing in ${domain}.`;
  const sentence2 = `Demonstrated expertise in engineering high-reliability systems and production services utilizing ${tools}.`;

  return `${sentence1} ${sentence2}`;
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
    const content = match ? match[1].trim() : raw.trim();

    // Preserve company names and avoid modifying headings
    const isCompanyLine = companyNames.some((c) => c && content.toLowerCase().includes(c.toLowerCase()));
    if (isCompanyLine || modifiedCount >= targetCount) {
      reframed.push(raw);
      continue;
    }

    // Extract any existing quantitative metric so it remains strictly immutable
    const metricMatch = content.match(METRIC_RE);
    const existingMetric = metricMatch ? metricMatch[0] : "";

    // Check if bullet starts with a weak verb or could be structured in Google XYZ
    const startsWeak =
      /^(?:worked on developing|worked on building|worked on creating|worked on|assisted with|helped with|helped|responsible for|participated in|handled|implemented|built|developed)\b/i.test(
        content
      );

    const actionVerb = ACTION_VERBS[i % ACTION_VERBS.length];

    // If already strong, quantified and not using weak verbs, preserve as is
    if (!startsWeak && existingMetric && !/worked on/i.test(content)) {
      reframed.push(raw);
      continue;
    }

    // Strip leading weak verb phrase
    const cleanContent = content
      .replace(
        /^(?:worked on developing|worked on building|worked on creating|worked on|responsible for leading|responsible for managing|responsible for|assisted with|assisted in|helped with|helped|handled|participated in)\s*/i,
        ""
      )
      .replace(/^(?:implemented|built|developed|created|engineered)\s*/i, "");

    let newContent = "";
    if (existingMetric) {
      newContent = `${actionVerb} ${cleanContent}`;
    } else {
      newContent = `${actionVerb} ${cleanContent}`;
      if (!/[.!?]$/.test(newContent)) {
        newContent += ".";
      }
    }

    const prefix = match ? raw.slice(0, match.index! + (raw.length - match[1].length)) : "• ";
    reframed.push(`${prefix}${newContent}`);
    modifiedCount++;
  }

  return { reframedBullets: reframed, modifiedCount };
}

/**
 * Contextually weaves target skills into experience bullets using the "Twice Rule".
 * Example: If adding "Artificial Intelligence", reframes:
 * "Developed a multi-stage AI pipeline using YOLO, SAHI, and OCR to extract tags."
 * -> "Spearheaded an Artificial Intelligence pipeline combining YOLO and SAHI to extract tags."
 */
export function weaveSkillIntoExperienceBullets(
  bullets: string[],
  skill: string
): { wovenBullets: string[]; success: boolean } {
  const normSkill = skill.trim();
  if (!normSkill || bullets.length === 0) return { wovenBullets: bullets, success: false };

  const escapedSkill = [...normSkill].map((c) => (/[a-z0-9 ]/i.test(c) ? c : "\\" + c)).join("");
  const exactRe = new RegExp("(^|[^a-z0-9+#])" + escapedSkill + "(?=$|[^a-z0-9+#])", "i");

  // Already present with exact skill name?
  if (bullets.some((b) => exactRe.test(b))) {
    return { wovenBullets: bullets, success: true };
  }

  const updatedBullets = [...bullets];

  // 1. Artificial Intelligence
  if (/^artificial intelligence$/i.test(normSkill)) {
    for (let i = 0; i < updatedBullets.length; i++) {
      const b = updatedBullets[i];
      if (/yolo|sahi|pipeline|ocr|drawing tag|vision/i.test(b)) {
        if (/multi-stage\s+(?:AI\s+)?pipeline\s+using/i.test(b)) {
          updatedBullets[i] = b.replace(
            /^(?:Developed|Engineered|Spearheaded)?\s*(?:a|an)?\s*multi-stage\s+(?:AI\s+)?pipeline\s+using/i,
            "Spearheaded an Artificial Intelligence pipeline combining"
          );
          return { wovenBullets: updatedBullets, success: true };
        }
        if (/multi-stage\s+(?:AI\s+)?pipeline/i.test(b)) {
          updatedBullets[i] = b.replace(
            /^(?:Developed|Engineered|Spearheaded)?\s*(?:a|an)?\s*multi-stage\s+(?:AI\s+)?pipeline/i,
            "Spearheaded an Artificial Intelligence pipeline combining"
          );
          return { wovenBullets: updatedBullets, success: true };
        }
        if (/pipeline/i.test(b) && !exactRe.test(b)) {
          updatedBullets[i] = b.replace(/\bpipeline\b/i, "Artificial Intelligence pipeline");
          return { wovenBullets: updatedBullets, success: true };
        }
        if (/yolo/i.test(b) && !exactRe.test(b)) {
          updatedBullets[i] = b.replace(/\b(?:using|with)\s+YOLO/i, "an Artificial Intelligence pipeline combining YOLO");
          return { wovenBullets: updatedBullets, success: true };
        }
      }
    }
  }

  // 2. Python
  if (/^python$/i.test(normSkill)) {
    for (let i = 0; i < updatedBullets.length; i++) {
      const b = updatedBullets[i];
      if (/fastapi|flask|django|ardupilot/i.test(b) && !exactRe.test(b)) {
        updatedBullets[i] = b.replace(/\b(FastAPI|Flask|Django)\b/i, "Python and $1");
        return { wovenBullets: updatedBullets, success: true };
      }
    }
  }

  // 3. Docker / Kubernetes
  if (/^docker$/i.test(normSkill) || /^kubernetes$/i.test(normSkill)) {
    for (let i = 0; i < updatedBullets.length; i++) {
      const b = updatedBullets[i];
      if (/integration hub|microservices|distributed/i.test(b) && !exactRe.test(b)) {
        updatedBullets[i] = b.replace(/\b(integration hub|microservices)\b/i, `$1 using ${normSkill}`);
        return { wovenBullets: updatedBullets, success: true };
      }
    }
  }

  // 4. Generic contextual weaving into technical bullet
  for (let i = 0; i < updatedBullets.length; i++) {
    const b = updatedBullets[i];
    if (b.length > 25 && !exactRe.test(b)) {
      if (/\busing\s+([A-Za-z0-9,\s&]+?)(?=[.,;!?]|$)/i.test(b)) {
        updatedBullets[i] = b.replace(/\busing\s+([A-Za-z0-9,\s&]+?)(?=[.,;!?]|$)/i, `using $1 and ${normSkill}`);
        return { wovenBullets: updatedBullets, success: true };
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
      const linkMatch = line.match(/https?:\/\/[^\s|)]+/g);
      if (linkMatch) {
        for (const url of linkMatch) {
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

      const dateMatch = line.match(dateRangeRe);
      const nextLine = i + 1 < cleanLines.length ? cleanLines[i + 1].trim() : "";
      const nextDateMatch = nextLine.match(dateRangeRe);

      if (dateMatch && !bulletRe.test(line)) {
        const dStr = dateMatch[0];
        const rem = line.replace(dStr, "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();
        const parsed = splitTrailingLocation(rem);
        let role = parsed.main;
        let comp = "";
        let loc = parsed.loc;
        if (nextLine && !bulletRe.test(nextLine) && !nextDateMatch && !CANONICAL_HEADINGS.some(([, r]) => r.test(nextLine))) {
          comp = nextLine;
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

      let pTitle = line;
      let pTech = "";
      if (line.includes("|") || line.includes(" - ") || line.includes(" — ")) {
        const sep = line.includes("|") ? "|" : (line.includes(" — ") ? " — " : " - ");
        const [t, ...r] = line.split(sep);
        pTitle = t.trim();
        pTech = r.join(sep).trim();
      }
      projects.push({ title: pTitle, techStack: pTech || undefined, bullets: [] });
      continue;
    }

    if (currentSection === "EDUCATION") {
      const dateMatch = line.match(dateRangeRe);
      const nextLine = i + 1 < cleanLines.length ? cleanLines[i + 1].trim() : "";
      if (dateMatch) {
        const dStr = dateMatch[0];
        const instPart = line.replace(dStr, "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();
        let degPart = "";
        let gpaPart = "";
        if (nextLine && !CANONICAL_HEADINGS.some(([, r]) => r.test(nextLine))) {
          degPart = nextLine;
          const gpaMatch = degPart.match(/(?:CGPA|GPA|Percentage):\s*([0-9.]+(?:\/[0-9.]+)?%?)/i);
          if (gpaMatch) gpaPart = gpaMatch[0];
          i++;
        }
        education.push({
          institution: instPart,
          degree: degPart || instPart,
          dateRange: dStr,
          gpa: gpaPart || undefined,
          bullets: [],
        });
      } else {
        education.push({ institution: line, degree: nextLine || line, bullets: [] });
        if (nextLine) i++;
      }
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

  return CanonicalResumeSchema.parse({
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
  });
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

      if (Array.isArray(exp.subheadings)) {
        for (const s of exp.subheadings) {
          parts.push(`– ${s.title}${s.techStack ? ` — ${s.techStack}` : ""}`);
          if (Array.isArray(s.bullets)) {
            for (const b of s.bullets) {
              parts.push(`∗ ${b}`);
            }
          }
        }
      }
      if (Array.isArray(exp.bullets)) {
        for (const b of exp.bullets) {
          parts.push(`∗ ${b}`);
        }
      }
    }
  }

  // 5. Projects
  if (canonical.projects && canonical.projects.length > 0) {
    parts.push("Projects");
    for (const proj of canonical.projects) {
      parts.push(`• ${proj.title}${proj.techStack ? ` - ${proj.techStack}` : ""}${proj.dateRange ? ` ${proj.dateRange}` : ""}`);
      if (Array.isArray(proj.bullets)) {
        for (const b of proj.bullets) {
          parts.push(`– ${b}`);
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
          parts.push(`– ${b}`);
        }
      }
    }
  }

  // 7. Achievements
  if (canonical.achievements && canonical.achievements.length > 0) {
    parts.push("Achievements");
    for (const ach of canonical.achievements) {
      parts.push(`• ${ach}`);
    }
  }

  // 8. Certifications
  if (canonical.certifications && canonical.certifications.length > 0) {
    parts.push("Certifications");
    for (const cert of canonical.certifications) {
      parts.push(`• ${cert}`);
    }
  }

  return parts.join("\n");
}

/**
 * Constructs clean ATS LaTeX directly from a CanonicalResume object without regex replacements.
 */
export function generateLatexFromCanonical(
  resume: CanonicalResume,
  options?: { originalLatex?: string; knownLinks?: ExtractedHyperlink[] }
): string {
  const plainText = canonicalToPlainText(resume);
  return generateATSLatex(plainText, options);
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
 * Trims lowest-priority / oldest minor bullet points if single-page resume overflows 1-page budget,
 * preserving readable typography (10pt base font, \linespread{1.15}, 2pt itemsep, 0.5in margins).
 */
export function trimContentForSinglePage(canonical: CanonicalResume): {
  canonical: CanonicalResume;
  trimmedCount: number;
} {
  let trimmedCount = 0;

  function estimateTotalLines(res: CanonicalResume): number {
    let lines = 4;
    if (res.summary) lines += Math.ceil(res.summary.length / 85) + 1;
    if (res.technicalSkills) {
      if (typeof res.technicalSkills === "object" && !Array.isArray(res.technicalSkills)) {
        lines += Object.keys(res.technicalSkills).length + 1;
      } else {
        lines += 3;
      }
    }
    for (const exp of res.experience) {
      lines += 2;
      if (Array.isArray(exp.subheadings)) {
        for (const sub of exp.subheadings) {
          lines += 1.5;
          if (Array.isArray(sub.bullets)) {
            for (const b of sub.bullets) {
              lines += Math.max(1, Math.ceil(b.length / 90)) + 0.2;
            }
          }
        }
      }
      if (Array.isArray(exp.bullets)) {
        for (const b of exp.bullets) {
          lines += Math.max(1, Math.ceil(b.length / 90)) + 0.2;
        }
      }
    }
    for (const proj of res.projects) {
      lines += 2;
      if (Array.isArray(proj.bullets)) {
        for (const b of proj.bullets) {
          lines += Math.max(1, Math.ceil(b.length / 90)) + 0.2;
        }
      }
    }
    lines += (res.education?.length || 1) * 2;
    lines += res.achievements?.length || 0;
    lines += res.certifications?.length || 0;
    return lines;
  }

  let currentLines = estimateTotalLines(canonical);

  // If <= 46 lines or multi-page (>72 lines), no trimming needed
  if (currentLines <= 46 || currentLines > 72) {
    return { canonical, trimmedCount: 0 };
  }

  // Iterate backwards through older roles
  for (let e = canonical.experience.length - 1; e >= 0; e--) {
    const exp = canonical.experience[e];

    if (Array.isArray(exp.subheadings) && exp.subheadings.length > 0) {
      for (let s = exp.subheadings.length - 1; s >= 0; s--) {
        const sub = exp.subheadings[s];
        if (Array.isArray(sub.bullets) && sub.bullets.length >= 3) {
          sub.bullets.pop();
          trimmedCount++;
          currentLines = estimateTotalLines(canonical);
          if (currentLines <= 46) return { canonical, trimmedCount };
        }
      }
    }

    if (Array.isArray(exp.bullets) && exp.bullets.length >= 3) {
      exp.bullets.pop();
      trimmedCount++;
      currentLines = estimateTotalLines(canonical);
      if (currentLines <= 46) return { canonical, trimmedCount };
    }
  }

  // If still overflowing, check projects with >= 3 bullets
  for (let p = canonical.projects.length - 1; p >= 0; p--) {
    const proj = canonical.projects[p];
    if (Array.isArray(proj.bullets) && proj.bullets.length >= 3) {
      proj.bullets.pop();
      trimmedCount++;
      currentLines = estimateTotalLines(canonical);
      if (currentLines <= 46) return { canonical, trimmedCount };
    }
  }

  return { canonical, trimmedCount };
}

/**
 * Validates that all tools listed in Technical Skills are grounded in work history/projects.
 * Self-corrects any orphaned skills by contextually weaving them into experience bullets (Twice Rule)
 * or removing ungrounded additions to avoid modern ATS penalties.
 */
export function validateAndProtectOrphanedSkills(
  resumeText: string,
  experienceBullets: string[]
): { sanitizedText: string; orphanedSkills: string[]; wovenBullets?: string[] } {
  const lines = resumeText.split("\n");
  let inSkillsSection = false;
  const orphanedSkills: string[] = [];
  const modifiedLines: string[] = [];

  let currentBullets = [...experienceBullets];
  let combinedBulletsText = currentBullets.join(" ").toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (
      /^(?:#{1,3}\s*)?(?:technical |core |key |professional )?(?:skills|technologies|competencies)\s*:?$/i.test(
        trimmed
      )
    ) {
      inSkillsSection = true;
      modifiedLines.push(line);
      continue;
    }

    if (inSkillsSection && /^(?:#{1,3}\s*)?[A-Z\s]{4,}:?$/.test(trimmed) && !trimmed.toLowerCase().includes("skills")) {
      inSkillsSection = false;
    }

    if (inSkillsSection && trimmed.includes(":")) {
      const [category, skillsStr] = trimmed.split(/:\s*(.*)/);
      if (skillsStr) {
        const skills = skillsStr.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
        const groundedSkills: string[] = [];

        for (const skill of skills) {
          let isGrounded =
            containsSkill(combinedBulletsText, skill) || combinedBulletsText.includes(skill.toLowerCase());

          if (!isGrounded) {
            // Attempt Twice-Rule contextual weaving into experience bullets!
            const weaveRes = weaveSkillIntoExperienceBullets(currentBullets, skill);
            if (weaveRes.success) {
              currentBullets = weaveRes.wovenBullets;
              combinedBulletsText = currentBullets.join(" ").toLowerCase();
              isGrounded = true;
            }
          }

          if (isGrounded) {
            groundedSkills.push(skill);
          } else {
            orphanedSkills.push(skill);
          }
        }

        const finalSkills = groundedSkills.length > 0 ? groundedSkills : skills;
        modifiedLines.push(`${category}: ${finalSkills.join(", ")}`);
        continue;
      }
    }

    modifiedLines.push(line);
  }

  return {
    sanitizedText: modifiedLines.join("\n"),
    orphanedSkills,
    wovenBullets: currentBullets,
  };
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
}): {
  optimizedText: string;
  optimizedLatex: string;
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

    // Summary rewriting
    if (canonical.summary) {
      const targetRoleMatch = params.jobText.match(
        /(?:looking for (?:a|an)?|seeking (?:a|an)?|hiring (?:a|an)?|title:?\s*)([A-Za-z0-9\s-]{4,40}?)(?:\.|\n|,|with|to)/i
      );
      const targetRole = targetRoleMatch ? targetRoleMatch[1].trim() : "Software Engineer";
      const domainTerms = targetKeywords.filter((k) =>
        /microservice|distributed|architecture|cloud|real-time|system design|data/i.test(k)
      );
      const allText = canonicalToPlainText(canonical);
      const candidateSkills = jdReqs
        .filter((r) => containsSkill(allText, r.keyword))
        .map((r) => r.keyword);
      canonical.summary = rewriteSummaryWithJDAlignment(canonical.summary, targetRole, domainTerms, candidateSkills);
    }

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
    // If a skill is in Technical Skills, it MUST appear in at least one Work Experience bullet!
    if (canonical.technicalSkills && typeof canonical.technicalSkills === "object" && !Array.isArray(canonical.technicalSkills)) {
      const currentExpBullets = getAllExperienceBullets(canonical);
      for (const [cat, skillsList] of Object.entries(canonical.technicalSkills)) {
        if (!Array.isArray(skillsList)) continue;
        const validSkills: string[] = [];
        for (const skill of skillsList) {
          const isPresent = currentExpBullets.some((b) => containsSkill(b, skill));
          if (isPresent) {
            validSkills.push(skill);
            twicePromotions++;
          } else {
            let woven = false;
            for (const exp of canonical.experience) {
              if (Array.isArray(exp.subheadings)) {
                for (const sub of exp.subheadings) {
                  const res = weaveSkillIntoExperienceBullets(sub.bullets, skill);
                  if (res.success) {
                    sub.bullets = res.wovenBullets;
                    validSkills.push(skill);
                    twicePromotions++;
                    woven = true;
                    break;
                  }
                }
              }
              if (woven) break;
              if (Array.isArray(exp.bullets)) {
                const res = weaveSkillIntoExperienceBullets(exp.bullets, skill);
                if (res.success) {
                  exp.bullets = res.wovenBullets;
                  validSkills.push(skill);
                  twicePromotions++;
                  woven = true;
                  break;
                }
              }
            }
            if (!woven) {
              // Not grounded or woven -> omit to avoid orphaned skill penalty
            }
          }
        }
        canonical.technicalSkills[cat] = validSkills.length > 0 ? validSkills : skillsList;
      }
    }
  }

  // PASS 5: Content Trimming Fallback for single-page budget
  trimContentForSinglePage(canonical);

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

  // Construct final optimizedText and optimizedLatex cleanly from structured schema
  let updatedText = canonicalToPlainText(canonical);
  updatedText = cleanSmartTypography(updatedText);
  updatedText = cleanLingeringPlaceholders(updatedText, false);

  let updatedLatex = generateATSLatex(updatedText, { originalLatex: params.latex });
  updatedLatex = cleanLingeringPlaceholders(updatedLatex, true);

  if (params.latex && params.latex.trim()) {
    updatedLatex = restoreMissingHyperlinksInLatex(updatedLatex, params.latex);
  }

  return {
    optimizedText: updatedText,
    optimizedLatex: updatedLatex,
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
}): Promise<{
  optimizedText: string;
  optimizedLatex: string;
  baselineScore: number;
  finalScore: number;
  attachmentFilename: string;
}> {
  const reqs = extractRequirementsFromJobText(params.jobText);
  const baselineScoring = scoreResume(params.resumeText, reqs, params.jobText);

  let audit: UnifiedATSAudit | null = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await analyzeResume(params.resumeText, params.jobText);
      if (res?.unifiedAudit) {
        audit = res.unifiedAudit as unknown as UnifiedATSAudit;
      }
    } catch (err) {
      console.warn("AI ATS analysis failed in autoTailorResumeToJD, using deterministic remediation passes:", err);
    }
  }

  const { optimizedText, optimizedLatex } = runAllRemediationPasses({
    text: params.resumeText,
    latex: params.sourceLatex,
    audit,
    jobText: params.jobText,
  });

  const finalLatex = ensureAllHrefsPreservedInLatex(
    optimizedLatex,
    [params.sourceLatex, params.resumeText].filter(Boolean) as string[]
  );

  const finalScoring = scoreResume(optimizedText, reqs, params.jobText);
  const attachmentFilename = getCandidateFilename(
    params.resumeText,
    params.companyName || params.jobText
  );

  return {
    optimizedText,
    optimizedLatex: finalLatex,
    baselineScore: baselineScoring.score,
    finalScore: finalScoring.score,
    attachmentFilename,
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
    const formData = new FormData();
    formData.append("filecontents[]", safeLatex);
    formData.append("filename[]", "document.tex");
    formData.append("engine", engine);
    formData.append("return", "pdf");

    return fetch("https://texlive.net/cgi-bin/latexcgi", {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000), // 30s timeout
    });
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
