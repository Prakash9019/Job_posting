import { prisma } from "../lib/db/prisma";
import { autoTailorResumeToJD } from "../lib/ats/tailor";
import { validateAndCompileLatex } from "../lib/ats/apply-latex";
import { PDFParse } from "pdf-parse";
import fs from "fs";

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

  // Let's modify the preamble of tailored.optimizedLatex to test 10pt with calibrated balanced spacing
  let balancedLatex = tailored.optimizedLatex;

  // Replace documentclass with 10pt article
  balancedLatex = balancedLatex.replace(/\\documentclass\[[^\]]*\]\{extarticle\}/, "\\documentclass[10pt,a4paper]{article}");

  // Replace geometry with top=0.30in, bottom=0.30in, left=0.38in, right=0.38in
  balancedLatex = balancedLatex.replace(
    /\\usepackage\[[^\]]*\]\{geometry\}/,
    "\\usepackage[left=0.38in, right=0.38in, top=0.30in, bottom=0.30in]{geometry}"
  );

  // Replace titlespacing with {0pt}{3.5pt}{1.8pt}
  balancedLatex = balancedLatex.replace(
    /\\titlespacing\*?\{\\section\}\{[^}]*\}\{[^}]*\}\{[^}]*\}/,
    "\\titlespacing*{\\section}{0pt}{3.5pt}{1.8pt}"
  );

  // Replace linespread with 0.99
  balancedLatex = balancedLatex.replace(/\\linespread\{[^}]*\}/, "\\linespread{0.99}");

  // Replace setlist itemsep with 0.6pt, topsep 1.0pt
  balancedLatex = balancedLatex.replace(
    /\\setlist\[itemize\]\{[^}]*\}/,
    "\\setlist[itemize]{leftmargin=1.2em, itemsep=0.6pt, parsep=0pt, topsep=1.0pt, partopsep=0pt, label=\\textbullet}"
  );
  balancedLatex = balancedLatex.replace(
    /\\begin\{itemize\}\[[^\]]*\]/g,
    "\\begin{itemize}[leftmargin=1.2em, itemsep=0.6pt, parsep=0pt, topsep=1.0pt, partopsep=0pt, label=\\textbullet]"
  );

  // Replace subheading vspace with 2.5pt
  balancedLatex = balancedLatex.replace(/\\vspace\{(?:0\.5|1|1\.5|2|3|4)pt\}\s*\\nopagebreak\[3\]/g, "\\vspace{2.5pt}\\nopagebreak[3]");

  const res = await validateAndCompileLatex(balancedLatex);
  console.log("Success:", res.success);
  if (res.pdfBuffer) {
    const p = new PDFParse({ data: res.pdfBuffer });
    await p.load();
    console.log("Pages:", p.doc.numPages);
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
    const bottomWhitespace = minY;
    const pageHeight = 841.89;
    const verticalFillPercent = ((pageHeight - bottomWhitespace) / pageHeight) * 100;
    console.log(`minY=${minY.toFixed(1)} pt (bottom whitespace), maxY=${maxY.toFixed(1)} pt, height=${(maxY - minY).toFixed(1)} pt`);
    console.log(`Vertical fill: ${verticalFillPercent.toFixed(1)}% of A4 page`);
    fs.writeFileSync("test_balanced_tailored.pdf", res.pdfBuffer);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
