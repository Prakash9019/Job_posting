import fs from "fs";
import { PDFParse } from "pdf-parse";
import { prisma } from "../lib/db/prisma";
import { compileLatexToPdfBuffer, autoTailorResumeToJD, parseResumeToCanonical, estimateRenderedLines, formatLatexLine, formatDateRangeForLatex, cleanAiText } from "../lib/ats/tailor";

async function testTier3() {
  const activeResume = await prisma.resume.findFirst({ where: { isActive: true } });
  if (!activeResume || !activeResume.extractedText) throw new Error("No active resume");

  const jd1 = `
Platform Infrastructure Engineer
Company: Platform Infrastructure
Location: Remote

We are seeking a Platform Infrastructure Engineer to scale our systems.
Key Requirements:
- Python
- Docker
- Kubernetes
- REST
- Distributed Systems
- Artificial Intelligence
- LLM
- Git
`;

  const tailored = await autoTailorResumeToJD({
    resumeText: activeResume.extractedText,
    jobText: jd1,
    companyName: "Platform Infrastructure",
    targetRoleTitle: "Platform Infrastructure Engineer",
  });

  const canonical = tailored.canonical;
  const lines = estimateRenderedLines(canonical);
  console.log("Estimated lines:", lines);

  // Apply Tier 3
  const targetDocClass = "\\documentclass[10pt,a4paper]{article}";
  const targetGeometry = "\\usepackage[left=0.38in, right=0.38in, top=0.28in, bottom=0.28in]{geometry}";
  const targetSectionSpacing = "\\titlespacing*{\\section}{0pt}{3.0pt}{1.5pt}";
  const targetLinespread = "0.98";
  const listParams = "[leftmargin=1.2em, itemsep=0.5pt, parsep=0pt, topsep=0.8pt, partopsep=0pt, label=\\textbullet]";
  const subHeadingVspace = "2.5pt";

  const preamble = `%-------------------------
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

% Section spacing
\\titleformat{\\section}{\\normalsize\\bfseries\\uppercase}{}{0em}{}[\\titlerule]
${targetSectionSpacing}

% Global list spacing
\\setlist[itemize]{leftmargin=1.2em, itemsep=0.5pt, parsep=0pt, topsep=0.8pt, partopsep=0pt, label=\\textbullet}

\\newcommand{\\resumeItem}[1]{
  \\item #1
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{${subHeadingVspace}}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{#1} & \\textit{\\small #2} \\\\[-1pt]
    {\\small #3} & \\textit{\\small #4}
  \\end{tabular*}\\nopagebreak[4]
}

\\newcommand{\\resumeProjectHeading}[2]{
  \\vspace{${subHeadingVspace}}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    #1 & \\textit{\\small #2}
  \\end{tabular*}\\nopagebreak[4]
}

\\newcommand{\\resumeDivider}{\\enspace\\textbar\\enspace}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=1.2em, itemsep=0.5pt, parsep=0pt, topsep=0.8pt, partopsep=0pt, label=\\textbullet]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=1.2em, itemsep=0.5pt, parsep=0pt, topsep=0.8pt, partopsep=0pt, label=\\textbullet]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}}

\\begin{document}
\\pagestyle{empty}
\\thispagestyle{empty}

%----------HEADING----------
\\begin{center}
  {\\LARGE \\textbf{${cleanAiText(canonical.name || "Candidate")}}} \\\\[2pt]
  \\small ${canonical.phone || ""} \\enspace\\textbar\\enspace \\href{mailto:${canonical.email || ""}}{\\underline{${canonical.email || ""}}} \\enspace\\textbar\\enspace \\href{${canonical.linkedinUrl || ""}}{\\underline{LinkedIn}} \\enspace\\textbar\\enspace \\href{${canonical.githubUrl || ""}}{\\underline{GitHub}}
\\end{center}
\\vspace{-8pt}
`;

  // Body with role on #1, company on #3
  let bodyLatex = "";
  if (canonical.summary) {
    bodyLatex += `\\section{PROFESSIONAL SUMMARY}\n{\\small ${cleanAiText(canonical.summary)}\\par}\n`;
  }
  if (canonical.technicalSkills) {
    bodyLatex += `\\section{TECHNICAL SKILLS}\n`;
    for (const [cat, skills] of Object.entries(canonical.technicalSkills as Record<string, string[]>)) {
      bodyLatex += `\\noindent {\\small \\textbf{${cleanAiText(cat)}:} ${Array.isArray(skills) ? skills.map(cleanAiText).join(", ") : cleanAiText(String(skills))}}\\\\[0.5pt]\n`;
    }
  }
  if (canonical.experience) {
    bodyLatex += `\\section{WORK EXPERIENCE}\n`;
    for (const exp of canonical.experience) {
      bodyLatex += `\\resumeSubheading\n  {${cleanAiText(exp.role || "")}}{${cleanAiText(exp.location || "")}}\n  {${cleanAiText(exp.company || "")}}{${formatDateRangeForLatex(exp.dateRange)}}\n`;
      for (const sub of exp.subheadings || []) {
        const subTech = sub.techStack ? ` \\enspace\\textbar\\enspace \\textit{${cleanAiText(sub.techStack)}}` : "";
        bodyLatex += `\\vspace{1.5pt}\n\\noindent \\textbf{${cleanAiText(sub.title || "")}}${subTech}\n\\vspace{0.5pt}\n\\begin{itemize}${listParams}\n`;
        for (const b of sub.bullets || []) {
          bodyLatex += `  \\item ${cleanAiText(b)}\n`;
        }
        bodyLatex += `\\end{itemize}\n`;
      }
    }
  }
  if (canonical.education) {
    bodyLatex += `\\section{EDUCATION}\n`;
    for (const edu of canonical.education) {
      bodyLatex += `\\resumeSubheading\n  {${cleanAiText(edu.institution || "")}}{${cleanAiText(edu.location || "")}}\n  {${cleanAiText(edu.degree || "")}}{${formatDateRangeForLatex(edu.dateRange)}}\n`;
    }
  }

  const fullLatex = `${preamble}\n${bodyLatex}\n\\end{document}`;
  const buf = await compileLatexToPdfBuffer(fullLatex);
  if (buf) {
    const p = new PDFParse({ data: buf });
    await p.load();
    console.log("Tier 3 Compiled PDF pages:", p.doc.numPages);
    const page = await p.doc.getPage(1);
    const content = await page.getTextContent();
    let minY = Infinity, maxY = -Infinity;
    for (const it of content.items) {
      if ("transform" in it) {
        const y = it.transform[5];
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    const pageHeight = 841.89;
    const bottomWhitespace = minY;
    const verticalFillPercent = ((pageHeight - bottomWhitespace) / pageHeight) * 100;
    console.log(`Page 1: minY=${minY.toFixed(1)} pt (bottom whitespace), maxY=${maxY.toFixed(1)} pt, height=${(maxY - minY).toFixed(1)} pt`);
    console.log(`Vertical fill: ${verticalFillPercent.toFixed(1)}% of A4 page`);
  }
}

testTier3().catch(console.error).finally(() => prisma.$disconnect());
