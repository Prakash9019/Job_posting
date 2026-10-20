import fs from "fs";
import { compileLatexToPdfBuffer } from "../lib/ats/tailor";
import { validatePdfHyperlinks } from "../lib/ats/hyperlinks";
import { PDFParse } from "pdf-parse";

// Import the function from test_new_latex or run directly
async function main() {
  const { execSync } = await import("child_process");
  const latex = execSync("node --import tsx scripts/test_new_latex.ts", { encoding: "utf-8" });
  const latexCode = latex.slice(latex.indexOf("%-------------------------"));

  console.log("Compiling generated LaTeX to PDF...");
  const pdfBuffer = await compileLatexToPdfBuffer(latexCode);
  if (!pdfBuffer) throw new Error("Compilation failed!");

  console.log(`PDF compiled successfully! Size: ${pdfBuffer.length} bytes`);
  fs.writeFileSync("E:/Job_posting/test_new_generated_resume.pdf", pdfBuffer);

  const p = new PDFParse({ data: pdfBuffer });
  await p.load();
  console.log("Pages in compiled PDF:", p.doc.numPages);
  for (let i = 1; i <= p.doc.numPages; i++) {
    const page = await p.doc.getPage(i);
    const annots = await page.getAnnotations({ intent: "display" });
    console.log(`Page ${i} annotations:`, annots.map((a: any) => ({ subtype: a.subtype, url: a.url || a.unsafeUrl })));
  }
  await p.destroy().catch(() => {});

  const expectedUrls = [
    "mailto:plsprakash2003@gmail.com",
    "https://www.linkedin.com/in/suryaprakashloka/",
    "https://github.com/Prakash9019",
  ];
  const val = await validatePdfHyperlinks(pdfBuffer, expectedUrls);
  console.log("Validation report:", val.report);
}
main().catch(console.error);
