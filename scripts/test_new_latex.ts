import fs from "fs";
import { extractResumeText } from "../lib/ai/resume";
import { normalizeWrappedBullets } from "../lib/ats/scoring";
import {
  formatLatexWithHyperlinks,
  extractHyperlinksFromMarkdownText,
  normalizeUrl,
  ensureAllHrefsPreservedInLatex,
  markdownLinkToLatexHref,
  transformPlainTextPreservingHrefs,
} from "../lib/ats/hyperlinks";

const CANONICAL_HEADINGS: [string, RegExp][] = [
  ["PROFESSIONAL SUMMARY", /^(?:#{1,3}\s*)?(?:professional |career |executive )?(?:summary|profile|objective|overview|about me)\s*:?$/i],
  ["TECHNICAL SKILLS", /^(?:#{1,3}\s*)?(?:technical |core |key |professional )?(?:skills|technologies|competencies|skill set|proficiencies|tools|areas of expertise)\s*:?$/i],
  ["WORK EXPERIENCE", /^(?:#{1,3}\s*)?(?:work |professional |relevant |employment |career )?(?:experience|employment|work history|internships)\s*:?$/i],
  ["PROJECTS", /^(?:#{1,3}\s*)?(?:personal |selected |technical |academic |key |featured |notable )?projects(?:\s+experience)?\s*:?$/i],
  ["EDUCATION", /^(?:#{1,3}\s*)?(?:education|academic background|qualifications|academics|degrees)\s*:?$/i],
  ["CERTIFICATIONS", /^(?:#{1,3}\s*)?(?:certifications?|licenses|certificates|credentials)(?:\s*&.*)?\s*:?$/i],
  ["ACHIEVEMENTS", /^(?:#{1,3}\s*)?(?:achievements|key achievements|honors & awards|awards & honors|awards|honors|extracurricular activities|activities|leadership(?:\s*&.*)?|publications|patents)\s*:?$/i],
];

function generateTestLatex(optimizedText: string): string {
  const mdLinks = extractHyperlinksFromMarkdownText(optimizedText);
  const allKnownLinks = mdLinks;
  const normalized = normalizeWrappedBullets(optimizedText);
  const cleanLines = normalized.split("\n").filter((l) => {
    const trimmed = l.trim();
    if (!trimmed) return false;
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(trimmed)) return false;
    if (/^(?:page\s*)?\d+\s*(?:of|\/)\s*\d+$/i.test(trimmed)) return false;
    if (/^page\s*\d+$/i.test(trimmed)) return false;
    if (/^\s*[-–—*]?\s*\d+\s*[-–—*]?\s*$/.test(trimmed)) return false;
    if (/^(?:curriculum vitae|resume)$/i.test(trimmed)) return false;
    return true;
  });

  const bulletRe = /^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+]|\d+[.)])\s+(.*)$/i;
  const dateRangeRe = /\b((?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4})\s*[-–—]\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4}|Present|Current))\b/i;

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

    const normalizedHeading = line.replace(/^[#*\-_~\s]+|[#*\-_~\s:]+$/g, "").trim();
    const headingMatch = CANONICAL_HEADINGS.find(([, regex]) => regex.test(normalizedHeading));

    if (headingMatch) {
      isHeaderArea = false;
      closeItemize();
      currentSectionName = headingMatch[0];
      bodyLatex += `\n\\section{${headingMatch[0]}}\n`;
      continue;
    }

    if (isHeaderArea) {
      if (!candidateName) {
        candidateName = line.replace(/^[#*\-•>\s]+/, "").trim();
        continue;
      }
      const looksLikeContact = /[@|]|github|linkedin|\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/i.test(line) || (line.length < 80 && i <= 3);
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

    // Bullet Points or Sub-Project Headings
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
          bodyLatex += `\\vspace{1.5pt}\\textbf{${formatLatexWithHyperlinks(pTitle.trim(), allKnownLinks)}} \\enspace\\textbar\\enspace \\textit{${formatLatexWithHyperlinks(techOrLink, allKnownLinks)}}\\\\[1pt]\n`;
        } else {
          bodyLatex += `\\vspace{1.5pt}\\textbf{${formatLatexWithHyperlinks(bulletContent, allKnownLinks)}}\\\\[1pt]\n`;
        }
        continue;
      }

      if (!inItemize) {
        bodyLatex += "\\begin{itemize}\n";
        inItemize = true;
      }
      bodyLatex += `  \\resumeItem{${formatLatexWithHyperlinks(bulletContent, allKnownLinks)}}\n`;
      continue;
    }

    // Non-Bullet Lines
    closeItemize();

    if (currentSectionName === "PROFESSIONAL SUMMARY") {
      bodyLatex += `{\\small ${formatLatexWithHyperlinks(line, allKnownLinks)}\\par}\\vspace{2pt}\n`;
      continue;
    }

    const categoryMatch = line.match(/^([A-Za-z0-9/& -]{2,25}):\s+(.+)$/);
    if (categoryMatch && !line.includes("|") && !dateRangeRe.test(line)) {
      bodyLatex += `{\\small \\textbf{${formatLatexWithHyperlinks(categoryMatch[1], allKnownLinks)}:} ${formatLatexWithHyperlinks(categoryMatch[2], allKnownLinks)}}\\\\[1pt]\n`;
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
      if (line.includes("|") && dateMatch) {
        const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
        const dateIdx = parts.findIndex((p) => dateRangeRe.test(p));
        const dateStr = dateMatch[0].replace(/\s*[-–—]\s*/, " -- ");
        const nonDateParts = parts.filter((_, idx) => idx !== dateIdx);
        const primary = nonDateParts[0] || "";
        const secondary = nonDateParts[1] || "";
        const loc = nonDateParts[2] || "";
        bodyLatex += `\\resumeSubheading\n  {${formatLatexWithHyperlinks(primary, allKnownLinks)}}{${formatLatexWithHyperlinks(loc, allKnownLinks)}}\n  {${formatLatexWithHyperlinks(secondary, allKnownLinks)}}{${formatLatexWithHyperlinks(dateStr, allKnownLinks)}}\n`;
        continue;
      }

      if (dateMatch) {
        const dateStr = dateMatch[0].replace(/\s*[-–—]\s*/, " -- ");
        const lineRemaining = line.replace(dateMatch[0], "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();

        if (nextLine && !isNextBulletOrHeading(nextLine) && !nextDateMatch && nextLine.length < 90) {
          let org = nextLine;
          let loc = "";
          if (nextLine.includes("|")) {
            const orgParts = nextLine.split("|").map((p) => p.trim()).filter(Boolean);
            org = orgParts[0] || nextLine;
            loc = orgParts.slice(1).join(", ");
          } else if (nextLine.includes(",")) {
            const orgParts = nextLine.split(",").map((p) => p.trim()).filter(Boolean);
            if (orgParts.length >= 2) {
              org = orgParts[0];
              loc = orgParts.slice(1).join(", ");
            }
          }
          const isRoleFirst = /engineer|developer|architect|lead|manager|analyst|intern|scientist|consultant|associate|founder|director|bachelor|master|phd|degree|b\.?tech|m\.?tech|b\.?s|m\.?s/i.test(lineRemaining);
          if (isRoleFirst) {
            bodyLatex += `\\resumeSubheading\n  {${formatLatexWithHyperlinks(org, allKnownLinks)}}{${formatLatexWithHyperlinks(loc, allKnownLinks)}}\n  {${formatLatexWithHyperlinks(lineRemaining, allKnownLinks)}}{${formatLatexWithHyperlinks(dateStr, allKnownLinks)}}\n`;
          } else {
            bodyLatex += `\\resumeSubheading\n  {${formatLatexWithHyperlinks(lineRemaining, allKnownLinks)}}{${formatLatexWithHyperlinks(loc, allKnownLinks)}}\n  {${formatLatexWithHyperlinks(org, allKnownLinks)}}{${formatLatexWithHyperlinks(dateStr, allKnownLinks)}}\n`;
          }
          i++;
          continue;
        }

        if (lineRemaining) {
          const parts = lineRemaining.split(/[|–—]+/).map((p) => p.trim()).filter(Boolean);
          const left = parts.length > 1 ? parts.map((p) => formatLatexWithHyperlinks(p, allKnownLinks)).join(" \\enspace\\textbar\\enspace ") : formatLatexWithHyperlinks(lineRemaining, allKnownLinks);
          bodyLatex += `\\textbf{${left}} \\hfill \\textit{${formatLatexWithHyperlinks(dateStr, allKnownLinks)}}\\\\[1pt]\n`;
        } else {
          bodyLatex += `\\hfill \\textit{${formatLatexWithHyperlinks(dateStr, allKnownLinks)}}\\\\[1pt]\n`;
        }
        continue;
      }

      if (!dateMatch && nextDateMatch && !line.endsWith(".") && line.length < 80 && /^[A-Z]/.test(line)) {
        const nextDateStr = nextDateMatch[0].replace(/\s*[-–—]\s*/, " -- ");
        const nextRemaining = nextLine.replace(nextDateMatch[0], "").replace(/^[|–—\s]+|[|–—\s]+$/g, "").trim();

        let org = line;
        let loc = "";
        if (line.includes("|")) {
          const orgParts = line.split("|").map((p) => p.trim()).filter(Boolean);
          org = orgParts[0] || line;
          loc = orgParts.slice(1).join(", ");
        }

        const isLineRole = /engineer|developer|architect|lead|manager|analyst|intern|scientist|consultant|associate|founder|director|bachelor|master|phd|degree|b\.?tech|m\.?tech|b\.?s|m\.?s/i.test(line);
        if (isLineRole) {
          bodyLatex += `\\resumeSubheading\n  {${formatLatexWithHyperlinks(nextRemaining || "Company", allKnownLinks)}}{${formatLatexWithHyperlinks(loc, allKnownLinks)}}\n  {${formatLatexWithHyperlinks(org, allKnownLinks)}}{${formatLatexWithHyperlinks(nextDateStr, allKnownLinks)}}\n`;
        } else {
          bodyLatex += `\\resumeSubheading\n  {${formatLatexWithHyperlinks(org, allKnownLinks)}}{${formatLatexWithHyperlinks(loc, allKnownLinks)}}\n  {${formatLatexWithHyperlinks(nextRemaining || org, allKnownLinks)}}{${formatLatexWithHyperlinks(nextDateStr, allKnownLinks)}}\n`;
        }
        i++;
        continue;
      }
    }

    // Projects: Detect Project Title + Tech stack lines
    if (currentSectionName === "PROJECTS") {
      const projectHrefs: string[] = [];
      let cleanProjLine = line;

      cleanProjLine = cleanProjLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        projectHrefs.push(markdownLinkToLatexHref(label, url));
        return "";
      });

      const cleanTitle = cleanProjLine
        .replace(/\b(code|live demo|demo|live)\b/gi, "")
        .replace(/^[|–—\s]+|[|–—\s]+$/g, "")
        .trim();

      const rightCol = projectHrefs.length > 0 ? projectHrefs.join(" \\enspace\\textbar\\enspace ") : "\\textit{Project}";

      if (nextLine && !nextLine.match(bulletRe) && !CANONICAL_HEADINGS.some(([, regex]) => regex.test(nextLine))) {
        bodyLatex += `\\resumeProjectHeading\n  {\\textbf{${formatLatexWithHyperlinks(cleanTitle, allKnownLinks)}} \\enspace\\textbar\\enspace \\emph{${formatLatexWithHyperlinks(nextLine, allKnownLinks)}}}{${rightCol}}\n`;
        i++;
        continue;
      }
    }

    if (line.includes("|")) {
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        bodyLatex += `\\textit{${formatLatexWithHyperlinks(parts[0], allKnownLinks)}} \\hfill \\textit{${parts.slice(1).map((p) => formatLatexWithHyperlinks(p, allKnownLinks)).join(" \\enspace\\textbar\\enspace ")}}\\\\[1pt]\n`;
      } else {
        bodyLatex += `${formatLatexWithHyperlinks(line, allKnownLinks)}\\\\[1pt]\n`;
      }
      continue;
    }

    bodyLatex += `${formatLatexWithHyperlinks(line, allKnownLinks)}\\\\[1pt]\n`;
  }

  closeItemize();

  const cleanContacts = contactTokens
    .map((t) => t.replace(/[ƒ§ï\u2217*]/g, "").trim())
    .filter(Boolean);
  const formattedContacts = cleanContacts
    .map((token) => formatLatexWithHyperlinks(token, allKnownLinks))
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

  const resultLatex = `%-------------------------
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
  {\\LARGE \\scshape \\textbf{${candidateName || "Candidate Name"}}} \\\\[2pt]
  \\small ${formattedContacts}
\\end{center}
\\vspace{-3pt}

%----------BODY SECTIONS----------
${bodyLatex}

\\end{document}
`;

  return ensureAllHrefsPreservedInLatex(resultLatex, [optimizedText]);
}

async function main() {
  const buf = fs.readFileSync("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf");
  const extracted = await extractResumeText(buf, "application/pdf");
  const latex = generateTestLatex(extracted);
  console.log("=== GENERATED TEST LATEX ===");
  console.log(latex);
}
main().catch(console.error);
