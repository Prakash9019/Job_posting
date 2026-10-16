import assert from "node:assert";
import { generateATSLatex, compileLatexToPdfBuffer, runAllRemediationPasses } from "../lib/ats/tailor";

async function verifyHeadingsAndLatex() {
  console.log("==============================================================");
  console.log("🧪 TESTING LATEX HEADINGS, STYLE, ZERO PAGE NUMBERS & COMPILATION");
  console.log("==============================================================\n");

  const sampleResume = `Loka Surya Prakash Pentakota
+91-6301750186 | plsprakash2003@gmail.com | LinkedIn | GitHub
Professional Summary
Full-stack software engineer building AI-powered real-time distributed systems.
Technical Skills
Languages: C++, Python, JavaScript, TypeScript, SQL
Frontend: React.js, Next.js, React Native, Expo, TailwindCSS
Backend: Node.js, Express.js, Flask, FastAPI, REST APIs, WebSockets
AI/ML: Retrieval-Augmented Generation (RAG), Agentic AI, Computer Vision
Work Experience
Platform Engineer April 2026 – September 2026
JulleyOnline Private Limited India
– PMS Integration Hub
∗ Architected a centralized integration hub using adapter and registry patterns.
∗ Integrated Gmail, Zoho, Microsoft Outlook, and Naukri.
– Drone GCS & Fleet Management Platform
∗ Engineered a distributed ArduPilot Ground Control Station using React and FastAPI.
∗ Implemented telemetry and flight commands with zero telemetry loss.
– AI-Powered Engineering Drawing Tag Extraction
∗ Developed a multi-stage AI pipeline using YOLO, SAHI, and OCR to extract tags.
Founding Full-Stack Engineer August 2024 – February 2026
Vertx Remote
– Vertx Flow — AI Fundraising Platform
∗ Developed AI workflows for investor matching, ranking, and pitch generation.
– Vertx Startin — Founder-Investor Network
∗ Engineered the full-stack platform using React.js, Node.js, Express.js, and MongoDB.
-- 1 of 2 --
Projects
• AI-Powered Resume Analyzer - Gemini Pro, LLM
– Developed an intelligent ATS system scoring resumes against JDs.
Education
Vignan’s Institute Of Information Technology | Visakhapatnam, India 2021 – 2025
Bachelor of Technology in Computer Science and Engineering CGPA: 8.9/10.0
Achievements
• Hackathon Enthusiast: Participated in 50+ hackathons; Secured Top 20 in SusHacks.
• National Rank: Ranked 37th across India in National Entrepreneurship Challenge.
Certifications
• CCNA: Enterprise Networking, Security (CISCO)
-- 2 of 2 --
`;

  console.log("--- 1. Testing Section Heading Preservation & Normalization ---");
  const latex = generateATSLatex(sampleResume);

  // Check section headings
  assert(latex.includes("\\section{PROFESSIONAL SUMMARY}"), "Must include PROFESSIONAL SUMMARY section");
  assert(latex.includes("\\section{TECHNICAL SKILLS}"), "Must include TECHNICAL SKILLS section");
  assert(latex.includes("\\section{WORK EXPERIENCE}"), "Must include WORK EXPERIENCE section");
  assert(latex.includes("\\section{PROJECTS}"), "Must include PROJECTS section");
  assert(latex.includes("\\section{EDUCATION}"), "Must include EDUCATION section");
  assert(latex.includes("\\section{ACHIEVEMENTS}"), "Must include ACHIEVEMENTS section");
  assert(latex.includes("\\section{CERTIFICATIONS}"), "Must include CERTIFICATIONS section");
  console.log("✅ [PASS] All 7 canonical section headings preserved with \\section{...}");

  console.log("\n--- 2. Testing Page Numbers & Unwanted Heading Removal ---");
  assert(!latex.includes("1 of 2"), "Must NOT contain '1 of 2'");
  assert(!latex.includes("2 of 2"), "Must NOT contain '2 of 2'");
  assert(latex.includes("\\pagestyle{empty}"), "Must declare \\pagestyle{empty} to strip page numbers");
  assert(latex.includes("\\thispagestyle{empty}"), "Must declare \\thispagestyle{empty}");
  console.log("✅ [PASS] Zero page numbers and unwanted pagination headers cleanly removed");

  console.log("\n--- 3. Testing Project & Feature Sub-Heading Formatting ---");
  assert(latex.includes("\\textbf{PMS Integration Hub}"), "Project PMS Integration Hub must be formatted as bold sub-heading");
  assert(latex.includes("\\textbf{Drone GCS \\& Fleet Management Platform}"), "Project Drone GCS must be formatted as bold sub-heading");
  assert(latex.includes("\\textbf{Vertx Flow}"), "Project Vertx Flow must be formatted as bold title");
  assert(latex.includes("\\textit{AI Fundraising Platform}"), "Project tech subtitle must be formatted with italic");
  console.log("✅ [PASS] Projects preserved and styled as prominent sub-headings with bullets intact");

  console.log("\n--- 4. Testing Date Range Preservation & Skill Categorization ---");
  assert(latex.includes("April 2026 -- September 2026") || latex.includes("April 2026 – September 2026"), "Date range must remain together on the right");
  assert(latex.includes("\\textbf{Languages:}"), "Skill category Languages must be bolded");
  assert(latex.includes("\\textbf{Frontend:}"), "Skill category Frontend must be bolded");
  assert(latex.includes("\\textbf{Backend:}"), "Skill category Backend must be bolded");
  assert(latex.includes("\\textbf{AI/ML:}"), "Skill category AI/ML must be bolded");
  console.log("✅ [PASS] Date ranges kept intact and skill categories bolded");

  console.log("\n--- 5. Testing TeXLive Compilation to Binary PDF Buffer ---");
  const pdfBuffer = await compileLatexToPdfBuffer(latex);
  assert(pdfBuffer !== null && pdfBuffer.length > 5000, "TeXLive must compile clean LaTeX into valid binary PDF");
  console.log(`✅ [PASS] TeXLive compiled PDF successfully! Size: ${pdfBuffer.length} bytes`);

  console.log("\n==============================================================");
  console.log("🎉 ALL LATEX, HEADING, STYLE, AND COMPILATION CHECKS PASSED!");
  console.log("==============================================================");
}

verifyHeadingsAndLatex().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
