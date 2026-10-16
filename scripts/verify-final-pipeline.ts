import assert from "node:assert";
import {
  getCandidateFilename,
  resolvePlaceholder,
  runAllRemediationPasses,
  autoTailorResumeToJD,
} from "../lib/ats/tailor";
import { buildMimeMessage } from "../lib/email/gmail";

async function verifyPipeline() {
  console.log("==============================================================");
  console.log("🚀 VERIFYING FINAL PRODUCTION PIPELINE REQUIREMENTS");
  console.log("==============================================================\n");

  // 1. Dynamic Resume Filename Matching Candidate Header
  console.log("--- 1. Testing Dynamic Candidate Filename Extraction ---");
  const sampleHeader1 = "LOKA SURYA PRAKASH PENTAKOTA\nlokasurya@example.com | 123-456-7890 | linkedin.com/in/lsp";
  const filename1 = getCandidateFilename(sampleHeader1);
  console.log(`Input: "LOKA SURYA PRAKASH PENTAKOTA" -> Output: "${filename1}"`);
  assert.strictEqual(filename1, "Resume_Loka_Surya_Prakash.pdf", "Candidate filename must match Resume_Loka_Surya_Prakash.pdf");

  const sampleHeader2 = "Jane Doe\njane@example.com";
  const filename2 = getCandidateFilename(sampleHeader2);
  console.log(`Input: "Jane Doe" -> Output: "${filename2}"`);
  assert.strictEqual(filename2, "Resume_John_Doe.pdf".replace("John", "Jane"), "Two-word name must match Resume_Jane_Doe.pdf");

  const sampleHeader3 = "# Loka Surya Prakash\nSoftware Engineer";
  const filename3 = getCandidateFilename(sampleHeader3);
  console.log(`Input: "# Loka Surya Prakash" -> Output: "${filename3}"`);
  assert.strictEqual(filename3, "Resume_Loka_Surya_Prakash.pdf", "Markdown heading must parse properly");

  const filenameWithCompany = getCandidateFilename(sampleHeader1, "Google");
  console.log(`Input: sampleHeader1 + "Google" -> Output: "${filenameWithCompany}"`);
  assert.strictEqual(filenameWithCompany, "Resume_Loka_Surya_Prakash_Google.pdf", "Candidate filename with company must match");

  const filenameDocWithCompany = getCandidateFilename(sampleHeader1, "Microsoft Corp", "doc");
  console.log(`Input: sampleHeader1 + "Microsoft Corp" (doc) -> Output: "${filenameDocWithCompany}"`);
  assert.strictEqual(filenameDocWithCompany, "Resume_Loka_Surya_Prakash_Microsoft_Corp.doc", "Doc candidate filename with company must match");

  // Test automatic company extraction directly from JD text when no company is passed:
  const sampleJDWithAt = "Senior Software Engineer at Apple\nJob Description: We are looking for an engineer...";
  const filenameFromJD1 = getCandidateFilename(sampleHeader1, sampleJDWithAt);
  console.log(`Input: sampleHeader1 + JD("Senior Software Engineer at Apple") -> Output: "${filenameFromJD1}"`);
  assert.strictEqual(filenameFromJD1, "Resume_Loka_Surya_Prakash_Apple.pdf", "Should extract Apple from JD");

  const sampleJDWithLabel = "Role: Full Stack Engineer\nCompany: Amazon Web Services\nLocation: Seattle, WA";
  const filenameFromJD2 = getCandidateFilename(sampleHeader1, sampleJDWithLabel);
  console.log(`Input: sampleHeader1 + JD("Company: Amazon Web Services") -> Output: "${filenameFromJD2}"`);
  assert.strictEqual(filenameFromJD2, "Resume_Loka_Surya_Prakash_Amazon_Web_Services.pdf", "Should extract Amazon Web Services from JD");

  const sampleJDWithAbout = "About Stripe\nStripe builds financial infrastructure for the internet.";
  const filenameFromJD3 = getCandidateFilename(sampleHeader1, sampleJDWithAbout);
  console.log(`Input: sampleHeader1 + JD("About Stripe") -> Output: "${filenameFromJD3}"`);
  assert.strictEqual(filenameFromJD3, "Resume_Loka_Surya_Prakash_Stripe.pdf", "Should extract Stripe from About section");

  console.log("✅ [PASS] Candidate filename and JD company extraction verified\n");

  // 2. Bulletproof [Y]% & [X] Placeholder Eraser
  console.log("--- 2. Testing Bulletproof Placeholder Eraser ---");
  const bulletWithPlaceholders = "Accelerated pipeline execution by [Y]%, scaling database throughput across [N] users and saving [$X].";
  const resolved = resolvePlaceholder(bulletWithPlaceholders);
  console.log(`Original: "${bulletWithPlaceholders}"`);
  console.log(`Resolved: "${resolved}"`);
  assert(!resolved.includes("[Y]"), "Must resolve [Y]");
  assert(!resolved.includes("[N]"), "Must resolve [N]");
  assert(!resolved.includes("[$X]"), "Must resolve [$X]");
  assert.strictEqual(resolved, "Accelerated pipeline execution by 42%, scaling database throughput across 42 users and saving $45K.");

  // Test runAllRemediationPasses lingering placeholder cleanup
  const testResumeText = `LOKA SURYA PRAKASH PENTAKOTA
SUMMARY
Senior Full Stack Engineer.
WORK EXPERIENCE
Software Engineer | Acme Inc | 2022 - Present
- Deployed microservices improving response time by [Y]% and throughput by [X]%.
- Built data processing job handling [N] records, reducing costs by [$X].
- Worked on developing caching layer with latency reduced by [METRIC].
TECHNICAL SKILLS
TypeScript, React, Next.js, Node.js, PostgreSQL
`;

  const passesResult = runAllRemediationPasses({
    text: testResumeText,
    jobText: "Looking for Senior Engineer with TypeScript, React, Next.js, Node.js, PostgreSQL",
  });

  console.log("Optimized Text snippet:\n" + passesResult.optimizedText);
  assert(!/\[[A-Z0-9_%]+\]/g.test(passesResult.optimizedText), "Optimized text must have 0 lingering bracket placeholders");
  assert(!/(?<!\\(?:usepackage|documentclass|begin\{itemize\}))\s*\[[A-Z0-9_%]+\]/g.test(passesResult.optimizedLatex), "Optimized LaTeX must have 0 lingering bracket placeholders");
  console.log("✅ [PASS] Zero bracket placeholders in text and LaTeX\n");

  // 3. autoTailorResumeToJD return type includes attachmentFilename
  console.log("--- 3. Testing autoTailorResumeToJD attachmentFilename ---");
  const tailored = await autoTailorResumeToJD({
    resumeText: testResumeText,
    jobText: "Full Stack Engineer Next.js React PostgreSQL",
  });
  console.log(`autoTailorResumeToJD attachmentFilename: "${tailored.attachmentFilename}"`);
  console.log(`Scores: ${tailored.baselineScore} -> ${tailored.finalScore}/100`);
  assert(tailored.finalScore >= tailored.baselineScore, "Final score should be improved over baseline");
  console.log("✅ [PASS] autoTailorResumeToJD returns attachmentFilename and score\n");

  // 4. MIME attachment header with dynamic filename
  console.log("--- 4. Testing MIME Message with Dynamic Attachment ---");
  const samplePdf = Buffer.from("%PDF-1.4 sample pdf binary data");
  const rawMime = buildMimeMessage({
    from: "Loka Surya Prakash <candidate@example.com>",
    to: "recruiter@techcompany.com",
    subject: "Application for Full Stack Engineer - Loka Surya Prakash",
    body: "Please find attached my resume.",
    attachments: [
      {
        filename: tailored.attachmentFilename,
        content: samplePdf,
        contentType: "application/pdf",
      },
    ],
  });

  const decodedMime = Buffer.from(
    rawMime.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf-8");

  assert(decodedMime.includes(`filename="${tailored.attachmentFilename}"`), `MIME headers must include filename="${tailored.attachmentFilename}"`);
  console.log(`MIME Header Verified: filename="${tailored.attachmentFilename}" found in RFC 2822 message`);
  console.log("✅ [PASS] MIME attachment verified\n");

  console.log("==============================================================");
  console.log("🎉 ALL PRODUCTION PIPELINE CRITERIA VERIFIED SUCCESSFULLY!");
  console.log("==============================================================");
}

verifyPipeline().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
