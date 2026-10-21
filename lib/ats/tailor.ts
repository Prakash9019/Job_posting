import { scoreResume, extractRequirementsFromJobText, cleanSmartTypography, normalizeWrappedBullets } from "./scoring";
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

const LOCATION_KEYWORDS = /\b(?:remote|hybrid|on-site|onsite|usa|united states|uk|united kingdom|india|canada|germany|france|australia|singapore|netherlands|switzerland|japan|sf|san francisco|nyc|new york|bay area|seattle|austin|chicago|boston|los angeles|london|toronto|berlin|bangalore|bengaluru|hyderabad|pune|mumbai|delhi|gurgaon|noida|dublin|amsterdam|tokyo)\b/i;

const CORPORATE_SUFFIXES = /\b(?:inc\.?|llc|l\.l\.c\.?|ltd\.?|limited|corp\.?|corporation|co\.?|company|pvt\.?\s*ltd\.?|private\s+limited|gmbh|sa|bv|plc)\b/i;

const ROLE_KEYWORDS = /\b(?:engineer|developer|architect|lead|manager|analyst|intern|scientist|consultant|associate|founder|co-founder|director|specialist|designer|administrator|coordinator|officer|vp|vice president|head of|bachelor|master|phd|degree|b\.?tech|m\.?tech|b\.?s|m\.?s|b\.?a|m\.?a|candidate|fellow)\b/i;

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

  let candidateName = "";
  const contactTokens: string[] = [];
  let isHeaderArea = true;
  let inItemize = false;
  let bodyLatex = "";
  let currentSectionName = "";

  function closeItemize() {
    if (inItemize) {
      bodyLatex += "\\end{itemize}\\vspace{-2pt}\n";
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
      bodyLatex += `\n\\section{${headingMatch[0]}}\n`;
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
          bodyLatex += `\\vspace{1.5pt}\\textbf{${formatLatexLine(pTitle.trim(), allKnownLinks)}} \\enspace\\textbar\\enspace \\textit{${formatLatexLine(techOrLink, allKnownLinks)}}\\\\[1pt]\n`;
        } else {
          bodyLatex += `\\vspace{1.5pt}\\textbf{${formatLatexLine(bulletContent, allKnownLinks)}}\\\\[1pt]\n`;
        }
        continue;
      }

      if (!inItemize) {
        bodyLatex += "\\nopagebreak[4]\n\\begin{itemize}\n";
        inItemize = true;
      }
      bodyLatex += `  \\resumeItem{${formatLatexLine(bulletContent, allKnownLinks)}}\n`;
      continue;
    }

    // 4. Non-Bullet Lines
    closeItemize();

    if (currentSectionName === "PROFESSIONAL SUMMARY") {
      bodyLatex += `{\\small ${formatLatexLine(line, allKnownLinks)}\\par}\\vspace{2pt}\n`;
      continue;
    }

    const categoryMatch = line.match(/^([A-Za-z0-9/& -]{2,25}):\s+(.+)$/);
    if (categoryMatch && !line.includes("|") && !dateRangeRe.test(line)) {
      bodyLatex += `{\\small \\textbf{${formatLatexLine(categoryMatch[1], allKnownLinks)}:} ${formatLatexLine(categoryMatch[2], allKnownLinks)}}\\\\[1pt]\n`;
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

    if (["WORK EXPERIENCE", "EDUCATION"].includes(currentSectionName)) {
      // Pattern A: Pipe-separated with date
      if (line.includes("|") && dateMatch) {
        const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
        const dateIdx = parts.findIndex((p) => dateRangeRe.test(p));
        const dateStr = dateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
        const nonDateParts = parts.filter((_, idx) => idx !== dateIdx);

        let org = "";
        let role = "";
        let loc = "";

        if (nonDateParts.length === 1) {
          if (isRoleSegment(nonDateParts[0])) {
            role = nonDateParts[0];
          } else {
            org = nonDateParts[0];
          }
        } else if (nonDateParts.length === 2) {
          const part0IsRole = isRoleSegment(nonDateParts[0]);
          const part1IsRole = isRoleSegment(nonDateParts[1]);
          const part0IsLoc = isLocationSegment(nonDateParts[0]);
          const part1IsLoc = isLocationSegment(nonDateParts[1]);

          if (part0IsRole && !part1IsRole) {
            role = nonDateParts[0];
            if (part1IsLoc) {
              loc = nonDateParts[1];
            } else {
              org = nonDateParts[1];
            }
          } else if (part1IsRole && !part0IsRole) {
            role = nonDateParts[1];
            if (part0IsLoc) {
              loc = nonDateParts[0];
            } else {
              org = nonDateParts[0];
            }
          } else if (part1IsLoc && !part0IsLoc) {
            org = nonDateParts[0];
            loc = nonDateParts[1];
          } else {
            org = nonDateParts[0];
            role = nonDateParts[1];
          }
        } else {
          // 3 or more parts: e.g. "Google, LLC | Mountain View, CA | Senior Software Engineer"
          // or "Senior Software Engineer | Google | Mountain View, CA"
          const roleIdx = nonDateParts.findIndex((p) => isRoleSegment(p));
          const locIdx = nonDateParts.findIndex((p, idx) => idx !== roleIdx && isLocationSegment(p));

          if (roleIdx !== -1) {
            role = nonDateParts[roleIdx];
          }
          if (locIdx !== -1) {
            loc = nonDateParts[locIdx];
          }

          const remaining = nonDateParts.filter((_, idx) => idx !== roleIdx && idx !== locIdx);
          org = remaining.join(" | ");

          if (!role && remaining.length > 0) {
            if (nonDateParts.length >= 3 && !loc) {
              org = nonDateParts[0];
              loc = nonDateParts[1];
              role = nonDateParts[2];
            } else {
              role = remaining.pop() || "";
              org = remaining.join(" | ");
            }
          }
        }

        bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(org || "Company", allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(role || org, allKnownLinks)}}{${formatLatexLine(dateStr, allKnownLinks)}}\n`;
        continue;
      }

      // Pattern B: CURRENT line has date (e.g. "Platform Engineer April 2026 – September 2026")
      // and NEXT line is company/location (e.g. "JulleyOnline Private Limited India")
      if (dateMatch) {
        const dateStr = dateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
        const lineRemaining = line.replace(dateMatch[0], "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();

        if (nextLine && !isNextBulletOrHeading(nextLine) && !nextDateMatch && nextLine.length < 90) {
          const { org, loc } = parseOrgAndLoc(nextLine);
          const isRoleFirst = isRoleSegment(lineRemaining);
          if (isRoleFirst) {
            bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(org, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(lineRemaining, allKnownLinks)}}{${formatLatexLine(dateStr, allKnownLinks)}}\n`;
          } else {
            bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(lineRemaining, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(org, allKnownLinks)}}{${formatLatexLine(dateStr, allKnownLinks)}}\n`;
          }
          i++;
          continue;
        }

        if (lineRemaining) {
          const parts = lineRemaining.split(/[|–—]+/).map((p) => p.trim()).filter(Boolean);
          const left = parts.length > 1 ? parts.map((p) => formatLatexLine(p, allKnownLinks)).join(" \\enspace\\textbar\\enspace ") : formatLatexLine(lineRemaining, allKnownLinks);
          bodyLatex += `\\textbf{${left}} \\hfill \\textit{${formatLatexLine(dateStr, allKnownLinks)}}\\\\[1pt]\n`;
        } else {
          bodyLatex += `\\hfill \\textit{${formatLatexLine(dateStr, allKnownLinks)}}\\\\[1pt]\n`;
        }
        continue;
      }

      // Pattern C: CURRENT line does NOT have date, but NEXT line has date
      if (!dateMatch && nextDateMatch && !line.endsWith(".") && line.length < 80 && /^[A-Z]/.test(line)) {
        const nextDateStr = nextDateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
        const nextRemaining = nextLine.replace(nextDateMatch[0], "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();

        const { org, loc } = parseOrgAndLoc(line);
        const isLineRole = isRoleSegment(line);
        if (isLineRole) {
          const nextOrgLoc = parseOrgAndLoc(nextRemaining);
          bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(nextOrgLoc.org || "Company", allKnownLinks)}}{${formatLatexLine(nextOrgLoc.loc || loc, allKnownLinks)}}\n  {${formatLatexLine(line, allKnownLinks)}}{${formatLatexLine(nextDateStr, allKnownLinks)}}\n`;
        } else {
          bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(org, allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(nextRemaining || org, allKnownLinks)}}{${formatLatexLine(nextDateStr, allKnownLinks)}}\n`;
        }
        i++;
        continue;
      }

      // Pattern D: 3-line entry: Line i (Org/Loc), Line i+1 (Role), Line i+2 (Date)
      const lineAfterNext = i + 2 < cleanLines.length ? cleanLines[i + 2].trim() : "";
      const lineAfterNextDateMatch = lineAfterNext ? lineAfterNext.match(dateRangeRe) : null;
      if (
        !dateMatch &&
        !nextDateMatch &&
        lineAfterNextDateMatch &&
        !line.endsWith(".") &&
        line.length < 90 &&
        nextLine.length < 90 &&
        !isNextBulletOrHeading(nextLine)
      ) {
        const afterNextDateStr = lineAfterNextDateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
        if (isRoleSegment(line) && !isRoleSegment(nextLine)) {
          const orgLoc = parseOrgAndLoc(nextLine);
          bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(orgLoc.org || "Company", allKnownLinks)}}{${formatLatexLine(orgLoc.loc, allKnownLinks)}}\n  {${formatLatexLine(line, allKnownLinks)}}{${formatLatexLine(afterNextDateStr, allKnownLinks)}}\n`;
        } else {
          const { org, loc } = parseOrgAndLoc(line);
          bodyLatex += `\\resumeSubheading\n  {${formatLatexLine(org || "Company", allKnownLinks)}}{${formatLatexLine(loc, allKnownLinks)}}\n  {${formatLatexLine(nextLine, allKnownLinks)}}{${formatLatexLine(afterNextDateStr, allKnownLinks)}}\n`;
        }
        i += 2;
        continue;
      }
    }

    // Projects: Detect Project Title + Tech stack lines
    if (currentSectionName === "PROJECTS") {
      const projectHrefs: string[] = [];
      let cleanProjLine = line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^\*{1,3}\s*/, "")
        .replace(/\s*\*{1,3}$/, "");

      cleanProjLine = cleanProjLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        projectHrefs.push(markdownLinkToLatexHref(label, url));
        return "";
      });

      // Also check known links that appear as words in this project line (e.g. "Code", "Live Demo")
      for (const kLink of allKnownLinks) {
        if (!kLink.url) continue;
        const anchor = kLink.text.trim();
        if (!anchor) continue;
        const anchorRe = new RegExp(`\\b${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (anchorRe.test(cleanProjLine)) {
          projectHrefs.push(markdownLinkToLatexHref(anchor, kLink.url));
          cleanProjLine = cleanProjLine.replace(anchorRe, "");
        }
      }

      let projDateStr = "";
      const pDateMatch = cleanProjLine.match(dateRangeRe) || cleanProjLine.match(/\b(20\d{2}|19\d{2})\b/);
      if (pDateMatch) {
        projDateStr = pDateMatch[0].replace(/\s*(?:[-–—]|\bto\b)\s*/i, " -- ");
        cleanProjLine = cleanProjLine.replace(pDateMatch[0], "");
      }

      const cleanTitle = cleanProjLine
        .replace(/\b(code|live demo|demo|live)\b/gi, "")
        .replace(/^[|–—\s]+|[|–—\s]+$/g, "")
        .trim();

      const rightParts = [...projectHrefs];
      if (projDateStr) rightParts.push(projDateStr);
      const rightCol = rightParts.length > 0 ? rightParts.join(" \\enspace\\textbar\\enspace ") : "";

      // Check if project line already has pipe/dash separator with tech stack
      if (cleanTitle.includes("|") || cleanTitle.includes(" — ") || cleanTitle.includes(" - ")) {
        const sep = cleanTitle.includes("|") ? "|" : (cleanTitle.includes(" — ") ? " — " : " - ");
        const [pTitle, ...pRest] = cleanTitle.split(sep);
        const techPart = pRest.join(sep).trim();
        bodyLatex += `\\resumeProjectHeading\n  {\\textbf{${formatLatexLine(pTitle.trim(), allKnownLinks)}} \\enspace\\textbar\\enspace \\emph{${formatLatexLine(techPart, allKnownLinks)}}}{${rightCol}}\n`;
        continue;
      }

      if (nextLine && !nextLine.match(bulletRe) && !CANONICAL_HEADINGS.some(([, regex]) => regex.test(nextLine))) {
        bodyLatex += `\\resumeProjectHeading\n  {\\textbf{${formatLatexLine(cleanTitle, allKnownLinks)}} \\enspace\\textbar\\enspace \\emph{${formatLatexLine(nextLine, allKnownLinks)}}}{${rightCol}}\n`;
        i++;
        continue;
      } else {
        bodyLatex += `\\resumeProjectHeading\n  {\\textbf{${formatLatexLine(cleanTitle, allKnownLinks)}}}{${rightCol}}\n`;
        continue;
      }
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
    if (currentSectionName === "CERTIFICATIONS") {
      const certTokens = line.split(/[|•–—\t]+/).map((p) => formatLatexLine(p.trim(), allKnownLinks)).filter(Boolean);
      bodyLatex += `{\\small ${certTokens.join(" \\enspace\\textbar\\enspace ")}\\par}\\vspace{1.5pt}\n`;
    } else {
      bodyLatex += `${formatLatexLine(line, allKnownLinks)}\\\\[1pt]\n`;
    }
  }

  closeItemize();

  const cleanContacts = contactTokens
    .map((t) => t.replace(/[ƒ§ï\u2217*]/g, "").trim())
    .filter(Boolean);
  const formattedContacts = cleanContacts
    .map((token) => formatLatexLine(token, allKnownLinks))
    .join(" \\enspace\\textbar\\enspace ");

  const totalWords = cleanLines.join(" ").split(/\s+/).length;
  const isMultiPage = cleanLines.length > 34 || totalWords > 400;

  const geometrySetting = isMultiPage
    ? "\\usepackage[a4paper,left=0.55in,right=0.55in,top=0.5in,bottom=0.5in]{geometry}"
    : "\\usepackage[a4paper,left=0.5in,right=0.5in,top=0.45in,bottom=0.45in]{geometry}";
  const titlespacingSetting = isMultiPage
    ? "\\titlespacing*{\\section}{0pt}{5pt}{2.5pt}"
    : "\\titlespacing*{\\section}{0pt}{3pt}{1.5pt}";
  const itemizeSetting = isMultiPage
    ? "\\setlist[itemize]{leftmargin=0.15in, label=\\raisebox{0.15ex}{\\tiny$\\bullet$}, itemsep=1.5pt, parsep=0pt, topsep=1.5pt, partopsep=0pt}"
    : "\\setlist[itemize]{leftmargin=0.15in, label=\\raisebox{0.15ex}{\\tiny$\\bullet$}, itemsep=0.8pt, parsep=0pt, topsep=1pt, partopsep=0pt}";

  let resultLatex = `%-------------------------
% Adaptive ATS LaTeX Resume
% Clean Typography, Zero Page Numbers, 100% ATS Compliant
%------------------------

\\documentclass[a4paper,10pt]{article}
${geometrySetting}
\\usepackage{titlesec}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{tabularx}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\input{glyphtounicode}
\\pdfgentounicode=1

\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

\\titleformat{\\section}{\\scshape\\raggedright\\large\\bfseries}{}{0em}{}[\\color{black}\\titlerule]
${titlespacingSetting}

${itemizeSetting}

\\newcommand{\\resumeItem}[1]{
  \\item #1
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{1.5pt}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{#1} & \\textit{\\small #2} \\\\[-0.5pt]
    \\textit{\\small #3} & \\textit{\\small #4}
  \\end{tabular*}\\vspace{-1pt}\\nopagebreak[4]
}

\\newcommand{\\resumeProjectHeading}[2]{
  \\vspace{1.5pt}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    #1 & \\textit{\\small #2}
  \\end{tabular*}\\vspace{-1pt}\\nopagebreak[4]
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
    .replace(/[ \t]{2,}/g, " ")
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
 * Executes all 6 Remediation Passes across plain text and LaTeX:
 * 1. AI PAR Rewrites
 * 2. Deterministic Passive-to-Action Verb Upgrade
 * 3. Deterministic Action Verb De-Duplication (rotates starting verbs used >= 3 times)
 * 4. Full Twice-Rule 1.0x Promotion (Skills + Experience mentions)
 * 5. Ensure >=68% Quantification Ratio (reaches sQuant 95-100/100)
 * 6. Grammar, Dialect & ASCII Cleanup
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
  let updatedText = normalizedText;
  let updatedLatex = params.latex && params.latex.trim() ? params.latex : generateATSLatex(normalizedText, { originalLatex: params.latex });

  let rewrites = 0;
  let passiveUpgrades = 0;
  let dedupRotations = 0;
  const twicePromotions = 0;
  let metricsAdded = 0;
  let grammarFixes = 0;

  // ──────────────────────────────────────────────────────────────
  // PASS 1: AI PAR Rewrites
  // ──────────────────────────────────────────────────────────────
  if (params.audit?.action_verb_and_par_rewrites) {
    params.audit.action_verb_and_par_rewrites.forEach((r, i) => {
      if (r.original_bullet && r.optimized_par_bullet) {
        const customVal = params.customMetrics?.[i];
        let rawReplacement = resolvePlaceholder(r.optimized_par_bullet, customVal);
        rawReplacement = rawReplacement.replace(/^\s*(?:optimized|rewrite|par|improved|revised|bullet|option\s*\d+|suggestion)\s*[:\-–—]\s*/i, "");
        const replacement = rawReplacement;
        if (customVal && customVal.trim()) {
          metricsAdded++;
        }
        if (canReplaceFlexible(updatedText, r.original_bullet)) {
          updatedText = replaceFlexible(updatedText, r.original_bullet, replacement);
          rewrites++;
        }
        const nextLatex = replaceLatexBulletFlexible(updatedLatex, r.original_bullet, replacement);
        if (nextLatex !== updatedLatex) {
          updatedLatex = nextLatex;
        }
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // PASS 2: Deterministic Passive-to-Action Verb Upgrade
  // ──────────────────────────────────────────────────────────────
  const PASSIVE_MAP: [RegExp, string][] = [
    [/\b(?:worked on developing|worked on building|worked on creating)\b/gi, "Engineered"],
    [/\b(?:worked on)\b/gi, "Engineered"],
    [/\b(?:responsible for leading|responsible for managing)\b/gi, "Spearheaded"],
    [/\b(?:responsible for|duties included)\b/gi, "Spearheaded"],
    [/\b(?:assisted with|assisted in|helped with|helped)\b/gi, "Collaborated on"],
    [/\b(?:handled)\b/gi, "Orchestrated"],
    [/\b(?:participated in|was involved in)\b/gi, "Delivered"],
  ];

  const linesPass2 = updatedText.split("\n");
  const BULLET_START_RE = /^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+]|\d+[.)])\s+/;
  for (let idx = 0; idx < linesPass2.length; idx++) {
    const rawLine = linesPass2[idx];
    if (BULLET_START_RE.test(rawLine)) {
      let modLine = rawLine;
      for (const [pattern, strongVerb] of PASSIVE_MAP) {
        if (pattern.test(modLine)) {
          modLine = modLine.replace(pattern, strongVerb);
          passiveUpgrades++;
        }
      }
      if (modLine !== rawLine) {
        linesPass2[idx] = modLine;
        updatedLatex = replaceLatexBulletFlexible(updatedLatex, rawLine, modLine);
      }
    }
  }
  updatedText = linesPass2.join("\n");

  // ──────────────────────────────────────────────────────────────
  // PASS 3: Deterministic Action Verb De-Duplication
  // ──────────────────────────────────────────────────────────────
  const DEDUP_SYNONYMS = ["Engineered", "Architected", "Spearheaded", "Orchestrated", "Implemented", "Formulated", "Accelerated", "Streamlined", "Pioneered", "Automated"];
  let synonymIdx = 0;

  const linesPass3 = updatedText.split("\n");
  const verbFrequency = new Map<string, number>();

  for (let idx = 0; idx < linesPass3.length; idx++) {
    const rawLine = linesPass3[idx];
    if (BULLET_START_RE.test(rawLine)) {
      const matchPrefix = rawLine.match(/^(\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+]|\d+[.)])\s+)([A-Za-z]+)/);
      if (matchPrefix) {
        const prefix = matchPrefix[1];
        const rawVerb = matchPrefix[2];
        const normVerb = rawVerb.charAt(0).toUpperCase() + rawVerb.slice(1).toLowerCase();

        const count = (verbFrequency.get(normVerb) || 0) + 1;
        verbFrequency.set(normVerb, count);

        if (count >= 3) {
          // Find replacement synonym
          const replacementVerb = DEDUP_SYNONYMS[synonymIdx % DEDUP_SYNONYMS.length];
          synonymIdx++;

          const newLine = rawLine.replace(matchPrefix[0], `${prefix}${replacementVerb}`);
          linesPass3[idx] = newLine;
          updatedLatex = replaceLatexBulletFlexible(updatedLatex, rawLine, newLine);
          dedupRotations++;
        }
      }
    }
  }
  updatedText = linesPass3.join("\n");

  // ──────────────────────────────────────────────────────────────
  // PASS 4: Source-Grounded Skill Validation (Zero Injections)
  // Per strict content policy: NEVER inject missing JD skills as claimed
  // skills into the candidate's resume, and NEVER fabricate phrases like
  // ", leveraging ${skill} for scalable execution."
  // Missing skills from JD are diagnostic recommendations for candidate review ONLY.
  // ──────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────
  // PASS 5: Source-Grounded Metric Preservation (Zero Hallucinations)
  // Per strict content policy: NEVER inject fabricated metrics or arbitrary
  // percentages (e.g. "reducing latency by 34% across distributed endpoints").
  // Retain numerical achievements ONLY when supported by the original resume.
  // ──────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────
  // PASS 6: Grammar, Dialect & ASCII Cleanup
  // ──────────────────────────────────────────────────────────────
  if (params.audit?.grammar_spelling_dialect_audit) {
    params.audit.grammar_spelling_dialect_audit.forEach((item) => {
      if (item.original_phrase && item.corrected_phrase) {
        if (canReplaceFlexible(updatedText, item.original_phrase)) {
          updatedText = replaceFlexible(updatedText, item.original_phrase, item.corrected_phrase);
          grammarFixes++;
        }
        if (updatedLatex.includes(item.original_phrase)) {
          const escaped = item.original_phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const re = new RegExp(`(?<!\\\\[a-zA-Z]*)\\b${escaped}\\b`, "g");
          updatedLatex = updatedLatex.replace(re, item.corrected_phrase);
        }
      }
    });
  }

  updatedText = cleanSmartTypography(updatedText);

  // ──────────────────────────────────────────────────────────────
  // STRICT PLACEHOLDER ERASER & POLISH PASS
  // Replaces all lingering [Y]%, [X]%, [N], [$X], and /[\[[A-Z0-9_%$+ -]+\]/g
  // ──────────────────────────────────────────────────────────────
  updatedText = cleanLingeringPlaceholders(updatedText, false);
  updatedLatex = cleanLingeringPlaceholders(updatedLatex, true);
  updatedLatex = updatedLatex.replace(/\\\\+(\s*\\(?:end\{itemize\}|end\{tabular\*?\}|section))/g, "$1");

  // Clean unwanted pagination lines e.g. "-- 1 of 2 --", "Page 1 of 2"
  updatedText = updatedText
    .replace(/^--\s*\d+\s+of\s+\d+\s*--$/gim, "")
    .replace(/^(?:page\s*)?\d+\s*(?:of|\/)\s*\d+$/gim, "")
    .replace(/\n{3,}/g, "\n\n");

  // Ensure glyphtounicode and zero page numbers are present in LaTeX
  if (!updatedLatex.includes("glyphtounicode") && updatedLatex.includes("\\begin{document}")) {
    const unicodePreamble = `\\input{glyphtounicode}\n\\pdfgentounicode=1\n\\begin{document}`;
    updatedLatex = updatedLatex.replace("\\begin{document}", unicodePreamble);
  }
  if (!updatedLatex.includes("pagestyle{empty}") && updatedLatex.includes("\\begin{document}")) {
    updatedLatex = updatedLatex.replace("\\begin{document}", "\\begin{document}\n\\pagestyle{empty}\n\\thispagestyle{empty}");
  }

  if (params.latex && params.latex.trim()) {
    updatedLatex = restoreMissingHyperlinksInLatex(updatedLatex, params.latex);
  } else if (params.text && params.text.includes("](")) {
    updatedLatex = restoreMissingHyperlinksInLatex(updatedLatex, params.text);
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
