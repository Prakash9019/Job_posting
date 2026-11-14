import dns from "node:dns";
try { dns.setDefaultResultOrder("ipv4first"); } catch {}
try {
  const { setGlobalDispatcher, Agent } = require("undici");
  setGlobalDispatcher(new Agent({ connect: { timeout: 45_000 }, headersTimeout: 45_000, bodyTimeout: 45_000 }));
} catch {}

import fs from "fs";
import { prisma } from "../lib/db/prisma";
import {
  autoTailorResumeToJD,
  generateATSLatex,
  compileLatexToPdfBuffer,
  runAllRemediationPasses,
  getCandidateFilename,
} from "../lib/ats/tailor";
import { compileValidatedPdf } from "../lib/ats/pdf-artifact";
import { scoreResume, extractRequirementsFromJobText, containsSkill, resumeLines } from "../lib/ats/scoring";
import { generateTargetedColdEmail } from "../lib/ai/resume";
import { PDFParse } from "pdf-parse";
import type { PdfParseLike } from "./pdf-types";

const jd1 = `
Platform Infrastructure Engineer
Company: Platform Infrastructure
Location: Remote

We are seeking a Platform Infrastructure Engineer to scale our systems.
Key Requirements:
- Python
- Docker
- Kubernetes
- REST
- Distributed Systems
- Artificial Intelligence
- LLM
- Git
`;

const jd2 = `
Senior Backend & AI Systems Engineer
Company: CloudScale AI
Location: San Francisco, CA / Remote

Requirements:
- Strong experience with Python and Node.js
- Production container orchestration with Docker and Kubernetes
- Architecture of Distributed Systems and REST APIs
- Practical applications of Artificial Intelligence and Large Language Models (LLM)
- Strong Git practices and automated CI/CD pipelines
`;

async function testWorkflow(jdText: string, testName: string, companyName: string) {
  console.log(`\n======================================================`);
  console.log(`🧪 TESTING: ${testName} (${companyName})`);
  console.log(`======================================================`);

  const activeResume = await prisma.resume.findFirst({ where: { isActive: true } });
  if (!activeResume || !activeResume.extractedText) throw new Error("No active resume found");

  const baseText = activeResume.extractedText;

  // ─── 1. ATS WORKFLOW ───
  console.log(`\n--- 1. ATS Generation Pipeline ---`);
  const remediation = runAllRemediationPasses({
    text: baseText,
    jobText: jdText,
  });

  const atsLatex = generateATSLatex(remediation.optimizedText);
  const atsFilename = getCandidateFilename(baseText, companyName, "pdf");
  console.log(`Generated ATS filename: "${atsFilename}"`);

  // Verify company name is in filename
  const cleanCompKey = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanFilenameKey = atsFilename.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanFilenameKey.includes(cleanCompKey)) {
    throw new Error(`ATS filename "${atsFilename}" missing company "${companyName}"`);
  }

  const atsPdfBuffer = await compileLatexToPdfBuffer(atsLatex);
  if (!atsPdfBuffer) throw new Error("ATS PDF compilation returned null");

  const p1 = new PDFParse({ data: atsPdfBuffer }) as unknown as PdfParseLike;
  const atsPdfParsed = await p1.getText({ parseHyperlinks: true });
  const atsPages = p1.doc.numPages;
  await p1.destroy();

  console.log(`ATS Compiled PDF pages: ${atsPages}`);
  if (atsPages !== 1) {
    throw new Error(`ATS PDF is ${atsPages} pages (expected exactly 1 page)`);
  }

  const atsPdfText = atsPdfParsed.text || "";
  const atsLines = resumeLines(atsPdfText);
  const reqs = extractRequirementsFromJobText(jdText);

  console.log(`\nVerifying JD skills in ATS-generated PDF:`);
  let allTwiceSatisfied = true;
  for (const r of reqs) {
    const evidence = atsLines.filter((l) => containsSkill(l.text, r.keyword));
    const inSkills = evidence.some((l) => l.section === "skills");
    const inExp = evidence.some((l) => ["experience", "projects"].includes(l.section));
    const satisfied = inSkills && inExp;
    if (!satisfied) allTwiceSatisfied = false;
    console.log(`  - ${r.keyword}: inSkills=${inSkills}, inExp=${inExp} -> ${satisfied ? "✅ SATISFIED" : "❌ FAILED"}`);
  }

  if (!allTwiceSatisfied) {
    throw new Error("Not all JD skills satisfied Twice Rule in ATS-generated PDF!");
  }

  // Verify Twice Rule scoring on PDF text
  const atsScoring = scoreResume(atsPdfText, reqs, jdText);
  console.log(`ATS PDF Deterministic Score: ${atsScoring.score}/100, Match Score: ${atsScoring.matchScore}%`);

  // ─── 2. SCREENSHOT-TO-EMAIL PIPELINE ───
  console.log(`\n--- 2. Screenshot-to-Email Pipeline ---`);
  const tailored = await autoTailorResumeToJD({
    resumeText: baseText,
    jobText: jdText,
    companyName,
    targetRoleTitle: "Platform Infrastructure Engineer",
  });

  console.log(`Screenshot Tailored Filename: "${tailored.attachmentFilename}"`);
  const emailPdfResult = await compileValidatedPdf(tailored.optimizedLatex, {
    linkSource: baseText,
    expectedText: tailored.optimizedText,
    minContentCoverage: 0.85,
  });

  if (!emailPdfResult.ok) {
    throw new Error(`Email PDF validation failed: ${emailPdfResult.reasons.join("; ")}`);
  }

  console.log(`Email PDF pages: ${emailPdfResult.pages}`);
  if (emailPdfResult.pages !== 1) {
    throw new Error(`Email PDF is ${emailPdfResult.pages} pages (expected exactly 1 page)`);
  }

  const p2 = new PDFParse({ data: emailPdfResult.buffer }) as unknown as PdfParseLike;
  const emailPdfParsed = await p2.getText({ parseHyperlinks: true });
  await p2.destroy();

  const emailPdfText = emailPdfParsed.text || "";
  const emailLines = resumeLines(emailPdfText);

  console.log(`\nVerifying JD skills in Email-attached PDF:`);
  let emailAllTwiceSatisfied = true;
  for (const r of reqs) {
    const evidence = emailLines.filter((l) => containsSkill(l.text, r.keyword));
    const inSkills = evidence.some((l) => l.section === "skills");
    const inExp = evidence.some((l) => ["experience", "projects"].includes(l.section));
    const satisfied = inSkills && inExp;
    if (!satisfied) emailAllTwiceSatisfied = false;
    console.log(`  - ${r.keyword}: inSkills=${inSkills}, inExp=${inExp} -> ${satisfied ? "✅ SATISFIED" : "❌ FAILED"}`);
  }

  if (!emailAllTwiceSatisfied) {
    throw new Error("Not all JD skills satisfied Twice Rule in Email-attached PDF!");
  }

  // ─── 3. EMAIL BODY VALIDATION ───
  console.log(`\n--- 3. Email Body Phrasing ---`);
  const emailDraft = await generateTargetedColdEmail({
    jobProfile: {
      companyName,
      targetRoleTitle: "Platform Infrastructure Engineer",
      primaryTechStack: reqs.map((r) => r.keyword),
      architectureAndDomainKeywords: ["Distributed Systems", "Cloud"],
      targetRole: "Platform Infrastructure Engineer",
    },
    resumeText: tailored.optimizedText,
    candidateName: "Loka Surya Prakash Pentakota",
  });

  console.log(`Email subject: "${emailDraft.subject}"`);
  console.log(`Email body:\n${emailDraft.body}`);

  if (!emailDraft.body.includes("Please find the attached resume.")) {
    throw new Error(`Email body does not contain exact phrase "Please find the attached resume."`);
  }

  if (/Resume_Loka_Surya_Prakash/i.test(emailDraft.body)) {
    throw new Error(`Email body should not mention the resume filename inside the text!`);
  }

  console.log(`\n✅ ALL CHECKS PASSED FOR ${testName}!\n`);
}

async function main() {
  await testWorkflow(jd1, "Job Description 1 (Platform Infrastructure)", "Platform Infrastructure");
  await testWorkflow(jd2, "Job Description 2 (CloudScale AI)", "CloudScale AI");

  console.log(`======================================================`);
  console.log(`🎉 BOTH WORKFLOWS FULLY VERIFIED AND PASSING!`);
  console.log(`======================================================`);
}

main().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
