import fs from "fs";
import { PDFParse } from "pdf-parse";

async function main() {
  const buf = fs.readFileSync("E:/Job_posting/test_new_generated_resume.pdf");
  const p = new PDFParse({ data: buf });
  await p.load();
  console.log("Num pages:", p.doc.numPages);
  for (let i = 1; i <= p.doc.numPages; i++) {
    const page = await p.doc.getPage(i);
    const textContent = await page.getTextContent();
    const str = textContent.items.map((it: any) => it.str).join(" ");
    console.log(`Page ${i} text length:`, str.length);
    console.log(`Page ${i} ends with:`, str.slice(-200));
  }
  await p.destroy().catch(() => {});
}
main().catch(console.error);
