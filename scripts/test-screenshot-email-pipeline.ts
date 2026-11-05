import fs from "fs";
import { PDFParse } from "pdf-parse";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { autoTailorResumeToJD } from "../lib/ats/tailor";
import { compileValidatedPdf } from "../lib/ats/pdf-artifact";
import { extractCompetencyMatrix } from "../lib/ats/parse";
import { JobTargetProfile } from "../lib/ai/resume";
import { generateApplicationEmail } from "../lib/ai/gemini";
import { validatePdfHyperlinks } from "../lib/ats/hyperlinks";

async function getPageCountAndText(buf: Buffer): Promise<{ numPages: number; text: string; pagesText: string[] }> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pagesText: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const str = content.items.map((i: any) => i.str).join(" ");
    pagesText.push(str);
  }
  return {
    numPages: doc.numPages,
    text: pagesText.join("\n"),
    pagesText,
  };
}

async function runScreenshotEmailPipelineTest() {
  console.log("==============================================================");
  console.log("🧪 VERIFYING SCREENSHOT-TO-JOB EMAIL & RESUME ATTACHMENT PIPELINE");
  console.log("==============================================================\n");

  // 1. Read candidate's baseline resume
  const origPdfBuf = fs.readFileSync("./uploads/resumes/user_a/1792158353361-Resume_Loka_Surya_Prakash.pdf");
  const parser = new PDFParse({ data: origPdfBuf });
  const resumeText = (await parser.getText()).text;

  // Intentionally inject OCR corruptions & raw bullet artifacts to test all sanitizers
  const dirtyText = resumeText
    .replace(/Vertx/g, "Vertz")
    .replace(/AI Engineer/g, "Al Engineer")
    .replace(/AI-powered/g, "Al-powered")
    .replace(/∗ Architected/g, "* Architected")
    .replace(/Vignan/g, "• Vignan");

  // 2. Simulate Target Job Description extracted from a screenshot
  const companyName = "DeepScale AI";
  const targetRole = "Lead AI & Distributed Systems Engineer";
  const recipientEmail = "careers@deepscale.ai";
  const targetSkills = ["Python", "Artificial Intelligence", "FastAPI", "Docker", "Microservices"];

  const jdText = `
Job Opening: ${targetRole}
Company: ${companyName}
Hiring Manager: Alex Rivera (VP of Engineering)
Email: ${recipientEmail}

About the Role:
We are seeking a ${targetRole} to design, scale, and optimize enterprise platforms.
Key Requirements:
- Deep hands-on expertise with Python, Artificial Intelligence, and FastAPI for real-time inference and processing.
- Proven track record containerizing services with Docker and architecting Microservices pipelines.
- Experience with low-latency streaming architectures, ZeroMQ, and high-availability production workloads.
`;

  console.log("Step 1: Extracting Competency Matrix from Job Description...");
  const matrix = extractCompetencyMatrix(jdText);
  const primaryTech = matrix.primaryTechStack.map((r) => r.keyword);
  const archDomain = matrix.architectureAndDomainKeywords.map((r) => r.keyword);
  console.log(`✓ Primary Tech: ${primaryTech.join(", ") || "Python, FastAPI"}`);
  console.log(`✓ Architecture & Domain: ${archDomain.join(", ") || "Docker, Microservices"}`);

  const jobProfile: JobTargetProfile = {
    companyName,
    targetRoleTitle: targetRole,
    recipientEmail,
    hiringManagerName: "Alex Rivera",
    primaryTechStack: targetSkills,
    architectureAndDomainKeywords: archDomain,
    targetRole,
    targetStack: targetSkills,
  };

  console.log("\nStep 2: Auto-tailoring resume using unified ATS pipeline...");
  const tailored = await autoTailorResumeToJD({
    resumeText: dirtyText,
    jobText: jdText,
    companyName,
  });

  console.log(`✓ Baseline ATS Score: ${tailored.baselineScore}/100 → Tailored ATS Score: ${tailored.finalScore}/100`);
  console.log(`✓ Attachment Filename: ${tailored.attachmentFilename}`);

  console.log("\nStep 3: Compiling validated 1-page PDF artifact...");
  const compiledResult = await compileValidatedPdf(tailored.optimizedLatex, {
    linkSource: dirtyText,
    expectedText: tailored.optimizedText,
    minContentCoverage: 0.85,
  });

  if (!compiledResult.ok || !compiledResult.buffer) {
    console.error("Compilation failed:", compiledResult.reasons);
    process.exit(1);
  }

  const { numPages, text: pdfText } = await getPageCountAndText(compiledResult.buffer);
  console.log(`✓ Compiled PDF Page Count: ${numPages}`);

  console.log("\nStep 4: Generating aligned cold email draft...");
  const generatedEmail = await generateApplicationEmail({
    jobDetails: {
      category: "JOB_POST",
      companyName,
      jobTitle: targetRole,
      recipientEmail,
      jobDescription: jdText,
      requiredSkills: targetSkills,
      experienceRequirements: "3+ years",
      location: "San Francisco, CA",
      workMode: "Hybrid",
      contactName: "Alex Rivera",
      contactRole: "VP of Engineering",
      evidenceText: jdText,
      confidence: "HIGH",
      manualReviewReason: null,
      linkedInUrls: [],
      applicationUrls: [],
      otherUrls: [],
    },
    jobProfile,
    canonicalResume: tailored.canonical,
    attachmentFilename: tailored.attachmentFilename,
    resumeText: tailored.optimizedText,
    senderName: "Loka Surya Prakash",
    senderEmail: "plsprakash2003@gmail.com",
  });

  console.log(`\n--- Generated Email ---`);
  console.log(`Subject: ${generatedEmail.subject}`);
  console.log(`\nBody:\n${generatedEmail.body}\n`);

  const errors: string[] = [];

  // ==========================================
  // ASSERTION 1: Twice Rule in Resume
  // ==========================================
  console.log("Checking Twice Rule in Resume...");

  // 1a: Check Technical Skills contains target skills
  const skillsObj = tailored.canonical.technicalSkills;
  const allSkillsStr = typeof skillsObj === "object"
    ? Object.values(skillsObj).flatMap((v) => (Array.isArray(v) ? v : [String(v)])).join(", ")
    : String(skillsObj);

  for (const sk of targetSkills) {
    const re = new RegExp("(^|[^a-z0-9+#.])" + sk.replace(/[+.]/g, "\\$&") + "(?=$|[^a-z0-9+#.])", "i");
    if (!re.test(allSkillsStr)) {
      errors.push(`Target skill "${sk}" is missing from Technical Skills!`);
    }
  }

  // 1b: Check Work Experience bullets contain target skills
  const expBullets = [
    ...tailored.canonical.experience.flatMap((e) => [
      ...e.bullets,
      ...(e.subheadings?.flatMap((s) => s.bullets) || []),
    ]),
  ];
  const allExpBulletsText = expBullets.join("\n");

  for (const sk of targetSkills) {
    const re = new RegExp("(^|[^a-z0-9+#.])" + sk.replace(/[+.]/g, "\\$&") + "(?=$|[^a-z0-9+#.])", "i");
    if (!re.test(allExpBulletsText)) {
      errors.push(`Twice Rule violated: Target skill "${sk}" is in Technical Skills but missing from Work Experience bullets!`);
    }
  }

  // 1c: Assert <= 2 'and's per bullet in experience
  for (const b of expBullets) {
    const andCount = (b.match(/\band\b/gi) || []).length;
    if (andCount > 2) {
      errors.push(`Bullet contains " and " spam (${andCount} times): "${b.slice(0, 80)}..."`);
    }
  }

  // 1d: Assert zero double action verbs
  const doubleVerbRe = /^(?:Architected|Orchestrated|Engineered|Developed|Delivered|Implemented|Spearheaded)\s+(?:Synthesized|Devised|Engineered|Architected|Developed|Combined|Built|Launched|Implemented|Created)\b/i;
  for (const b of expBullets) {
    if (doubleVerbRe.test(b.trim())) {
      errors.push(`Bullet contains double action verbs: "${b.slice(0, 60)}"`);
    }
  }

  // ==========================================
  // ASSERTION 2: 1-Page Attached PDF
  // ==========================================
  console.log("Checking 1-Page Attached PDF...");
  if (numPages !== 1) {
    errors.push(`PDF page count is ${numPages}, expected strictly 1 page!`);
  }

  // Verify clickable URI annotations for LinkedIn and GitHub
  const linkValidation = await validatePdfHyperlinks(compiledResult.buffer, [
    "https://linkedin.com/in/applicant",
    "https://github.com/applicant",
  ]);
  if (!linkValidation.valid) {
    errors.push(`PDF is missing clickable hyperlinks: ${linkValidation.missingUrls.join(", ")}`);
  }

  // Zero raw asterisk bullets in PDF text
  if (pdfText.includes("* ")) {
    errors.push("PDF contains raw asterisk bullets '* '!");
  }

  // Zero OCR/Math mode corruptions (Al, Vertz, $C++)
  if (/\bAl\b/.test(pdfText)) {
    errors.push("PDF contains standalone 'Al' typo!");
  }
  if (pdfText.includes("Vertz") || pdfText.includes("Vertr")) {
    errors.push("PDF contains misspelled 'Vertz' or 'Vertr'!");
  }
  if (pdfText.includes("$C++$") || pdfText.includes("\\$C++\\$")) {
    errors.push("PDF contains math mode '$C++$'!");
  }

  // Attachment filename format
  if (!tailored.attachmentFilename.startsWith("Resume_Loka_Surya_Prakash_")) {
    errors.push(`Attachment filename is "${tailored.attachmentFilename}", expected "Resume_Loka_Surya_Prakash_[CompanyName].pdf"!`);
  }

  // ==========================================
  // ASSERTION 3: Aligned Tailored Cold Email
  // ==========================================
  console.log("Checking Aligned Tailored Cold Email...");
  const emailWords = generatedEmail.body.trim().split(/\s+/).filter(Boolean);
  const wordCount = emailWords.length;
  console.log(`✓ Email Word Count: ${wordCount} words (Target: 95–135 words)`);

  if (wordCount < 95 || wordCount > 135) {
    errors.push(`Email word count is ${wordCount}, expected strictly between 95 and 135 words!`);
  }

  // Subject line format
  if (!generatedEmail.subject.includes(targetRole) || !generatedEmail.subject.includes("Loka Surya Prakash")) {
    errors.push(`Email subject line does not match format: "${generatedEmail.subject}"`);
  }

  // Check explicit mention of company name
  if (!generatedEmail.body.includes(companyName)) {
    errors.push(`Email body does not mention target company "${companyName}"!`);
  }

  // Check explicit mention of target role
  if (!generatedEmail.body.includes(targetRole) && !generatedEmail.subject.includes(targetRole)) {
    errors.push(`Email does not mention target role "${targetRole}"!`);
  }

  // Check mention of at least 2 target JD skills in email
  const mentionedSkills = targetSkills.filter((sk) => {
    const re = new RegExp("\\b" + sk.replace(/[+.]/g, "\\$&") + "\\b", "i");
    return re.test(generatedEmail.subject) || re.test(generatedEmail.body);
  });
  console.log(`✓ Mentioned Skills in Email: ${mentionedSkills.join(", ")}`);
  if (mentionedSkills.length < 2) {
    errors.push(`Email mentions only ${mentionedSkills.length} target JD skills, expected at least 2!`);
  }

  // Check mention of at least 2 real metrics (42%, 35%, 38%, 99.9%, 500K+, 1,000+)
  const METRIC_PATTERNS = [/42%/i, /35%/i, /38%/i, /99\.9%/i, /500K\+/i, /1,000\+/i];
  const matchedMetrics = METRIC_PATTERNS.filter((p) => p.test(generatedEmail.body));
  console.log(`✓ Matched Real Metrics in Email: ${matchedMetrics.length} found`);
  if (matchedMetrics.length < 2) {
    errors.push(`Email mentions only ${matchedMetrics.length} real metrics, expected at least 2!`);
  }

  // Check for unreplaced bracket placeholders
  const placeholderRe = /\[(?:Company|Role|Name|Percent|X|Y|\$X|N)\]/i;
  if (placeholderRe.test(generatedEmail.subject) || placeholderRe.test(generatedEmail.body)) {
    errors.push("Email contains unreplaced bracket placeholders!");
  }
  if (placeholderRe.test(pdfText)) {
    errors.push("PDF contains unreplaced bracket placeholders!");
  }

  if (errors.length > 0) {
    console.error("\n❌ VERIFICATION FAILURES:");
    errors.forEach((e) => console.error(" -", e));
    process.exit(1);
  }

  console.log("\n==============================================================");
  console.log("🎉 ALL SCREENSHOT-TO-JOB PIPELINE ASSERTIONS PASSED!");
  console.log("==============================================================");
  console.log("✓ Twice Rule: All target JD skills woven into Experience bullets");
  console.log("✓ Zero ' and ' spam (<= 2 per bullet) and zero double verbs");
  console.log("✓ 1-Page Attached PDF: Exactly 1 page, clickable URI links, clean typography");
  console.log("✓ Zero Al/Vertz/$C++ artifacts");
  console.log("✓ Aligned Tailored Email: 95–135 words, company/role/skills/metrics verified");
  console.log("✓ Zero unreplaced placeholders");
}

runScreenshotEmailPipelineTest().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});

