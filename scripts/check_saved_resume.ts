import fs from "fs";
import { PDFParse } from "pdf-parse";
import { extractResumeText } from "../lib/ai/resume";

async function main() {
  const p1 = "E:/Job_posting/uploads/resumes/user_a/1792158353361-Resume_Loka_Surya_Prakash.pdf";
  const buf = fs.readFileSync(p1);
  const parser: any = new PDFParse({ data: buf });
  await parser.load();
  console.log("Pages:", parser.doc.numPages);
  for (let i = 1; i <= parser.doc.numPages; i++) {
    const page = await parser.doc.getPage(i);
    const annots = await page.getAnnotations({ intent: "display" });
    console.log(`Page ${i} annotations:`, annots.map((a: any) => ({ subtype: a.subtype, url: a.url || a.unsafeUrl })));
  }
  await parser.destroy().catch(() => {});

  const extracted = await extractResumeText(buf, "application/pdf");
  console.log("Extracted text line 1-3:");
  console.log(extracted.split("\n").slice(0, 5));
}
main().catch(console.error);
