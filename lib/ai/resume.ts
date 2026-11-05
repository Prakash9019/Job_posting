import { getStorageProvider } from "@/lib/storage";

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
  targetRole: string;
  companyName: string;
  targetStack: string[];
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
  company: "Julley Online" | "Vertx";
  projectTitle: string;
  description: string;
  metric: string;
  techStack: string[];
}

const REFERENCE_ACHIEVEMENTS: ReferenceProjectAchievement[] = [
  {
    company: "Julley Online",
    projectTitle: "AI-Powered Drawing Tag Extraction Pipeline",
    description: "engineered a multi-stage AI extraction pipeline using YOLO and OCR",
    metric: "sub-10 minute blueprint extraction",
    techStack: ["Python", "OpenCV", "FastAPI", "OCR", "YOLO", "Computer Vision"],
  },
  {
    company: "Julley Online",
    projectTitle: "Drone GCS & Fleet Management Platform",
    description: "built a distributed Ground Control Station streaming real-time telemetry",
    metric: "zero telemetry packet loss",
    techStack: ["FastAPI", "React", "Python", "WebSockets", "Microservices", "Distributed Systems"],
  },
  {
    company: "Julley Online",
    projectTitle: "PMS Integration Hub",
    description: "architected a centralized integration hub connecting Zoho, Gmail, Outlook, and Naukri",
    metric: "99.9% uptime across unified workflows",
    techStack: ["Node.js", "TypeScript", "REST APIs", "Microservices", "Distributed State"],
  },
  {
    company: "Vertx",
    projectTitle: "Vertx Flow — AI Fundraising Platform",
    description: "built AI investor matching and ranking workflows",
    metric: "automated matching across 50+ workflows",
    techStack: ["React", "Node.js", "Express", "AI", "LLM", "MongoDB"],
  },
  {
    company: "Vertx",
    projectTitle: "Vertx Startin — Founder-Investor Network",
    description: "developed full-stack real-time messaging and indexing services",
    metric: "sub-second query response times",
    techStack: ["React", "Node.js", "Express", "MongoDB", "REST APIs", "System Design"],
  },
];

/**
 * Generates a concise, high-conversion ~120-word cold outreach email
 * using the structured JobTargetProfile and top 2 tailored project achievements
 * referencing verified metrics from Julley Online or Vertx.
 */
export async function generateTargetedColdEmail(params: {
  jobProfile: JobTargetProfile;
  resumeText?: string;
  candidateName?: string;
  candidateEmail?: string;
}): Promise<ColdEmailDraftResult> {
  const { jobProfile, candidateName = "Loka Surya Prakash Pentakota", candidateEmail = "plsprakash2003@gmail.com" } = params;

  // Rank candidate achievements against target stack and architecture patterns
  const allTargetTerms = [
    ...jobProfile.targetStack,
    ...(jobProfile.architecturePatterns || []),
    ...(jobProfile.domainKeywords || []),
  ].map((t) => t.toLowerCase());

  const scoredAchievements = REFERENCE_ACHIEVEMENTS.map((ach) => {
    let score = 0;
    for (const term of allTargetTerms) {
      if (ach.techStack.some((tech) => tech.toLowerCase() === term || term.includes(tech.toLowerCase()))) {
        score += 3;
      }
      if (ach.description.toLowerCase().includes(term)) {
        score += 2;
      }
    }
    return { ach, score };
  });

  scoredAchievements.sort((a, b) => b.score - a.score);
  const top2 = scoredAchievements.slice(0, 2).map((s) => s.ach);

  const matchedStack = Array.from(
    new Set(
      top2.flatMap((t) => t.techStack).filter((tech) => allTargetTerms.some((term) => term === tech.toLowerCase()))
    )
  );

  const contactGreeting = jobProfile.contactName ? `Hi ${jobProfile.contactName},` : "Hi Hiring Team,";
  const roleName = jobProfile.targetRole || "Software Engineer";
  const compName = jobProfile.companyName || "your team";

  // Build high-converting, ~120-word email
  const subject = `Application: ${roleName} - ${candidateName}`;

  const ach1 = top2[0];
  const ach2 = top2[1];

  const bodyParagraphs = [
    contactGreeting,
    `I am writing to apply for the ${roleName} role at ${compName}. With expertise building distributed systems, real-time microservices, and high-performance backends, my engineering background directly matches your target stack.`,
    `At ${ach1.company}, I ${ach1.description}, achieving ${ach1.metric}. Additionally, at ${ach2.company}, I ${ach2.description}, delivering ${ach2.metric}. Both initiatives required rigorous focus on high availability, scalable concurrency, and robust data pipelines.`,
    `I have attached my tailored resume and look forward to discussing how my experience can support ${compName}'s goals.`,
    `Best regards,\n${candidateName}\n${candidateEmail}`,
  ];

  const fullBody = bodyParagraphs.join("\n\n");
  const words = fullBody.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  return {
    subject,
    body: fullBody,
    wordCount,
    referencedProjects: top2.map((t) => `${t.company}: ${t.projectTitle}`),
    keyMetricsUsed: top2.map((t) => t.metric),
    targetStackMatched: matchedStack.length > 0 ? matchedStack : jobProfile.targetStack.slice(0, 3),
  };
}
