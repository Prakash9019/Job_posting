import fs from "fs";
import { PDFParse } from "pdf-parse";

async function read(path: string) {
  const buf = fs.readFileSync(path);
  const parser = new PDFParse({ data: buf });
  try {
    const res = await parser.getText({ parseHyperlinks: true });
    return res.text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function main() {
  const origPath = fs.existsSync("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf")
    ? "E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf"
    : "C:/Users/plspr/Downloads/SuryaPrakash_Resume_SE.pdf";

  console.log("Reading original from:", origPath);
  const orig = await read(origPath);
  console.log("=== ORIGINAL RESUME TEXT (length " + orig.length + ") ===");
  console.log(orig);
  console.log("\n=========================================\n");
  const gen = await read("E:/Job_posting/Resume_Loka_Surya_Prakash_Polluxa.pdf");
  console.log("=== GENERATED (POLLUXA) RESUME TEXT (length " + gen.length + ") ===");
  console.log(gen);
}
main().catch(console.error);
