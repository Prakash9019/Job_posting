import fs from "fs";
import { compileLatexToPdfBuffer } from "../lib/ats/tailor";
import { PDFParse } from "pdf-parse";
import type { PdfParseLike } from "./pdf-types";

// Test 2-page comfortable layout
async function main() {
  const { execSync } = await import("child_process");
  const latex = execSync("node --import tsx scripts/test_new_latex.ts", { encoding: "utf-8" });
  let code = latex.slice(latex.indexOf("%-------------------------"));

  // Adjust geometry and spacing for 2-page flow
  code = code.replace(
    /\\usepackage\[a4paper,[^\]]+\]\{geometry\}/,
    "\\usepackage[a4paper,left=0.6in,right=0.6in,top=0.6in,bottom=0.6in]{geometry}"
  );
  code = code.replace(
    /\\titlespacing\*\{\\section\}\{[^\}]*\}\{[^\}]*\}\{[^\}]*\}/,
    "\\titlespacing*{\\section}{0pt}{8pt}{4pt}"
  );
  code = code.replace(
    /\\setlist\[itemize\]\{[^\}]*\}/,
    "\\setlist[itemize]{leftmargin=0.18in, label=\\raisebox{0.15ex}{\\tiny$\\bullet$}, itemsep=2.5pt, parsep=0pt, topsep=2.5pt, partopsep=0pt}"
  );

  console.log("Compiling comfortable 2-page layout to PDF...");
  const pdfBuffer = await compileLatexToPdfBuffer(code);
  if (!pdfBuffer) throw new Error("Compilation failed!");

  fs.writeFileSync("E:/Job_posting/test_2page_resume.pdf", pdfBuffer);

  const p = new PDFParse({ data: pdfBuffer }) as unknown as PdfParseLike;
  await p.load();
  console.log("Pages in 2-page compiled PDF:", p.doc.numPages);
  for (let i = 1; i <= p.doc.numPages; i++) {
    const page = await p.doc.getPage(i);
    const textContent = await page.getTextContent();
    const str = textContent.items.map((it) => it.str).join(" ");
    console.log(`Page ${i} text length: ${str.length}`);
    console.log(`Page ${i} ends with: ${str.slice(-120)}`);
  }
  await p.destroy().catch(() => {});
}
main().catch(console.error);
