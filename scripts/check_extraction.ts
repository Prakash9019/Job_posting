import fs from "fs";
import { extractResumeText } from "../lib/ai/resume";

async function main() {
  const buf = fs.readFileSync("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf");
  const extracted = await extractResumeText(buf, "application/pdf");
  console.log("=== EXTRACTED TEXT FROM ORIGINAL ===");
  console.log(extracted.slice(0, 1000));
}
main().catch(console.error);
