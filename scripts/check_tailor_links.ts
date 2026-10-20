import fs from "fs";
import { extractResumeText } from "../lib/ai/resume";
import { generateATSLatex } from "../lib/ats/tailor";

async function main() {
  const buf = fs.readFileSync("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf");
  const extracted = await extractResumeText(buf, "application/pdf");
  const tex = generateATSLatex(extracted);
  const centerIdx = tex.indexOf("\\begin{center}");
  console.log("=== CENTER BLOCK IN LATEX ===");
  console.log(tex.slice(centerIdx, centerIdx + 500));
}
main().catch(console.error);
