import fs from "fs";
import { PDFParse } from "pdf-parse";
import { prisma } from "../lib/db/prisma";
import { compileLatexToPdfBuffer, autoTailorResumeToJD } from "../lib/ats/tailor";
import { patchLatexTemplateDeterministically } from "../lib/ats/apply-latex";

const jakesLatex = `\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\input{glyphtounicode}
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}
\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
\\pdfgentounicode=1
\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-2pt}}}}
\\newcommand{\\resumeSubheading}[4]{\\vspace{-2pt}\\item\\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}\\textbf{#1} & #2 \\\\\\textit{\\small#3} & \\textit{\\small #4} \\\\\\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeProjectHeading}[2]{\\item\\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}\\small#1 & #2 \\\\\\end{tabular*}\\vspace{-7pt}}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}
\\begin{document}
\\pagestyle{empty}
\\thispagestyle{empty}
\\begin{center}\\textbf{\\Huge \\scshape Loka Surya Prakash Pentakota} \\\\ \\vspace{1pt}\\small +91-6301750186 $|$ \\href{mailto:plsprakash2003@gmail.com}{\\underline{plsprakash2003@gmail.com}} $|$ \\href{https://linkedin.com/in/surya}{\\underline{LinkedIn}} $|$ \\href{https://github.com/surya}{\\underline{GitHub}}\\end{center}
\\section{WORK EXPERIENCE}
\\resumeSubHeadingListStart
\\resumeSubheading{Platform Engineer}{India}{JulleyOnline Private Limited}{April 2026 -- Sept 2026}
\\resumeItemListStart
\\resumeItem{Architected a centralized integration hub using adapter and registry patterns.}
\\resumeItemListEnd
\\resumeSubHeadingListEnd
\\end{document}`;

function cleanAndOptimizeGeometry(doc: string): string {
  let cleaned = doc;
  // 1. Remove fullpage and addtolength margin hacks
  cleaned = cleaned.replace(/\\usepackage(?:\[[^\]]*\])?\{fullpage\}/g, "");
  cleaned = cleaned.replace(/\\addtolength\{\\(?:oddsidemargin|evensidemargin|textwidth|topmargin|textheight)\}\{[^}]*\}/g, "");
  cleaned = cleaned.replace(/\\addtolength\{\\topmargin\}\{-?\.?\d+in\}/g, "");

  // 2. Normalize letterpaper to a4paper
  cleaned = cleaned.replace(/letterpaper/g, "a4paper");

  // 3. Remove raw asterisks and bullet jumble
  cleaned = cleaned.replace(/\\item\s*[*∗]\s*/g, "\\item ");
  cleaned = cleaned.replace(/label=\{\s*[*∗]\s*\}/g, "label=\\textbullet");
  cleaned = cleaned.replace(/\\newcommand\{\\resumeSubHeadingListStart\}\{\\begin\{itemize\}\[[^\]]*\]\}/g, "\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=1.2em, itemsep=0.5pt, parsep=0pt, topsep=1pt, partopsep=0pt, label=\\textbullet]}");
  cleaned = cleaned.replace(/\\newcommand\{\\resumeItemListStart\}\{\\begin\{itemize\}\}/g, "\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=1.2em, itemsep=0.5pt, parsep=0pt, topsep=1pt, partopsep=0pt, label=\\textbullet]}");

  // 4. Clean artificial vspace before sections
  cleaned = cleaned.replace(/\\vspace\{\d+pt\}\s*\\section/g, "\\section");

  // 5. Inject calibrated A4 geometry
  const targetClass = "\\documentclass[10pt,a4paper]{article}";
  const targetGeometry = "\\usepackage[left=0.38in, right=0.38in, top=0.30in, bottom=0.30in]{geometry}";
  const targetSpacing = "\\titlespacing*{\\section}{0pt}{3pt}{1.5pt}";
  const targetSetlist = "\\setlist[itemize]{leftmargin=1.2em, itemsep=0.5pt, parsep=0pt, topsep=1pt, partopsep=0pt, label=\\textbullet}";

  cleaned = cleaned.replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]*\}/, targetClass);
  if (cleaned.includes("{geometry}")) {
    cleaned = cleaned.replace(/\\usepackage(?:\[[^\]]*\])?\{geometry\}/, targetGeometry);
  } else {
    cleaned = cleaned.replace("\\begin{document}", `${targetGeometry}\n\\begin{document}`);
  }

  if (cleaned.includes("\\titlespacing")) {
    cleaned = cleaned.replace(/\\titlespacing\*?\{\\section\}[^\n]*/, targetSpacing);
  } else if (cleaned.includes("\\titleformat")) {
    cleaned = cleaned.replace(/(\\titleformat[^\n]*\n)/, `$1${targetSpacing}\n`);
  }

  if (cleaned.includes("\\setlist[itemize]")) {
    cleaned = cleaned.replace(/\\setlist\[itemize\][^\n]*/, targetSetlist);
  } else {
    cleaned = cleaned.replace("\\begin{document}", `${targetSetlist}\n\\begin{document}`);
  }

  // Ensure linespread is 0.98
  if (cleaned.includes("\\linespread")) {
    cleaned = cleaned.replace(/\\linespread\{[^}]*\}/g, "\\linespread{0.98}");
  } else {
    cleaned = cleaned.replace("\\begin{document}", "\\linespread{0.98}\n\\begin{document}");
  }

  return cleaned;
}

async function main() {
  const activeResume = await prisma.resume.findFirst({ where: { isActive: true } });
  if (!activeResume || !activeResume.extractedText) throw new Error("No active resume");

  const jd1 = `Platform Infrastructure Engineer\nLocation: Remote\nKey Requirements: Python, Docker, Kubernetes, REST, Distributed Systems, AI, LLM, Git`;
  const tailored = await autoTailorResumeToJD({
    resumeText: activeResume.extractedText,
    jobText: jd1,
    companyName: "Platform Infrastructure",
    targetRoleTitle: "Platform Infrastructure Engineer",
  });

  const patched = patchLatexTemplateDeterministically(jakesLatex, tailored.canonical);
  const cleanedJake = cleanAndOptimizeGeometry(patched);
  
  console.log("Compiling patched cleaned Jake's template with TeXLive...");
  const buf = await compileLatexToPdfBuffer(cleanedJake);
  if (buf) {
    const p = new PDFParse({ data: buf });
    await p.load();
    console.log("Cleaned Jake's PDF pages:", p.doc.numPages);
    const page1 = await p.doc.getPage(1);
    const content = await page1.getTextContent();
    let minY = Infinity, maxY = -Infinity;
    for (const it of content.items) {
      if ("transform" in it) {
        const y = it.transform[5];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    console.log(`Page 1: minY=${minY.toFixed(1)} pt, maxY=${maxY.toFixed(1)} pt, height=${(maxY - minY).toFixed(1)} pt`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
