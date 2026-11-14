import { prisma } from "../lib/db/prisma";
import { generateATSLatex } from "../lib/ats/tailor";
import { optimizeLatexGeometryForOnePage } from "../lib/ats/apply-latex";

async function main() {
  const activeResume = await prisma.resume.findFirst({ where: { isActive: true } });
  console.log("Active resume:", activeResume?.fileName);
  const text = activeResume?.extractedText || "";
  console.log("Text length:", text.length);

  const atsLatex = generateATSLatex(text);
  console.log("atsLatex params:", {
    docClass: atsLatex.match(/\\documentclass[^\n]*/)?.[0],
    geom: atsLatex.match(/\\usepackage\[[^\]]*\]\{geometry\}/)?.[0],
    setlist: atsLatex.match(/\\setlist\[itemize\][^\n]*/)?.[0],
    spacing: atsLatex.match(/\\titlespacing\*?\{section\}[^\n]*/)?.[0],
    linespread: atsLatex.match(/\\linespread\{[^}]*\}/)?.[0],
  });

  const optLatex = optimizeLatexGeometryForOnePage(atsLatex);
  console.log("optLatex params:", {
    docClass: optLatex.match(/\\documentclass[^\n]*/)?.[0],
    geom: optLatex.match(/\\usepackage\[[^\]]*\]\{geometry\}/)?.[0],
    setlist: optLatex.match(/\\setlist\[itemize\][^\n]*/)?.[0],
    spacing: optLatex.match(/\\titlespacing\*?\{section\}[^\n]*/)?.[0],
    linespread: optLatex.match(/\\linespread\{[^}]*\}/)?.[0],
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
