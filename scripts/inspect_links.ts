import fs from "fs";
import { PDFParse } from "pdf-parse";

async function inspectLinks(path: string) {
  const buf = fs.readFileSync(path);
  const parser = new PDFParse({ data: buf });
  try {
    const res = await parser.getText({ parseHyperlinks: true });
    console.log(`\n=== Links in ${path} ===`);
    // Check if pdf-parse returns annotations or links
    console.log("Hyperlinks extracted in text:");
    const matches = res.text.match(/\[([^\]]+)\]\(([^)]+)\)/g) || [];
    console.log("Markdown links:", matches);
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function main() {
  await inspectLinks("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf");
  await inspectLinks("E:/Job_posting/Resume_Loka_Surya_Prakash_Polluxa.pdf");
}
main().catch(console.error);
