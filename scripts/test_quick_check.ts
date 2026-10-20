import fs from "fs";
import { extractResumeText } from "../lib/ai/resume";
import { normalizeWrappedBullets } from "../lib/ats/scoring";
import { validatePdfHyperlinks } from "../lib/ats/hyperlinks";

async function main() {
  const origBuf = fs.readFileSync("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf");
  const extracted = await extractResumeText(origBuf, "application/pdf");
  console.log("Extracted text length:", extracted.length);
  console.log("First 3 lines:", extracted.split("\n").slice(0, 3));
}
main().catch(console.error);
