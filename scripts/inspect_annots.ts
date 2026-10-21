import fs from "fs";
import { PDFParse } from "pdf-parse";

async function checkAnnots(path: string) {
  const buf = fs.readFileSync(path);
  const p: any = new PDFParse({ data: buf });
  await p.load();
  console.log("=== Pages in", path, ":", p.doc.numPages, "===");
  for (let i = 1; i <= p.doc.numPages; i++) {
    const page = await p.doc.getPage(i);
    const annots = (await page.getAnnotations({ intent: "display" })) || [];
    console.log("Page", i, "annots:", annots.map((a: any) => ({ subtype: a.subtype, url: a.url || a.unsafeUrl })));
  }
  await p.destroy().catch(() => {});
}

async function main() {
  await checkAnnots("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf");
  await checkAnnots("E:/Job_posting/Resume_Loka_Surya_Prakash_Polluxa.pdf");
}
main().catch(console.error);
