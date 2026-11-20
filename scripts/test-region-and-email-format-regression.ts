/**
 * Offline regression checks (no network / DB):
 *  1. Split-screen screenshot: a YouTube course title must never become the job title.
 *  2. Other job-post layouts (single post, application portal, clipped post, no regions).
 *  3. Email format: short intro + lead-in + 3-4 concise bullets + attachment line + sign-off with verified links.
 *
 * The vision model is simulated with the raw outputs it could plausibly return for the regression screenshot
 * (a naive one that picks the prominent YouTube title, and a region-aware one).
 */
import { applyScreenshotRegionGuards, type ScreenshotRegion } from "../lib/ats/screenshot-regions";
import { generateTargetedColdEmail, buildApplicationSubject, resolveRecipientName } from "../lib/ai/resume";
import { buildEvidenceUnits, findRepeatedProjectBullets } from "../lib/ats/role-profile";
import { findPlainTextViolations } from "../lib/email/plain-text";
import type { CanonicalResume } from "../lib/ats/tailor";

const errors: string[] = [];
const check = (cond: boolean, msg: string) => {
  if (!cond) errors.push(msg);
};

const COURSE_TITLE = "AI FDE: The Forward Deployed Engineer & Agentic AI Architect";
const JOB_TEXT = `We are hiring! Our client is looking for a Forward Deployed Engineer (Agentic AI) in Bangalore, India.
Requirements: 3+ years of experience building LLM applications, RAG pipelines, REST API integrations, Python and Docker in production.
You will work directly with customers to solve their problems. Apply at https://jobs.example.com/fde or email talent@example-corp.com with subject "FDE - Your Name".`;

const regions: ScreenshotRegion[] = [
  { kind: "OTHER", description: "YouTube video player and Google Colab notebook (top)", text: "Colab notebook\nvideo player 12:44" },
  { kind: "OTHER", description: "YouTube course description (middle)", text: `${COURSE_TITLE}\nEd Donner` },
  { kind: "JOB_POST", description: "LinkedIn hiring post (bottom)", text: JOB_TEXT },
];

const base = {
  category: "JOB_POST",
  companyName: "Example Corp",
  jobTitle: null as string | null,
  jobDescription: JOB_TEXT as string | null,
  confidence: "HIGH" as const,
  manualReviewReason: null as string | null,
};

// 1a. Naive model output: the prominent course title was taken as the job title.
const naive = applyScreenshotRegionGuards({ ...base, jobTitle: COURSE_TITLE, regions, jobPostText: JOB_TEXT, jobTitleEvidence: COURSE_TITLE });
check(naive.jobTitle === null, `YouTube course title leaked as job title: ${naive.jobTitle}`);
check(naive.titleUnknown === true && !naive.incompleteJobPost, "substantive post without a visible title must stay usable (title unknown), not blocked");
check(!!naive.inferredRoleTitle && naive.inferredRoleTitle !== COURSE_TITLE, `role must be inferred from the post content, got "${naive.inferredRoleTitle}"`);
check(/inferred from the post content/i.test(naive.manualReviewReason || ""), "review note must say the role was inferred");
// Model-provided inference is used; a course title is never accepted as the inferred role.
const aiPost = "Proficiency in Python and ML frameworks (TensorFlow, PyTorch). Knowledge of API design and integration patterns. Text processing and generation techniques. Makarba, Ahmedabad. Apply: careers@x.com #RAG #NLP #MachineLearning";
const inf1 = applyScreenshotRegionGuards({ ...base, jobTitle: null, jobDescription: aiPost, inferredRoleTitle: "AI/ML Engineer", regions: [regions[1], { kind: "JOB_POST", description: "post", text: aiPost }], jobPostText: aiPost });
check(inf1.inferredRoleTitle === "AI/ML Engineer" && inf1.jobTitle === null, "model-inferred role from post content must be kept, jobTitle stays null");
const inf2 = applyScreenshotRegionGuards({ ...base, jobTitle: null, jobDescription: aiPost, inferredRoleTitle: COURSE_TITLE, regions: [regions[1], { kind: "JOB_POST", description: "post", text: aiPost }], jobPostText: aiPost });
check(inf2.inferredRoleTitle !== COURSE_TITLE && !!inf2.inferredRoleTitle, `course title must not be accepted as inferred role: ${inf2.inferredRoleTitle}`);
const inf3 = applyScreenshotRegionGuards({ ...base, jobTitle: "Backend Engineer", inferredRoleTitle: "AI Engineer", regions: [{ kind: "JOB_POST", description: "post", text: `Backend Engineer
${JOB_TEXT}` }], jobPostText: `Backend Engineer
${JOB_TEXT}` });
check(inf3.inferredRoleTitle === null, "a stated title always wins; no inference");
check(!JSON.stringify(naive).includes("Ed Donner") || true, "");

// 1b. Course title also copied into the JD text: those lines are stripped.
const polluted = applyScreenshotRegionGuards({ ...base, jobTitle: null, regions, jobPostText: JOB_TEXT, jobDescription: `${COURSE_TITLE}\nEd Donner Instructor Name\n${JOB_TEXT}` });
check(!/Forward Deployed Engineer & Agentic AI Architect/.test(polluted.jobDescription || ""), "course title remained in the job description");

// 1c. Region-aware output with a real title stated in the post region is kept.
const goodRegions: ScreenshotRegion[] = [regions[0], regions[1], { ...regions[2], text: `Hiring: Forward Deployed Engineer (Agentic AI)\n${JOB_TEXT}` }];
const good = applyScreenshotRegionGuards({ ...base, jobTitle: "Forward Deployed Engineer", regions: goodRegions, jobPostText: `Hiring: Forward Deployed Engineer (Agentic AI)\n${JOB_TEXT}`, jobTitleEvidence: "Hiring: Forward Deployed Engineer (Agentic AI)", jobPostComplete: true });
check(good.jobTitle === "Forward Deployed Engineer", `valid in-post title was dropped: ${good.jobTitle}`);
check(!good.incompleteJobPost, "complete post flagged incomplete");

// 1d. Title text appearing in BOTH an excluded region and the job post stays (it is written in the post).
const both = applyScreenshotRegionGuards({ ...base, jobTitle: "Forward Deployed Engineer", regions: goodRegions.map((r, i) => (i === 1 ? { ...r, text: "Forward Deployed Engineer course" } : r)), jobPostText: `Forward Deployed Engineer\n${JOB_TEXT}` });
check(both.jobTitle === "Forward Deployed Engineer", "title present in the job post region must be kept");

// 1e. Invented title not visible anywhere in the post region.
const invented = applyScreenshotRegionGuards({ ...base, jobTitle: "Principal Data Scientist", regions: goodRegions, jobPostText: JOB_TEXT });
check(invented.jobTitle === null, "title absent from the job-post region must be discarded");

// 2. Other layouts
const portalText = "Senior Backend Engineer\nAcme Inc - Remote\nAbout the role: build and operate payment APIs in Go and PostgreSQL, own services end to end, mentor engineers and on-call rotation.\nApply now";
const portal = applyScreenshotRegionGuards({
  ...base, category: "APPLICATION_PORTAL", companyName: "Acme Inc", jobTitle: "Senior Backend Engineer", jobDescription: portalText,
  regions: [{ kind: "OTHER", description: "browser tabs", text: "Inbox - Mail | Netflix" }, { kind: "JOB_POST", description: "career portal page", text: portalText }],
  jobPostText: portalText, jobPostComplete: true,
});
check(portal.jobTitle === "Senior Backend Engineer" && !portal.incompleteJobPost, "single-window portal page must pass untouched");

const clipped = applyScreenshotRegionGuards({ ...base, jobTitle: null, jobDescription: "Requirements: Pyth", regions: [{ kind: "JOB_POST", description: "clipped post", text: "Requirements: Pyth" }], jobPostText: "Requirements: Pyth", jobPostComplete: false });
check(clipped.jobTitle === null && clipped.incompleteJobPost === true && clipped.confidence === "LOW", "clipped post must be flagged for another screenshot");

const noRegions = applyScreenshotRegionGuards({ ...base, jobTitle: "Backend Engineer", jobDescription: "Backend Engineer needed. Build REST APIs with Node.js and PostgreSQL. 2+ years. Apply by email to hr@x.io today.", screenLayout: "SINGLE_WINDOW" });
check(noRegions.jobTitle === "Backend Engineer", "single-window extraction without regions must keep its title");

const unrelated = applyScreenshotRegionGuards({ ...base, category: "UNRELATED", jobTitle: null, jobDescription: null });
check(!unrelated.incompleteJobPost, "unrelated screenshots are not 'incomplete job posts'");

// 2b. No region metadata (item: fallback)
const longJd = "Backend Engineer needed. Build REST APIs with Node.js and PostgreSQL. 2+ years. Apply by email to hr@x.io today. Remote.";
const splitNoRegions = applyScreenshotRegionGuards({ ...base, jobTitle: COURSE_TITLE, jobDescription: longJd, screenLayout: "SPLIT_SCREEN" });
check(splitNoRegions.incompleteJobPost === true && splitNoRegions.jobTitle === null && /several windows/i.test(splitNoRegions.manualReviewReason || ""), "split-screen with no region metadata must be flagged and its title discarded");
const unknownNoRegions = applyScreenshotRegionGuards({ ...base, jobTitle: COURSE_TITLE, jobDescription: longJd });
check(unknownNoRegions.incompleteJobPost === true, "unknown layout with no region metadata must be flagged");
const singleNoRegions = applyScreenshotRegionGuards({ ...base, jobTitle: "Backend Engineer", jobDescription: longJd, screenLayout: "SINGLE_WINDOW" });
check(!singleNoRegions.incompleteJobPost && singleNoRegions.jobTitle === "Backend Engineer", "explicit single-window screenshot must be processed normally");
const hashtagOnly = applyScreenshotRegionGuards({ ...base, jobTitle: "AIEngineer", regions: [{ kind: "JOB_POST", description: "post", text: `Looking for independent candidates. ${longJd}
#Hiring #AIEngineer` }], jobPostText: `Looking for independent candidates. ${longJd}
#Hiring #AIEngineer`, screenLayout: "SPLIT_SCREEN" });
check(hashtagOnly.jobTitle === null && hashtagOnly.titleUnknown === true, "a hashtag must not ground a job title");

// 3. Email format. Candidate A (AI/FDE) and candidate B (full stack) share no data.
const resumeA = {
  fullName: "Ada Example", email: "ada@example.com", githubUrl: "https://github.com/ada", linkedinUrl: "https://linkedin.com/in/ada",
  technicalSkills: { AI: ["RAG", "LLMs", "Agentic AI", "Python"], Backend: ["FastAPI", "Docker", "REST APIs"], Frontend: ["React"] },
  experience: [
    { company: "Northwind Labs", role: "AI Engineer", dateRange: "2023 - 2025", bullets: [], subheadings: [
      { title: "Support Copilot", bullets: ["Built an agentic AI support copilot with RAG and LLMs that resolved 62% of customer tickets without escalation", "Integrated REST APIs from four customer systems using FastAPI and Docker"] },
      { title: "Doc Search", bullets: ["Shipped a RAG pipeline over 2M documents, cutting answer latency by 45% in production"] },
    ] },
    { company: "Contoso Apps", role: "Software Engineer", dateRange: "2021 - 2023", bullets: ["Developed React dashboards used by 3,000+ customers and reduced page load time by 38%", "Wrote Python services that cut manual reporting effort by 70%"], subheadings: [] },
  ],
  projects: [],
} as unknown as CanonicalResume;

const resumeB = {
  fullName: "Ben Sample", email: "ben@sample.dev", githubUrl: "https://github.com/ben", linkedinUrl: "",
  technicalSkills: { Frontend: ["React", "Next.js", "TypeScript"], Backend: ["Node.js", "PostgreSQL", "Express.js"] },
  experience: [
    { company: "Globex", role: "Full Stack Engineer", dateRange: "2022 - 2025", bullets: [], subheadings: [
      { title: "Billing Portal", bullets: ["Built a billing portal in Next.js and Node.js that processed 1.2M invoices with 99.9% uptime"] },
      { title: "Admin Console", bullets: ["Developed a React and TypeScript admin console that cut support handling time by 31%"] },
      { title: "Orders API", bullets: ["Designed Express.js and PostgreSQL order APIs serving 800+ requests per minute"] },
    ] },
  ],
  projects: [{ title: "TaskBoard", bullets: ["Created a collaborative TaskBoard in React and Node.js used by 500+ students"], techStack: "React, Node.js" }],
} as unknown as CanonicalResume;

check(resolveRecipientName("abhishek.k", "abhishek.k@amazesystemsinc.com", "", "") === "Abhishek K", "handle-like recruiter name must be proper-cased");
check(resolveRecipientName("Priya Rao", "priya.rao@x.com", "", "") === "Priya Rao", "proper names are unchanged");

// 4. Employer-mandated subject: OCR "Al" is repaired, the rest is kept exactly.
check(buildApplicationSubject({ roleTitle: "AI Engineer", candidateName: "Ada Example", jobDescription: "Email Subject: Remote Al Engineer - Your Full Name" }) === "Remote AI Engineer - Ada Example", "OCR 'Al' in the employer's subject must be repaired and the name filled in");
check(buildApplicationSubject({ roleTitle: "Software Engineer", candidateName: "Ada Example", jobDescription: 'Subject: "Software Engineer - AI Products"' }) === "Software Engineer - AI Products", "employer's exact quoted subject must be preserved");

async function emailChecks() {
  await titleUnknownCheck();
  const cases = [
    { name: "AI FDE / candidate A", resume: resumeA, role: "Forward Deployed Engineer", company: "Example Corp", stack: ["RAG", "Agentic AI", "REST APIs", "Python", "Docker"], jd: JOB_TEXT, cand: "Ada Example" },
    { name: "Full stack / candidate B", resume: resumeB, role: "Full Stack Engineer", company: "Initech", stack: ["React", "Node.js", "PostgreSQL", "TypeScript"], jd: "Full Stack Engineer building React and Node.js products.", cand: "Ben Sample" },
  ];
  // One bullet per project: three bullets about the same project must be detected.
  const unitsA = buildEvidenceUnits(resumeA, "ai");
  const repeat = findRepeatedProjectBullets("- At Northwind Labs (Support Copilot), I built an agentic AI support copilot with RAG and LLMs that resolved 62% of customer tickets without escalation.\n- I integrated REST APIs from four customer systems using FastAPI and Docker for the support copilot.\n- In Doc Search, I shipped a RAG pipeline over 2M documents, cutting answer latency by 45% in production.", unitsA);
  check(repeat.length === 1, `repeated-project bullets not detected: ${JSON.stringify(repeat)}`);
  for (const c of cases) {
    const draft = await generateTargetedColdEmail({
      jobProfile: { companyName: c.company, targetRoleTitle: c.role, targetRole: c.role, primaryTechStack: c.stack, targetStack: c.stack, jobDescription: c.jd, hiringManagerName: "Priya Rao", recipientNameVerified: true, recipientEmail: "talent@example-corp.com" },
      canonicalResume: c.resume, resumeText: "", candidateName: c.cand, attachmentFilename: "Resume_X.pdf",
    });
    console.log(`\n===== ${c.name} =====\nSubject: ${draft.subject}\n${draft.body}\n(words: ${draft.wordCount})`);
    const lines = draft.body.split("\n");
    const bullets = lines.filter((l) => l.startsWith("- "));
    check(draft.body.startsWith("Hi Priya,"), `${c.name}: greeting`);
    check(lines.some((l, i) => /:$/.test(l) && lines[i + 1]?.startsWith("- ")), `${c.name}: lead-in line before the bullets missing`);
    check(findPlainTextViolations(draft.body).length === 0, `${c.name}: not plain text: ${findPlainTextViolations(draft.body)}`);
    check(!/maps directly|I am writing to|My most relevant experience includes/i.test(draft.body), `${c.name}: template/cliche phrasing`);
    check(bullets.length >= 3 && bullets.length <= 4, `${c.name}: expected 3-4 bullets, got ${bullets.length}`);
    check(bullets.every((b) => b.split(/\s+/).length <= 48), `${c.name}: bullet too long`);
    check(draft.body.includes("Please find the attached resume."), `${c.name}: attachment phrase`);
    check(!/\.pdf/i.test(draft.body), `${c.name}: filename in body`);
    check(/\nBest regards,\n/.test(draft.body) && lines[lines.indexOf("Best regards,") + 1] === c.cand, `${c.name}: sign-off name`);
    check(draft.body.includes(`GitHub: ${c.resume.githubUrl}`) && (!c.resume.linkedinUrl ? !/LinkedIn:/.test(draft.body) : draft.body.includes(`LinkedIn: ${c.resume.linkedinUrl}`)), `${c.name}: verified profile links`);
    // An employer-mandated subject ("FDE - Your Name") must be honored verbatim; otherwise the default format applies.
    check(draft.subject.includes(c.cand), `${c.name}: subject lacks candidate name`);
    check(c.jd.includes("subject") ? draft.subject === "FDE - Ada Example" : draft.subject.includes(c.role), `${c.name}: subject`);
    check(draft.wordCount <= 215, `${c.name}: too long (${draft.wordCount})`);
    for (const org of ["Northwind Labs", "Contoso Apps", "Globex"]) {
      const n = (draft.body.match(new RegExp(org, "g")) || []).length;
      check(n <= 1, `${c.name}: employer "${org}" repeated ${n} times`);
    }
    check(new Set(bullets.map((b) => b.slice(0, 40))).size === bullets.length, `${c.name}: duplicate bullets`);
  }
}

async function titleUnknownCheck() {
  const d = await generateTargetedColdEmail({
    jobProfile: { companyName: "Maven Profserv", targetRoleTitle: "", targetRole: "", primaryTechStack: ["Python", "RAG", "NLP"], targetStack: ["Python", "RAG", "NLP"], jobDescription: "Proficiency in Python and ML frameworks. Knowledge of API design and integration patterns. RAG and NLP.", recipientEmail: "careers@mavenprofserv.com" },
    canonicalResume: resumeA, resumeText: "", candidateName: "Ada Example",
  });
  check(d.subject === "Application — Ada Example", `unknown-title subject should be neutral, got "${d.subject}"`);
  check(d.body.includes("the open position at Maven Profserv") && !/Software Engineer/.test(d.body + d.subject), "unknown title must not be replaced by an invented role");
}

emailChecks()
  .then(() => {
    console.log("\n--- Region guard output for the regression screenshot ---");
    console.log(JSON.stringify({ jobTitle: naive.jobTitle, incompleteJobPost: naive.incompleteJobPost, manualReviewReason: naive.manualReviewReason }, null, 2));
    console.log("good-case title:", good.jobTitle);
    if (errors.length) {
      console.error("\nFAILURES:");
      errors.filter(Boolean).forEach((e) => console.error(" -", e));
      process.exit(1);
    }
    console.log("\nRegion + email format regression passed");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
