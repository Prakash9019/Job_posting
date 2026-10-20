import fs from "fs";
import { autoTailorResumeToJD } from "../lib/ats/tailor";
import { extractResumeText } from "../lib/ai/resume";

async function main() {
  const buf = fs.readFileSync("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf");
  const resumeText = await extractResumeText(buf, "application/pdf");
  const jobText = `Junior Software Developer
Polluxa
We're Hiring Junior Software Developer
- 0-1 Years Exp
- Remote
SKILLS
- Java / Python / JavaScript Programming
- Data Structures and Algorithms
- Object-Oriented Programming (OOP)
- HTML5, CSS3 & React.js
- SQL & Database Management
- REST API Development
- Git & Version Control`;

  console.log("Running autoTailorResumeToJD...");
  const res = await autoTailorResumeToJD({
    resumeText,
    jobText,
    companyName: "Polluxa",
  });

  console.log("=== OPTIMIZED LATEX ===");
  console.log(res.optimizedLatex);
}
main().catch(console.error);
