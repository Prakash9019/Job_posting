import fs from "fs";
import { extractFromScreenshot, generateApplicationEmail } from "../lib/ai/gemini";
import { extractResumeText } from "../lib/ai/resume";
import { parseResumeToCanonical } from "../lib/ats/tailor";
import { extractCompetencyMatrix } from "../lib/ats/parse";
import { buildEvidenceUnits, detectRoleFamily, validateEmailAgainstCandidate } from "../lib/ats/role-profile";
import { findPlainTextViolations } from "../lib/email/plain-text";

const [resumePdf, ...shots] = process.argv.slice(2);
(async () => {
  const resumeText = await extractResumeText(fs.readFileSync(resumePdf), "application/pdf");
  const canonical = parseResumeToCanonical(resumeText);
  console.log("CANDIDATE:", canonical.fullName, "| experience entries:", canonical.experience.length, "| projects:", canonical.projects.length);
  const warns: string[] = [];
  const ow = console.warn; console.warn = (...a: unknown[]) => { warns.push(a.map(String).join(" ").slice(0, 300)); };
  for (const f of shots) {
    const ex = await extractFromScreenshot(fs.readFileSync(f), "image/jpeg");
    console.log(`\n##### ${f.split("_").slice(-2).join("_")}  title=${ex.jobTitle} company=${ex.companyName} incomplete=${!!ex.incompleteJobPost}`);
    if (ex.incompleteJobPost) { console.log("  -> would be skipped (flagged for review)"); continue; }
    const m = extractCompetencyMatrix([ex.jobTitle, ex.companyName, ex.jobDescription].filter(Boolean).join("\n\n"));
    warns.length = 0;
    const draft = await generateApplicationEmail({
      jobDetails: ex,
      jobProfile: { companyName: ex.companyName || "Company", targetRoleTitle: ex.jobTitle || "", targetRole: ex.jobTitle || "", recipientEmail: ex.recipientEmail || undefined, hiringManagerName: ex.contactName || undefined, primaryTechStack: m.primaryTechStack.map((r) => r.keyword), architectureAndDomainKeywords: m.architectureAndDomainKeywords.map((r) => r.keyword), targetStack: m.primaryTechStack.map((r) => r.keyword) },
      canonicalResume: canonical, resumeText, senderName: canonical.fullName, senderEmail: canonical.email,
    });
    console.log("Subject:", draft.subject, "\n" + draft.body);
    console.log("fallback/validation warnings:", warns.length ? warns : "none (first-pass LLM output accepted)");
    const body = draft.body;
    const bullets = body.split(/\r?\n/).filter((l) => /^- /.test(l));
    const family = detectRoleFamily(ex.jobTitle, ex.jobDescription);
    const viol = validateEmailAgainstCandidate({ subject: draft.subject, body, units: buildEvidenceUnits(canonical, family), evidenceText: resumeText, identity: { fullName: canonical.fullName, emails: [canonical.email].filter(Boolean) as string[], urls: [canonical.githubUrl, canonical.linkedinUrl].filter(Boolean) as string[] }, companyName: ex.companyName || undefined, roleTitle: ex.jobTitle || undefined, family });
    const norm = (t: string) => t.replace(/[\s,]/g, "").toLowerCase();
    const nums = Array.from(new Set(body.match(/\d[\d,.]*\s*(?:%|x|[KM]\+|\+)?/g) || [])).map((n) => n.trim()).filter((n) => /[%x+KM]/.test(n) || n.replace(/\D/g, "").length >= 3);
    const unsupported = nums.filter((n) => !norm(resumeText).includes(norm(n)));
    const words = body.trim().split(/\s+/).length;
    console.log(`CHECKS: words=${words} bullets=${bullets.length} leadIn=${/:\n- /.test(body)} plainTextViolations=${JSON.stringify(findPlainTextViolations(body))} validatorViolations=${JSON.stringify(viol)} numbersNotInResume=${JSON.stringify(unsupported)} greeting="${body.split("\n")[0]}" recipient=${ex.recipientEmail}`);
  }
  console.warn = ow;
})().catch((e) => { console.error(e); process.exit(1); });
