import fs from "fs";
import { extractResumeText } from "../lib/ai/resume";
import { normalizeWrappedBullets } from "../lib/ats/scoring";
import { extractHyperlinksFromMarkdownText } from "../lib/ats/hyperlinks";

// Test our parser logic against Surya Prakash resume
async function test() {
  const buf = fs.readFileSync("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf");
  const extracted = await extractResumeText(buf, "application/pdf");
  const normalized = normalizeWrappedBullets(extracted);
  const lines = normalized.split("\n").filter(l => l.trim());

  console.log("Total normalized lines:", lines.length);
  console.log("Lines 0 to 10:");
  lines.slice(0, 10).forEach((l, idx) => console.log(`${idx}: [${l}]`));

  console.log("\nLines 20 to 35:");
  lines.slice(20, 35).forEach((l, idx) => console.log(`${idx + 20}: [${l}]`));
}
test().catch(console.error);
