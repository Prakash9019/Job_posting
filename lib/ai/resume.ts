import { getStorageProvider } from "@/lib/storage";
import { CanonicalResume, getCandidateFilename, canonicalToPlainText } from "@/lib/ats/tailor";

// Polyfill browser canvas / DOM primitives required by pdfjs-dist in headless serverless environments (Node.js / Vercel)
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as unknown as Record<string, unknown>).DOMMatrix = class DOMMatrix {};
}
if (typeof globalThis.Path2D === "undefined") {
  (globalThis as unknown as Record<string, unknown>).Path2D = class Path2D {};
}
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as unknown as Record<string, unknown>).ImageData = class ImageData {};
}

export function isReadableResumeText(text: string): boolean {
  return text.trim().length >= 50 && !/%PDF-|\b\d+\s+\d+\s+obj\b|\/FlateDecode|startxref/.test(text);
}

async function transcribePdfWithGemini(buffer: Buffer): Promise<string> {
  try {
    const { transcribeDocumentWithAI } = await import("@/lib/ats/parse");
    return await transcribeDocumentWithAI(buffer, "application/pdf", false);
  } catch (err) {
    console.warn("Gemini PDF transcription fallback error:", err);
    return "";
  }
}

/** Fail explicitly rather than treating PDF internals as candidate evidence. */
export async function extractResumeText(buffer: Buffer, mimeType?: string): Promise<string> {
  let text = "";
  const safeMime = (
    mimeType ||
    (buffer.slice(0, 5).toString() === "%PDF-" ? "application/pdf" : "text/plain")
  ).toLowerCase();

  const isImage = safeMime.startsWith("image/") || /\.(png|jpe?g|webp|heic)$/i.test(safeMime);

  if (safeMime === "text/plain" || safeMime === "text/markdown" || safeMime.includes("tex") || safeMime === "application/x-tex") {
    text = buffer.toString("utf-8");
  } else if (safeMime === "application/pdf" || safeMime.includes("pdf")) {
    try {
      // Dynamic import ensures pdf-parse is only loaded when actively processing a PDF
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        // Extract text while preserving embedded link annotations as markdown [Text](URL)
        text = (await parser.getText({ parseHyperlinks: true })).text || "";
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch (parseError) {
      console.warn("pdf-parse extraction failed, attempting AI transcription fallback:", parseError);
      // Fallback: Use Gemini AI to extract text from the PDF directly with hyperlink preservation
      text = await transcribePdfWithGemini(buffer);
      if (!text) {
        throw new Error("Could not read this PDF resume. Upload a readable, text-based PDF or plain text resume.", { cause: parseError });
      }
    }
  } else if (isImage) {
    const { transcribeDocumentWithAI } = await import("@/lib/ats/parse");
    text = await transcribeDocumentWithAI(buffer, safeMime, false);
  } else {
    throw new Error("Unsupported resume format. Upload a PDF, LaTeX (.tex), photo/image, or plain text resume.");
  }

  // If text is still empty or unreadable, try Gemini fallback before erroring
  if (!isReadableResumeText(text) && (safeMime === "application/pdf" || safeMime.includes("pdf") || isImage)) {
    const aiText = isImage
      ? await (await import("@/lib/ats/parse")).transcribeDocumentWithAI(buffer, safeMime, false)
      : await transcribePdfWithGemini(buffer);
    if (isReadableResumeText(aiText)) {
      text = aiText;
    }
  }

  if (!isReadableResumeText(text)) {
    throw new Error("No readable resume text found. For scanned PDFs, upload a text-based PDF or plain text resume.");
  }
  return text.trim();
}

/** Re-read old uploads or refresh PDFs to guarantee hyperlinks are captured. */
export async function getReadableResumeText(resume: { extractedText: string; filePath: string; mimeType: string }): Promise<string> {
  if (
    isReadableResumeText(resume.extractedText) &&
    (resume.extractedText.includes("](") || !resume.filePath || !resume.mimeType.toLowerCase().includes("pdf"))
  ) {
    return resume.extractedText;
  }
  if (resume.filePath) {
    try {
      const fileBuf = await getStorageProvider().readFile(resume.filePath);
      const freshText = await extractResumeText(fileBuf, resume.mimeType);
      if (isReadableResumeText(freshText)) {
        return freshText;
      }
    } catch (err) {
      console.warn("getReadableResumeText failed to re-extract from storage, using cached text:", err);
    }
  }
  return resume.extractedText;
}

export interface JobTargetProfile {
  companyName: string;
  targetRoleTitle?: string;
  recipientEmail?: string;
  hiringManagerName?: string;
  primaryTechStack?: string[];
  architectureAndDomainKeywords?: string[];
  // Backwards compatibility aliases
  targetRole?: string;
  targetStack?: string[];
  architecturePatterns?: string[];
  domainKeywords?: string[];
  contactName?: string;
  contactEmail?: string;
  recipientTitle?: string;
}

export interface ColdEmailDraftResult {
  subject: string;
  body: string;
  wordCount: number;
  referencedProjects: string[];
  keyMetricsUsed: string[];
  targetStackMatched: string[];
}

interface ReferenceProjectAchievement {
  company: "Julley Online Private Limited" | "Vertx";
  projectTitle: string;
  description: string;
  metric: string;
  techStack: string[];
}

const REFERENCE_ACHIEVEMENTS: ReferenceProjectAchievement[] = [
  {
    company: "Julley Online Private Limited",
    projectTitle: "AI-Powered Drawing Tag Extraction Pipeline",
    description: "spearheaded an Artificial Intelligence pipeline in Python combining YOLO and SAHI to extract equipment tags",
    metric: "increasing accuracy by 38%",
    techStack: ["Python", "Artificial Intelligence", "FastAPI", "OCR", "YOLO", "Computer Vision", "AI"],
  },
  {
    company: "Julley Online Private Limited",
    projectTitle: "Drone GCS & Fleet Management Platform",
    description: "engineered a distributed Ground Control Station using Python and FastAPI",
    metric: "boosting query execution efficiency by 35% across 500K+ records",
    techStack: ["Python", "FastAPI", "React", "ZeroMQ", "Distributed Systems", "WebSockets"],
  },
  {
    company: "Julley Online Private Limited",
    projectTitle: "PMS Integration Hub",
    description: "architected a centralized integration hub using microservices and adapter patterns",
    metric: "cutting development time by 42% with 99.9% uptime SLA",
    techStack: ["Node.js", "TypeScript", "REST APIs", "Microservices", "Distributed Systems"],
  },
  {
    company: "Julley Online Private Limited",
    projectTitle: "Telemetry & State Pipeline",
    description: "designed a ZeroMQ telemetry pipeline containerized with Docker",
    metric: "achieving 99.9% uptime SLA",
    techStack: ["Docker", "ZeroMQ", "FastAPI", "Python", "Microservices"],
  },
  {
    company: "Vertx",
    projectTitle: "Vertx Startin — Founder-Investor Network",
    description: "launched a full-stack founder-investor platform using React and Node.js",
    metric: "improving discovery accuracy by 42% for 1,000+ daily active users",
    techStack: ["React", "Node.js", "Express", "MongoDB", "Full-Stack", "System Design"],
  },
  {
    company: "Vertx",
    projectTitle: "Vertx Flow — AI Fundraising Platform",
    description: "built AI investor matching and ranking workflows",
    metric: "improving match quality by 42% while cutting review time",
    techStack: ["AI", "Artificial Intelligence", "LLM", "React", "Node.js", "MongoDB"],
  },
];

export function skillAppearsVerbatim(text: string, skill: string): boolean {
  const escaped = [...skill.trim()].map((c) => (/[a-z0-9 ]/i.test(c) ? c : "\\" + c)).join("");
  return new RegExp("(^|[^a-z0-9+#.])" + escaped + "(?=$|[^a-z0-9+#.])", "i").test(text);
}

/** Skills a cold email may claim = JD target skills that are verbatim on the FINAL tailored resume. */
export function getVerifiedResumeText(canonicalResume?: CanonicalResume, resumeText?: string): string {
  if (canonicalResume) {
    const skills = canonicalResume.technicalSkills;
    const skillText = Array.isArray(skills)
      ? skills.join(", ")
      : skills && typeof skills === "object"
        ? Object.values(skills as Record<string, string[] | string>).map((v) => (Array.isArray(v) ? v.join(", ") : String(v))).join(", ")
        : String(skills || "");
    const bullets = (canonicalResume.experience || []).flatMap((e) => [
      ...(e.bullets || []),
      ...((e.subheadings || []).flatMap((sub: { bullets?: string[] }) => sub.bullets || [])),
    ]);
    return `${skillText}\n${bullets.join("\n")}`;
  }
  return resumeText || "";
}

/**
 * Intersection Rule: email skills = JobTargetProfile skills ∩ skills actually present in the final tailored
 * resume (skills + experience). Never claims a language/framework (e.g. C#, .NET) the resume omits.
 * When neither a canonical resume nor resume text is available, nothing can be verified, so the list is returned as-is.
 */
export function intersectSkillsWithResume(
  targetSkills: string[],
  canonicalResume?: CanonicalResume,
  resumeText?: string
): string[] {
  const evidence = getVerifiedResumeText(canonicalResume, resumeText);
  if (!evidence.trim()) return targetSkills;
  return targetSkills.filter((sk) => skillAppearsVerbatim(evidence, sk));
}

/** Skills on the resume (flattened Technical Skills) used to backfill when the JD overlap is thin. */
function flattenResumeSkills(canonicalResume?: CanonicalResume): string[] {
  const skills = canonicalResume?.technicalSkills;
  if (!skills) return [];
  const flat = Array.isArray(skills)
    ? skills.map(String)
    : typeof skills === "object"
      ? Object.values(skills as Record<string, string[] | string>).flatMap((v) => (Array.isArray(v) ? v.map(String) : String(v).split(/,\s*/)))
      : String(skills).split(/,\s*/);
  return flat.map((x) => x.trim()).filter(Boolean);
}

/**
 * Generates a concise, high-conversion ~115-word cold outreach email
 * using the structured JobTargetProfile and top 2 tailored project achievements
 * referencing verified metrics from Julley Online Private Limited or Vertx.
 * 
 * Strict structure:
 * - Subject: Application for [Target Role Title] — Loka Surya Prakash | [Top 2 Matched JD Skills]
 * - Paragraph 1: Address recipient at [CompanyName], state role from screenshot, align with [Top 3 Matched JD Skills]
 * - Paragraph 2: Cite 2 specific, quantified engineering achievements from Julley Online Private Limited and Vertx
 * - Paragraph 3: Mention attached resume (never "tailored"/"single-page") (Resume_Loka_Surya_Prakash_[CompanyName].pdf) and clean links
 */
export async function generateTargetedColdEmail(params: {
  jobProfile: JobTargetProfile;
  canonicalResume?: CanonicalResume;
  resumeText?: string;
  candidateName?: string;
  candidateEmail?: string;
  attachmentFilename?: string;
}): Promise<ColdEmailDraftResult> {
  const { jobProfile } = params;

  // Resolve candidate details from canonical profile or params
  const fullCandidateName =
    params.canonicalResume?.fullName || params.candidateName || "Loka Surya Prakash Pentakota";
  const candidateDisplayName = fullCandidateName.includes("Pentakota")
    ? "Loka Surya Prakash"
    : fullCandidateName;

  const candidateEmail =
    params.canonicalResume?.email || params.candidateEmail || "plsprakash2003@gmail.com";
  const linkedinUrl =
    params.canonicalResume?.linkedinUrl || "https://linkedin.com/in/applicant";
  const githubUrl =
    params.canonicalResume?.githubUrl || "https://github.com/applicant";

  const companyName = jobProfile.companyName?.trim() || "the hiring team";
  const targetRoleTitle =
    jobProfile.targetRoleTitle?.trim() || jobProfile.targetRole?.trim() || "Software Engineer";

  // Compute clean attachment filename: Resume_Loka_Surya_Prakash_[CompanyName].pdf
  const attachmentFilename =
    params.attachmentFilename ||
    getCandidateFilename(params.resumeText || fullCandidateName, companyName);

  // Combine target skills from jobProfile
  const rawSkills = [
    ...(jobProfile.primaryTechStack || jobProfile.targetStack || []),
    ...(jobProfile.architectureAndDomainKeywords || jobProfile.architecturePatterns || jobProfile.domainKeywords || []),
  ].filter(Boolean);

  const cleanTargetSkills: string[] = [];
  const seenSkillNorm = new Set<string>();
  for (const s of rawSkills) {
    const trimmed = s.trim();
    const lower = trimmed.toLowerCase();
    if (!seenSkillNorm.has(lower) && !/^(software|engineer|developer|experience|years|team)$/i.test(lower)) {
      seenSkillNorm.add(lower);
      cleanTargetSkills.push(trimmed);
    }
  }

  // INTERSECTION RULE: only claim JD skills that are really on the final tailored resume
  let targetSkills = intersectSkillsWithResume(cleanTargetSkills, params.canonicalResume, params.resumeText);
  if (targetSkills.length === 0) {
    const backfill = flattenResumeSkills(params.canonicalResume).slice(0, 3);
    targetSkills = backfill.length > 0 ? backfill : ["Python"];
  }

  // Top 2 skills for Subject Line
  const top2Skills = targetSkills.slice(0, 2);

  // Top 3 skills for Paragraph 1
  const top3Skills = targetSkills.slice(0, 3);
  let top3Formatted = "";
  if (top3Skills.length === 1) {
    top3Formatted = top3Skills[0];
  } else if (top3Skills.length === 2) {
    top3Formatted = `${top3Skills[0]} and ${top3Skills[1]}`;
  } else {
    top3Formatted = `${top3Skills[0]}, ${top3Skills[1]}, and ${top3Skills[2]}`;
  }

  // Rank candidate achievements against target skills
  const lowerTargetTerms = targetSkills.map((t) => t.toLowerCase());

  const julleyAchList = REFERENCE_ACHIEVEMENTS.filter((a) => a.company === "Julley Online Private Limited");
  const vertxAchList = REFERENCE_ACHIEVEMENTS.filter((a) => a.company === "Vertx");

  function scoreAch(ach: ReferenceProjectAchievement): number {
    let score = 0;
    for (const term of lowerTargetTerms) {
      if (ach.techStack.some((tech) => tech.toLowerCase() === term || term.includes(tech.toLowerCase()))) {
        score += 3;
      }
      if (ach.description.toLowerCase().includes(term)) {
        score += 2;
      }
    }
    return score;
  }

  julleyAchList.sort((a, b) => scoreAch(b) - scoreAch(a));
  vertxAchList.sort((a, b) => scoreAch(b) - scoreAch(a));

  const ach1 = julleyAchList[0];
  const ach2 = vertxAchList[0];

  const matchedStack = Array.from(
    new Set(
      [...ach1.techStack, ...ach2.techStack].filter((tech) =>
        lowerTargetTerms.some((term) => term === tech.toLowerCase())
      )
    )
  ).filter((tech) => targetSkills.some((t) => t.toLowerCase() === tech.toLowerCase()));

  const recipientGreeting =
    jobProfile.hiringManagerName || jobProfile.contactName
      ? `Hi ${jobProfile.hiringManagerName || jobProfile.contactName},`
      : "Hi Hiring Team,";

  // Build subject line: Application for [Target Role Title] — Loka Surya Prakash | [Top 2 Matched JD Skills]
  const subject = `Application for ${targetRoleTitle} — ${candidateDisplayName} | ${top2Skills.join(", ")}`;

  // Paragraph 1: The Hook & JD Alignment (28 words)
  const p1 = `I am applying for the ${targetRoleTitle} position at ${companyName}. With proven engineering expertise across ${top3Formatted}, my background building scalable production systems directly matches your technical requirements.`;

  // Paragraph 2: Concrete Proof from Experience — The "Twice Rule" in Email (42 words)
  const p2 = `At Julley Online Private Limited, I ${ach1.description}, ${ach1.metric}. Additionally, at Vertx, I ${ach2.description}, ${ach2.metric}. Both platforms required rigorous focus on high availability, low latency, and robust data pipelines.`;

  // Paragraph 3: CTA & Links (37 words)
  const p3 = `Please find my resume attached (${attachmentFilename}) for your review. You can also explore my open-source work on GitHub (${githubUrl}) and connect on LinkedIn (${linkedinUrl}). I look forward to speaking with your team.`;

  // Closing: Clean Sign-off (5 words)
  const closing = `Best regards,\n${candidateDisplayName}`;

  const bodyParagraphs = [recipientGreeting, p1, p2, p3, closing];
  const fullBody = bodyParagraphs.join("\n\n");
  const words = fullBody.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  return {
    subject,
    body: fullBody,
    wordCount,
    referencedProjects: [
      `${ach1.company}: ${ach1.projectTitle}`,
      `${ach2.company}: ${ach2.projectTitle}`,
    ],
    keyMetricsUsed: [ach1.metric, ach2.metric],
    targetStackMatched: targetSkills,
  };
}
