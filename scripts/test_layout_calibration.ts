import fs from "fs";
import { PDFParse } from "pdf-parse";
import { prisma } from "../lib/db/prisma";
import { compileLatexToPdfBuffer, autoTailorResumeToJD, parseResumeToCanonical, generateLatexFromCanonical, estimateRenderedLines } from "../lib/ats/tailor";

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

async function main() {
  const activeResume = await prisma.resume.findFirst({ where: { isActive: true } });
  if (!activeResume || !activeResume.extractedText) throw new Error("No active resume");

  const canonical = parseResumeToCanonical(activeResume.extractedText);
  const estimatedLines = estimateRenderedLines(canonical);
  console.log("Estimated lines:", estimatedLines);

  // Let's test a balanced layout configuration
  // For Surya Prakash (~67 lines), let's see how 9.5pt or 10pt with tuned spacing looks
  const configs = [
    {
      name: "Config A: 9.5pt, comfortable spacing, top/bottom=0.35in",
      docClass: "\\documentclass[9.5pt,a4paper]{extarticle}",
      geom: "\\usepackage[left=0.40in, right=0.40in, top=0.35in, bottom=0.35in]{geometry}",
      sectionSpacing: "\\titlespacing*{\\section}{0pt}{4pt}{2pt}",
      linespread: "1.02",
      itemsep: "0.8pt",
      topsep: "1.5pt",
      subheadingVspace: "3pt",
      subprojectVspace: "2.5pt",
    },
    {
      name: "Config B: 9.5pt, balanced vertical fill, top/bottom=0.38in",
      docClass: "\\documentclass[9.5pt,a4paper]{extarticle}",
      geom: "\\usepackage[left=0.40in, right=0.40in, top=0.38in, bottom=0.38in]{geometry}",
      sectionSpacing: "\\titlespacing*{\\section}{0pt}{4.5pt}{2pt}",
      linespread: "1.04",
      itemsep: "1.0pt",
      topsep: "1.5pt",
      subheadingVspace: "3.5pt",
      subprojectVspace: "2.5pt",
    },
    {
      name: "Config C: 10pt, compact spacing, top/bottom=0.30in",
      docClass: "\\documentclass[10pt,a4paper]{article}",
      geom: "\\usepackage[left=0.38in, right=0.38in, top=0.30in, bottom=0.30in]{geometry}",
      sectionSpacing: "\\titlespacing*{\\section}{0pt}{3pt}{1.5pt}",
      linespread: "0.98",
      itemsep: "0.5pt",
      topsep: "1pt",
      subheadingVspace: "2.5pt",
      subprojectVspace: "2pt",
    },
  ];

  for (const cfg of configs) {
    console.log(`\nTesting ${cfg.name}...`);
    // Create LaTeX using cfg
    const preamble = `%-------------------------
% Adaptive ATS LaTeX Resume
%------------------------

${cfg.docClass}
${cfg.geom}
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
\\linespread{${cfg.linespread}}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\urlstyle{same}

% Section spacing
\\titleformat{\\section}{\\normalsize\\bfseries\\uppercase}{}{0em}{}[\\titlerule]
${cfg.sectionSpacing}

% Global list spacing
\\setlist[itemize]{leftmargin=1.2em, itemsep=${cfg.itemsep}, parsep=0pt, topsep=${cfg.topsep}, partopsep=0pt, label=\\textbullet}

\\newcommand{\\resumeItem}[1]{
  \\item #1
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{${cfg.subheadingVspace}}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{#1} & \\textit{\\small #2} \\\\[-1pt]
    {\\small #3} & \\textit{\\small #4}
  \\end{tabular*}\\nopagebreak[4]
}

\\newcommand{\\resumeProjectHeading}[2]{
  \\vspace{${cfg.subheadingVspace}}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    #1 & \\textit{\\small #2}
  \\end{tabular*}\\nopagebreak[4]
}

\\newcommand{\\resumeDivider}{\\enspace\\textbar\\enspace}
\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=1.2em, itemsep=${cfg.itemsep}, parsep=0pt, topsep=${cfg.topsep}, partopsep=0pt, label=\\textbullet]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=1.2em, itemsep=${cfg.itemsep}, parsep=0pt, topsep=${cfg.topsep}, partopsep=0pt, label=\\textbullet]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}}

\\begin{document}
\\pagestyle{empty}
\\thispagestyle{empty}
`;

    // Extract body from tailored latex or generate from canonical
    const tailored = await autoTailorResumeToJD({
      resumeText: activeResume.extractedText,
      jobText: jd1,
      companyName: "Platform Infrastructure",
      targetRoleTitle: "Platform Infrastructure Engineer",
    });

    const bodyMatch = tailored.optimizedLatex.match(/\\begin\{document\}[\s\S]*?\\pagestyle\{empty\}[\s\S]*?\\thispagestyle\{empty\}([\s\S]*?)\\end\{document\}/);
    const bodyContent = bodyMatch ? bodyMatch[1] : "";
    const fullLatex = `${preamble}\n${bodyContent}\n\\end{document}`;

    const buf = await compileLatexToPdfBuffer(fullLatex);
    if (buf) {
      const p = new PDFParse({ data: buf });
      await p.load();
      console.log(`  -> Pages: ${p.doc.numPages}`);
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
      const pageHeight = 841.89;
      const bottomWhitespace = minY;
      const verticalFillPercent = ((pageHeight - bottomWhitespace) / pageHeight) * 100;
      console.log(`  -> Page 1: minY=${minY.toFixed(1)} pt (bottom whitespace), maxY=${maxY.toFixed(1)} pt, content height=${(maxY - minY).toFixed(1)} pt`);
      console.log(`  -> Vertical fill: ${verticalFillPercent.toFixed(1)}% of A4 page`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
