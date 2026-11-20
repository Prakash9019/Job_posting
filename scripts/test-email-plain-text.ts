/**
 * Offline checks (no network / DB) for plain-text email enforcement and email assembly.
 *   node --import tsx scripts/test-email-plain-text.ts
 */
import fs from "fs";
import { normalizePlainTextEmail, normalizePlainTextSubject, findPlainTextViolations } from "../lib/email/plain-text";
import { assembleEmailBody, extractEmailContent, findStyleIssues } from "../lib/email/compose";
import { generateTargetedColdEmail } from "../lib/ai/resume";
import { EMAIL_CASES, buildEmailInputs } from "./fixtures/email-quality-fixtures";

const errors: string[] = [];
const check = (cond: boolean, msg: string) => { if (!cond) errors.push(msg); };
const eq = (got: string, want: string, msg: string) => check(got === want, `${msg}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`);

// 1. Markdown removal
eq(normalizePlainTextEmail("I **launched** a __platform__ and *scaled* it."), "I launched a platform and scaled it.", "bold/italic markers");
eq(normalizePlainTextEmail("## Experience\nBuilt `FastAPI` services."), "Experience\nBuilt FastAPI services.", "heading + inline code");
eq(normalizePlainTextEmail("```\nHi Priya,\n\nBody.\n```"), "Hi Priya,\n\nBody.", "code fence");
eq(normalizePlainTextEmail("*   **Scalable APIs:** cut time by 42%\n• Second\n* Third"), "- Scalable APIs: cut time by 42%\n- Second\n- Third", "bullet characters -> '- '");
eq(normalizePlainTextEmail("[GitHub](https://github.com/Prakash9019) | [LinkedIn](https://www.linkedin.com/in/suryaprakashloka/)"), "GitHub: https://github.com/Prakash9019 | LinkedIn: https://www.linkedin.com/in/suryaprakashloka/", "markdown links");
eq(normalizePlainTextEmail("Skills: C\\#, Next\\.js and Node\\.js"), "Skills: C#, Next.js and Node.js", "escaped markdown");

// 2. HTML / JSON / quotes / commentary
eq(normalizePlainTextEmail("<p>Hi Team,</p><p>I build <strong>APIs</strong>.<br>Thanks</p>"), "Hi Team,\n\nI build APIs.\nThanks", "html tags");
eq(normalizePlainTextEmail("R&amp;D work &amp; more"), "R&D work & more", "html entities");
eq(normalizePlainTextEmail('{"subject":"x","body":"Hi Team,\\n\\nBody text."}'), "Hi Team,\n\nBody text.", "raw JSON body");
eq(normalizePlainTextEmail('"Hi Team,\n\nBody text."'), "Hi Team,\n\nBody text.", "quotes wrapping the email");
eq(normalizePlainTextEmail("Hi Team,\\n\\nBody text."), "Hi Team,\n\nBody text.", "literal \\n sequences");
eq(normalizePlainTextEmail("Subject: Application\n\nHi Team,\n\nBody.\n\n(Word count: 150)"), "Hi Team,\n\nBody.", "subject line + commentary removed");
eq(normalizePlainTextEmail("Here is the email:\n\nHi Team,\n\nBody."), "Hi Team,\n\nBody.", "model preamble removed");

// 3. Legitimate content is preserved
const keep = [
  "Profile: https://www.linkedin.com/in/some_user_name_/ and https://github.com/a_b/c__d",
  "Contact first_last@example.co.in for R&D roles with C++ and C# (<5 years, >3 services).",
  "Use the subject: \"FDE Application - Ravi Menon\" exactly.",
  "Improved accuracy by 38% - and cut costs by 2x.",
  "- Billing Portal (Globex): Processed 1.2M invoices with 99.9% uptime.",
  "Hi Priya,\n\nParagraph one.\n\n- One\n- Two\n\nBest regards,\nAda Example",
];
for (const k of keep) eq(normalizePlainTextEmail(k), k, "legitimate text must be unchanged");
eq(normalizePlainTextSubject('**Subject:** "Full Stack Developer – Noida"'), "Full Stack Developer – Noida", "subject cleanup");
eq(normalizePlainTextSubject("Subject Matter Expert - Ravi Menon"), "Subject Matter Expert - Ravi Menon", "a title starting with 'Subject' is kept");
eq(normalizePlainTextSubject("Application for AI Engineer — Ada Example (AIE-2041)"), "Application for AI Engineer — Ada Example (AIE-2041)", "default subject unchanged");

// 4. Violation detector
check(findPlainTextViolations("Hi **Team**").includes("Markdown bold markers"), "bold detected");
check(findPlainTextViolations("see `code`").length > 0, "backticks detected");
check(findPlainTextViolations("Dear [Hiring Manager Name],").includes("unfilled placeholder"), "placeholder detected");
check(findPlainTextViolations("Per PROJECT_EVIDENCE [2] ...").includes("internal prompt/validation text"), "prompt leakage detected");
check(findPlainTextViolations("Link: https://linkedin.com/in/a__b__c").length === 0, "underscores inside URLs are not markdown");

// 5. Messy model output -> clean assembled email (greeting/sign-off/links/attachment are owned by code)
const messy = `**Subject:** Something\n\nDear Tanushree,\n\nI build **full-stack** products.\n\nHighlights:\n*   **APIs:** cut integration time by 42%\n*   **Scale:** 1,000+ daily users\n*   **Search:** 42% better discovery\n\nI've attached my resume for your review. I'd welcome a chat.\n\nBest regards,\n\n**Loka Surya Prakash Pentakota**\n[GitHub](https://github.com/x)`;
const content = extractEmailContent(messy);
eq(content, "I build full-stack products.\n\nHighlights:\n- APIs: cut integration time by 42%\n- Scale: 1,000+ daily users\n- Search: 42% better discovery\n\nI'd welcome a chat.", "content extraction");
const assembled = assembleEmailBody("Hi Tanushree,", content, { candidateName: "Loka Surya Prakash Pentakota", githubUrl: "https://github.com/Prakash9019", linkedinUrl: "" });
check(assembled.startsWith("Hi Tanushree,\n\n") && assembled.includes("I'd welcome a chat. Please find the attached resume.") && assembled.endsWith("Best regards,\nLoka Surya Prakash Pentakota\nGitHub: https://github.com/Prakash9019"), `assembly:\n${assembled}`);
check(findPlainTextViolations(assembled).length === 0, "assembled email is plain text");
check((assembled.match(/attached resume/gi) || []).length === 1, "exactly one attachment reference");
check(findStyleIssues("I am writing to apply. I believe I am a strong fit.").length === 1, "cliches detected");
check(findStyleIssues("At Vertx I built X. Vertx then grew.", { employers: ["Vertx"] }).some((s) => /named 2 times/.test(s)), "repeated employer detected");

// 6. Saved "direct Gemini" outputs (Markdown-heavy) normalise to clean plain text, when available.
const dir = "tests/output/email-compare";
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.startsWith("direct-")) : []) {
  for (const r of JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8")) as Array<{ caseId: string; body: string }>) {
    const v = findPlainTextViolations(normalizePlainTextEmail(r.body)).filter((x) => x !== "unfilled placeholder");
    check(v.length === 0, `${f}/${r.caseId}: still not plain text after normalisation: ${v.join(", ")}`);
  }
}

// 7. Deterministic fallback for every fixture: plain text, correct identity, greeting, subject, no foreign data.
async function fallbackChecks() {
  const others = (id: string) => EMAIL_CASES.filter((c) => c.resume !== EMAIL_CASES.find((x) => x.id === id)!.resume);
  for (const c of EMAIL_CASES) {
    const inp = buildEmailInputs(c);
    const d = await generateTargetedColdEmail({ jobProfile: { ...inp.jobProfile, jobDescription: c.extraction.jobDescription || undefined, hiringManagerName: c.expect.greeting === "Hi Hiring Team," ? undefined : c.extraction.contactName || undefined, recipientEmail: c.extraction.recipientEmail || undefined, recipientEvidence: c.extraction.jobDescription || undefined }, canonicalResume: c.resume, resumeText: inp.resumeText, candidateName: c.resume.fullName });
    console.log(`\n===== fallback: ${c.label} =====\nSubject: ${d.subject}\n${d.body}\n(words: ${d.wordCount})`);
    check(findPlainTextViolations(d.body).length === 0, `${c.id}: fallback not plain text: ${findPlainTextViolations(d.body)}`);
    check(d.body.startsWith(c.expect.greeting), `${c.id}: fallback greeting`);
    eq(d.subject, c.expect.subject, `${c.id}: fallback subject`);
    check(d.body.includes(`Best regards,\n${c.resume.fullName}`), `${c.id}: fallback sign-off`);
    check(!/by an additional and/i.test(d.body), `${c.id}: quoted an incomplete resume line`);
    for (const o of others(c.id)) {
      for (const leak of [o.resume.fullName, o.resume.email, o.resume.githubUrl].filter(Boolean) as string[]) check(!d.body.includes(leak), `${c.id}: leaked ${leak}`);
    }
    for (const re of c.expect.mustNotMention || []) check(!re.test(d.body), `${c.id}: must not mention ${re}`);
    check(d.wordCount >= 100 && d.wordCount <= 200, `${c.id}: fallback length ${d.wordCount}`);
  }
}

fallbackChecks().then(() => {
  if (errors.length) {
    console.error("\nFAILURES:");
    errors.forEach((e) => console.error(" -", e));
    process.exit(1);
  }
  console.log("\nEmail plain-text + assembly checks passed");
}).catch((e) => { console.error(e); process.exit(1); });
