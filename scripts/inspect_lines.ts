import fs from "fs";
import { extractResumeText } from "../lib/ai/resume";

async function main() {
  const buf = fs.readFileSync("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf");
  const extracted = await extractResumeText(buf, "application/pdf");
  const lines = extracted.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Vertx") || lines[i].includes("targeting") || lines[i].includes("drawing") || lines[i].includes("10 minutes")) {
      console.log(`Line ${i}: [${lines[i]}]`);
    }
  }
}
main().catch(console.error);
