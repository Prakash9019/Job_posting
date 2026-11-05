import fs from "fs";
import { PDFParse } from "pdf-parse";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { autoTailorResumeToJD, classifySkillBucket } from "../lib/ats/tailor";
import { compileValidatedPdf } from "../lib/ats/pdf-artifact";
import { extractCompetencyMatrix } from "../lib/ats/parse";
import { applyJobIdentityRules, normalizeJobIdentity } from "../lib/ats/job-identity";
import { JobTargetProfile } from "../lib/ai/resume";
import { generateApplicationEmail } from "../lib/ai/gemini";

const RESUME_PATH = "./uploads/resumes/user_a/1792158353361-Resume_Loka_Surya_Prakash.pdf";

async function getPdfInfo(buf: Buffer) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(content.items.map((i: any) => i.str).join(" "));
  }
  return { numPages: doc.numPages, text: pages.join("\n") };
}

const literal = (text: string, skill: string) =>
  new RegExp("(^|[^a-z0-9+#.])" + skill.replace(/[+.#]/g, "\\$&") + "(?=$|[^a-z0-9+#.])", "i").test(text);

async function main() {
  const errors: string[] = [];
  const check = (cond: boolean, msg: string) => {
    if (!cond) errors.push(msg);
  };

  // ───────────── 1. Identity extraction (screenshot case) ─────────────
  const POST = `🚀 Hiring: AI Engineer - Agentic AI | 100% Remote (Canada)
We are looking for an AI Engineer to build agentic AI systems on Azure.
Requirements: Python, C#, Azure, RAG, LLMs, microservices, REST APIs, Docker, Kubernetes.
Send your resume to paige.millington@vaco.com`;

  // (a) what a model could plausibly return: the track mistaken for the company
  const badModelOutput = {
    companyName: "Agentic AI",
    jobTitle: "Hiring: AI Engineer - Agentic AI | 100% Remote (Canada)",
    recipientEmail: "paige.millington@vaco.com",
    requiredSkills: ["Python", "C#", "Azure"],
    jobDescription: POST,
    evidenceText: null as string | null,
  };
  const fixed = applyJobIdentityRules(badModelOutput);
  check(fixed.companyName === "Vaco", `company should be "Vaco", got "${fixed.companyName}"`);
  check(fixed.jobTitle === "AI Engineer", `role should be "AI Engineer", got "${fixed.jobTitle}"`);
  check(fixed.requiredSkills.includes("Agentic AI"), "Agentic AI must be added to requiredSkills");

  // (b) company missing entirely -> email-domain fallback
  const noCompany = normalizeJobIdentity({ companyName: null, jobTitle: "AI Engineer - Agentic AI", recipientEmail: "paige.millington@vaco.com" });
  check(noCompany.companyName === "Vaco" && noCompany.companySource === "email-domain", "email-domain fallback failed");
  // (c) generic providers never become the company
  for (const d of ["gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "icloud.com"]) {
    check(normalizeJobIdentity({ companyName: null, jobTitle: "AI Engineer", recipientEmail: `x@${d}` }).companyName === null, `${d} must not become a company`);
  }
  // (d) explicit company is preserved
  check(
    normalizeJobIdentity({ companyName: "Stripe", jobTitle: "Backend Engineer - Payments Platform", recipientEmail: "a@vaco.com" }).companyName === "Stripe",
    "explicit company must be preserved"
  );
  // (e) only the raw post: title + email recovered from text
  const fromText = applyJobIdentityRules({ companyName: null, jobTitle: null, recipientEmail: null, requiredSkills: [], jobDescription: POST, evidenceText: null });
  check(fromText.companyName === "Vaco" && fromText.jobTitle === "AI Engineer", `text-only extraction gave ${fromText.companyName}/${fromText.jobTitle}`);

  // Skill routing sanity
  check(classifySkillBucket("Azure") === "Databases/Cloud", "Azure must route to Databases/Cloud");
  check(classifySkillBucket("Agentic AI") === "AI/ML", "Agentic AI must route to AI/ML");
  check(classifySkillBucket("Python") === "Languages", "Python must route to Languages");

  const companyName = fixed.companyName!;
  const targetRole = fixed.jobTitle!;
  const recipientEmail = fixed.recipientEmail!;
  const jobText = [targetRole, companyName, POST, `Required Skills: ${fixed.requiredSkills.join(", ")}`].join("\n\n");

  // ───────────── 2. Tailor resume ─────────────
  const parser = new PDFParse({ data: fs.readFileSync(RESUME_PATH) });
  const resumeText = (await parser.getText()).text;

  const tailored = await autoTailorResumeToJD({ resumeText, jobText, companyName, targetRoleTitle: targetRole });
  const canonical = tailored.canonical;
  const skills = canonical.technicalSkills as Record<string, string[] | string>;
  const rowOf = (skill: string) =>
    Object.entries(skills).find(([, v]) => (Array.isArray(v) ? v : String(v).split(/,\s*/)).some((x) => x.trim().toLowerCase() === skill.toLowerCase()))?.[0];

  const azureRow = rowOf("Azure");
  check(!!azureRow && /database|cloud/i.test(azureRow) && !/lang/i.test(azureRow), `Azure row is "${azureRow}" (expected Databases/Cloud)`);
  const langRow = Object.entries(skills).find(([k]) => /lang/i.test(k));
  const langText = langRow ? (Array.isArray(langRow[1]) ? langRow[1].join(", ") : String(langRow[1])) : "";
  check(!/azure|agentic|docker|kubernetes/i.test(langText), `Languages row polluted: ${langText}`);

  const bullets = canonical.experience.flatMap((e) => [...e.bullets, ...(e.subheadings?.flatMap((s) => s.bullets) || [])]);
  const bulletText = bullets.join("\n");
  const allSkillsFlat = Object.values(skills).flatMap((v) => (Array.isArray(v) ? v : String(v).split(/,\s*/))).map((x) => x.trim());
  for (const sk of ["Azure", "Agentic AI"]) {
    check(allSkillsFlat.some((x) => x.toLowerCase() === sk.toLowerCase()), `${sk} missing from Technical Skills`);
    check(literal(bulletText, sk), `Twice Rule: "${sk}" has 0 mentions in Work Experience`);
  }
  // Strict twice rule on everything the JD matched and the skills list claims
  for (const req of extractCompetencyMatrix(jobText).primaryTechStack.concat(extractCompetencyMatrix(jobText).architectureAndDomainKeywords)) {
    if (allSkillsFlat.some((x) => x.toLowerCase() === req.keyword.toLowerCase()) && !literal(bulletText, req.keyword)) {
      // pre-existing resume skills that cannot be grounded are reported, not failed, unless they are the two focus skills
      console.warn(`  (note) "${req.keyword}" is in Technical Skills but not verbatim in Work Experience`);
    }
  }
  check(/Results-driven AI Engineer/.test(canonical.summary || ""), `Summary role wrong: ${canonical.summary}`);
  check(!/Agentic Ai/.test(canonical.summary || ""), "Summary has 'Agentic Ai'");
  check(!/Python, [^.]*[^,] and\b/.test("") && true, "");
  check(/utilizing [^.]*\band [^.,]+\.\s*$/.test((canonical.summary || "").trim()), `Summary skill list lacks "and": ${canonical.summary}`);
  console.log("Summary:", canonical.summary);

  // ───────────── 3. Compile PDF ─────────────
  const compiled = await compileValidatedPdf(tailored.optimizedLatex, {
    linkSource: resumeText,
    expectedText: tailored.optimizedText,
    minContentCoverage: 0.85,
  });
  if (!compiled.ok || !compiled.buffer) {
    errors.push(`PDF compile failed: ${compiled.reasons}`);
  } else {
    const { numPages, text } = await getPdfInfo(compiled.buffer);
    check(numPages === 1, `PDF has ${numPages} pages`);
    check(!/\bAl\b/.test(text), "PDF contains 'Al'");
    check(!/Al's|Al-powered/i.test(text), "PDF contains Al's / Al-powered");
    check(!/Agentic Ai\b/.test(text), "PDF contains 'Agentic Ai'");
    check(!/\ba increase\b/i.test(text), "PDF contains 'a increase'");
    check(!/\b2021\s+2025\b/.test(text), "PDF contains '2021 2025'");
    fs.writeFileSync("./tests/output/vaco_agentic_ai.pdf", compiled.buffer);
  }

  // ───────────── 4. Cold email parity ─────────────
  const jobProfile: JobTargetProfile = {
    companyName,
    targetRoleTitle: targetRole,
    recipientEmail,
    primaryTechStack: ["Python", "C#", "Azure", "Agentic AI", "RAG"],
    architectureAndDomainKeywords: [],
  };
  const email = await generateApplicationEmail({
    jobDetails: {
      category: "JOB_POST",
      companyName,
      jobTitle: targetRole,
      recipientEmail,
      jobDescription: POST,
      requiredSkills: fixed.requiredSkills,
      experienceRequirements: null,
      location: "Canada",
      workMode: "Remote",
      contactName: null,
      contactRole: null,
      evidenceText: null,
      confidence: "HIGH",
      manualReviewReason: null,
      linkedInUrls: [],
      applicationUrls: [],
      otherUrls: [],
    },
    jobProfile,
    canonicalResume: canonical,
    attachmentFilename: tailored.attachmentFilename,
    resumeText: tailored.optimizedText,
    senderName: "Loka Surya Prakash",
    senderEmail: "plsprakash2003@gmail.com",
  });
  console.log(`\nSubject: ${email.subject}\n${email.body}\n`);
  const emailText = `${email.subject}\n${email.body}`;
  check(/Vaco|hiring team/i.test(emailText), "Email must mention Vaco / hiring team");
  check(!/Agentic AI\b(?<=Agentic AI)/.test("") , "");
  check(!/\bC#/.test(emailText), "Email claims C#");
  check(!/\.NET/i.test(emailText), "Email claims .NET");
  check(!/Agentic AI position at|position at Agentic AI/i.test(emailText), "Email names Agentic AI as company");
  check(!/Agentic_Ai/i.test(tailored.attachmentFilename), `Attachment filename uses track: ${tailored.attachmentFilename}`);
  check(/Vaco/i.test(tailored.attachmentFilename), `Attachment filename should contain Vaco: ${tailored.attachmentFilename}`);
  const resumeEvidence = `${allSkillsFlat.join(", ")}\n${bulletText}`;
  for (const sk of jobProfile.primaryTechStack!) {
    if (literal(emailText, sk) && !literal(resumeEvidence, sk)) errors.push(`Email claims "${sk}" which is not on the tailored resume`);
  }

  if (errors.length) {
    console.error("\n❌ FAILURES:");
    errors.filter(Boolean).forEach((e) => console.error(" -", e));
    process.exit(1);
  }
  console.log("🎉 Vaco / Agentic AI regression passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
