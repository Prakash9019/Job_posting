import fs from "fs";
import { prisma } from "../lib/db/prisma";
import { autoTailorResumeToJD } from "../lib/ats/tailor";
import { patchLatexTemplateDeterministically, optimizeLatexGeometryForOnePage, validateAndCompileLatex } from "../lib/ats/apply-latex";

const jakesTemplate = `\\documentclass[letterpaper,11pt]{article}
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

async function main() {
  const activeResume = await prisma.resume.findFirst({ where: { isActive: true } });
  const jdPlatformInfra = "Platform Infrastructure Engineer\nLocation: Remote\nKey Requirements: Python, Docker, Kubernetes, REST, Distributed Systems, AI, LLM, Git";
  const atsTailored = await autoTailorResumeToJD({
    resumeText: activeResume!.extractedText!,
    jobText: jdPlatformInfra,
    companyName: "Platform Infrastructure",
    targetRoleTitle: "Platform Infrastructure Engineer",
  });

  const patched = patchLatexTemplateDeterministically(jakesTemplate, atsTailored.canonical);
  const singlePatched = optimizeLatexGeometryForOnePage(patched);
  fs.writeFileSync("test_singlePatched.tex", singlePatched);
  const compile = await validateAndCompileLatex(singlePatched);
  console.log("Compile success:", compile.success);
  console.log("Compile error:", compile.error);
  fs.writeFileSync("test_compile.log", compile.log || "");
  console.log("Log length:", (compile.log || "").length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
