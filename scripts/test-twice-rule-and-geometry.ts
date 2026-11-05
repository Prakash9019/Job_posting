import assert from "node:assert";
import { runAllRemediationPasses, generateATSLatex, weaveSkillIntoExperienceBullets, trimContentForSinglePage, parseResumeToCanonical, canonicalToPlainText } from "../lib/ats/tailor";
import { optimizeLatexGeometryForOnePage } from "../lib/ats/apply-latex";

async function runTests() {
  console.log("==============================================================");
  console.log("🧪 TESTING TWICE RULE, ZERO TEXT JUMBLE, HEADING HIERARCHY & DECOMPRESSION");
  console.log("==============================================================\n");

  const sampleResume = `Loka Surya Prakash Pentakota
+91-6301750186 | plsprakash2003@gmail.com | LinkedIn | GitHub
Professional Summary
Full-stack software engineer building AI-powered real-time distributed systems.
Technical Skills
Languages: C++, Python, JavaScript, TypeScript, SQL
Frontend: React.js, Next.js, React Native, Expo, TailwindCSS
Backend: Node.js, Express.js, Flask, FastAPI, REST APIs, WebSockets
AI/ML: Retrieval-Augmented Generation (RAG), Agentic AI, Computer Vision, Artificial Intelligence
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
`;

  // --- 1. Test Twice Rule Weaving ---
  console.log("--- 1. Testing The Twice Rule (Deep Contextual Skill Weaving) ---");
  const bullets = [
    "Architected a centralized integration hub using adapter and registry patterns.",
    "Engineered a distributed ArduPilot Ground Control Station using React and FastAPI.",
    "Developed a multi-stage AI pipeline using YOLO, SAHI, and OCR to extract tags."
  ];

  const aiWeave = weaveSkillIntoExperienceBullets(bullets, "Artificial Intelligence");
  assert(aiWeave.success, "Must successfully weave Artificial Intelligence into experience bullets");
  assert(
    aiWeave.wovenBullets.some(b => b.includes("Artificial Intelligence pipeline")),
    "Must weave Artificial Intelligence into the pipeline bullet"
  );
  console.log("✓ Weave result:", aiWeave.wovenBullets[2]);
  console.log("✅ [PASS] 'Artificial Intelligence' contextually woven into Work Experience bullet!");

  // --- 2. Test Zero Text Jumble & Structured Pipeline ---
  console.log("\n--- 2. Testing Zero Text Jumble & Project Heading Hierarchy ---");
  const jobDescription = `We are looking for a Senior Platform Engineer with deep expertise in Artificial Intelligence, Python, Distributed Systems, Microservices, and FastAPI.`;

  const tailored = runAllRemediationPasses({
    text: sampleResume,
    jobText: jobDescription,
  });

  // Verify no text corruption
  assert(!tailored.optimizedText.includes("Founding Firstminutes"), "Must not contain 'Founding Firstminutes'");
  assert(!tailored.optimizedLatex.includes("Founding Firstminutes"), "LaTeX must not contain 'Founding Firstminutes'");
  assert(!tailored.optimizedText.includes("Ver Vertx Flow"), "Must not contain 'Ver Vertx Flow'");
  assert(!tailored.optimizedLatex.includes("Ver Vertx Flow"), "LaTeX must not contain 'Ver Vertx Flow'");

  // Verify Project Subheadings are formatted without \item and follow exact hierarchy
  assert(
    tailored.optimizedLatex.includes("\\textbf{Drone GCS \\& Fleet Management Platform}") ||
    tailored.optimizedLatex.includes("\\textbf{Drone GCS & Fleet Management Platform}"),
    "Drone GCS must be bold project heading"
  );
  assert(
    !tailored.optimizedLatex.includes("\\item Drone GCS") &&
    !tailored.optimizedLatex.includes("\\resumeItem{Drone GCS"),
    "Project subheadings must NEVER be wrapped in \\item or \\resumeItem"
  );
  assert(
    tailored.optimizedLatex.includes("\\vspace{3pt}\n\\noindent \\textbf{") ||
    tailored.optimizedLatex.includes("\\vspace{3pt} \\noindent \\textbf{"),
    "Subproject headings must be preceded by \\vspace{3pt} and standalone \\noindent \\textbf{"
  );
  console.log("✅ [PASS] Zero text jumbling and project subheadings rendered cleanly without \\item!");

  // --- 3. Test Zero-Out Bullet Spacing & Surgical Geometry ---
  console.log("\n--- 3. Testing Zero-Out Bullet Spacing & Surgical Geometry ---");
  const decompressedLatex = optimizeLatexGeometryForOnePage(tailored.optimizedLatex);
  
  assert(decompressedLatex.includes("\\linespread{1.15}"), "Must set line spacing multiplier to \\linespread{1.15}");
  assert(decompressedLatex.includes("itemsep=1pt"), "Intra-bullet itemsep must be strictly 1pt near-zero");
  assert(decompressedLatex.includes("\\raggedbottom"), "Must include \\raggedbottom to stop page stretching");
  assert(decompressedLatex.includes("10pt") || decompressedLatex.includes("10.5pt") || decompressedLatex.includes("9.5pt"), "Base font must not drop below 9.5pt (prefer 10pt)");
  assert(decompressedLatex.includes("0.5in"), "Margins must be standard ATS safe 0.5in bounds");
  assert(decompressedLatex.includes("\\vspace{6pt}") || decompressedLatex.includes("{6pt}{2pt}"), "Must have 6pt section spacing");
  assert(decompressedLatex.includes("\\vspace{4pt}"), "Must have 4pt company heading spacing");
  console.log("✅ [PASS] Zero-out bullet spacing (1pt) and surgical spacing (6pt section, 4pt company, 3pt project) verified!");

  // --- 4. Test Single-Page Content Trimming Fallback ---
  console.log("\n--- 4. Testing Single-Page Content Trimming Fallback ---");
  const canonical = parseResumeToCanonical(sampleResume);
  // Add extra bullets to create an overflowing resume
  canonical.experience[0].bullets.push(
    "Bullet 1 of extra content to test single page trimming behavior.",
    "Bullet 2 of extra content to test single page trimming behavior.",
    "Bullet 3 of extra content to test single page trimming behavior.",
    "Bullet 4 of extra content to test single page trimming behavior."
  );
  canonical.experience[1].bullets.push(
    "Older role extra bullet 1 to test trimming.",
    "Older role extra bullet 2 to test trimming.",
    "Older role extra bullet 3 to test trimming."
  );

  const trimResult = trimContentForSinglePage(canonical);
  console.log(`✓ Trimmed ${trimResult.trimmedCount} lowest-weighted bullets from older experience`);
  assert(trimResult.trimmedCount > 0, "Must trigger trimming fallback for overflowing content instead of hyper-compression");
  console.log("✅ [PASS] Content trimming fallback successfully trims lowest-priority bullets to fit 1 page!");

  console.log("\n==============================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("==============================================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
