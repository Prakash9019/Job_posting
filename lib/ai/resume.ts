import { getStorageProvider } from "@/lib/storage";
import { sanitizeOcrText } from "@/lib/ats/hyperlinks";
import { CanonicalResume, getCandidateFilename, canonicalToPlainText, parseResumeToCanonical } from "@/lib/ats/tailor";
import {
  ROLE_PROFILES,
  detectRoleFamily,
  rankAchievementsForRole,
  scoreTextForRole,
  joinNatural,
  type RankedAchievement,
  type RoleFamily,
} from "@/lib/ats/role-profile";

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
  /** Full JD text; lets the email detect the real role family when the title is generic. */
  jobDescription?: string;
  /** Text extracted from this application's own screenshot; used to confirm the recruiter name belongs to the recipient email. */
  recipientEvidence?: string;
  /** True when hiringManagerName was already validated as this application's hiring contact (skip re-validation). */
  recipientNameVerified?: boolean;
}

export interface ColdEmailDraftResult {
  subject: string;
  body: string;
  wordCount: number;
  referencedProjects: string[];
  keyMetricsUsed: string[];
  targetStackMatched: string[];
}

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
    const bullets = [
      ...(canonicalResume.experience || []).flatMap((e) => [
        ...(e.bullets || []),
        ...((e.subheadings || []).flatMap((sub: { bullets?: string[] }) => sub.bullets || [])),
      ]),
      // Standalone projects are part of the final resume too (their bullets and metrics are valid evidence).
      ...(canonicalResume.projects || []).flatMap((p) => [...(p.bullets || []), p.techStack || ""]),
    ];
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
      ? Object.entries(skills as Record<string, string[] | string>)
          .filter(([k]) => !/^ai development tools$/i.test(k.trim())) // workflow tools are not stack skills to headline
          .map(([, v]) => v)
          .flatMap((v) => (Array.isArray(v) ? v.map(String) : String(v).split(/,\s*/)))
      : String(skills).split(/,\s*/);
  return flat.map((x) => x.trim()).filter(Boolean);
}

/**
 * Generates a concise, high-conversion ~115-word cold outreach email
 * using the structured JobTargetProfile and top 2 tailored project achievements
 * referencing verified metrics from the candidate's OWN resume only (never another candidate's data).
 * 
 * Strict structure:
 * - Subject: Application for [Target Role Title] — [Candidate Name] (no skills; see buildApplicationSubject)
 * - Paragraph 1: Address recipient at [CompanyName], state role from screenshot, align with [Top 3 Matched JD Skills]
 * - Paragraph 2: Cite the candidate's own role-relevant achievements, each tied to its own project
 * - Paragraph 3: Mention attached resume (never "tailored"/"single-page") (Resume_[Candidate_Name]_[CompanyName].pdf) and clean links
 */
/**
 * Contact identification. Decides whether a name extracted from a posting is the actual hiring contact for THIS
 * application (recruiter / hiring manager / explicitly named point of contact) and returns it for the greeting,
 * or "" (-> "Hi Hiring Team,") when no reliable hiring contact can be identified.
 *
 * Evidence, in order of strength:
 *  1. the name matches the recipient mailbox (srujana.kuralla@ -> "Srujana Kuralla");
 *  2. the extracted contact role names a hiring function (recruiter, talent, HR, hiring manager, point of contact...);
 *  3. the posting text ties this exact name to recruiting (e.g. "contact Priya Nair", "send your resume to ...").
 * A generic mailbox (hr@, careers@, jobs@...) never disqualifies a clearly identified contact. A personal-looking
 * mailbox that belongs to someone else DOES (the greeting must not address a different person than the recipient),
 * and a name that appears only as a poster/author/employee is never promoted to recruiter.
 */
const GENERIC_MAILBOX = /^(?:hr|hrd|jobs?|careers?|career|talent|recruit(?:er|ers|ing|ment)?|hiring|info|contact|admin|apply|applications?|resumes?|cv|support|team|hello|hi|office|staffing|people|work|enquir(?:y|ies)|inquir(?:y|ies)|mail|sales|connect|join|opportunities|vacancies|openings|talentacquisition|ta)(?:[._+-]?(?:team|india|global|us|uk|jobs|careers?|hr|recruitment))?$/i;
const HIRING_ROLE_RE = /recruit|talent|hiring|\bhr\b|human resources|point of contact|\bpoc\b|staffing|sourc(?:er|ing)|people (?:operations|partner|team)|acquisition/i;
const HIRING_TEXT_CUE = /recruit|talent acquisition|hiring (?:manager|team|lead|contact|partner)|\bhr\b|human resources|point of contact|\bpoc\b|contact|reach out to|send (?:your |the |a |an |updated )?(?:resume|cv|profile)|share (?:your |the |a |an |updated )?(?:resume|cv|profile)|interview|staffing|\bi(?:'m| am) (?:currently )?(?:hiring|recruiting)\b|apply (?:to|by emailing|via)|email (?:me|us)|\bdm (?:me|us)\b/i;
const POSTER_ONLY_CUE = /posted by|shared by|reposted|re-?shared|originally posted|author|liked by|commented|follows|connection/i;
const HONORIFIC_RE = /^(?:mr|mrs|ms|miss|dr|prof)\.?\s+/i;

export function resolveRecipientName(name?: string | null, email?: string | null, evidenceText?: string | null, contactRole?: string | null): string {
  const clean = String(name || "").replace(/\s+/g, " ").trim().replace(HONORIFIC_RE, "");
  if (!clean || !/^[\p{L}][\p{L} .'-]{1,60}$/u.test(clean)) return "";
  const tokens = clean.split(/[\s.]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return "";
  // A function/team label is not a person (whole-word match so names like "Shruti" are never rejected).
  if (tokens.some((t) => /^(?:team|hiring|recruiter|recruiters|recruitment|hr|talent|careers?|department|dept|staffing|support|admin|company|applicant)$/i.test(t))) return "";

  // A handle-like name ("abhishek.k") has no capitalisation of its own: present it as a proper name ("Abhishek K").
  const display = clean === clean.toLowerCase() ? tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" ") : toDisplayName(clean);
  const parts = tokens.map((t) => t.toLowerCase()).filter((p) => p.length >= 3);
  const addr = String(email || "").trim().toLowerCase();
  const localRaw = addr.includes("@") ? addr.split("@")[0] : "";
  const local = localRaw.replace(/[^a-z]/g, "");
  const nameMatchesMailbox = parts.length > 0 && parts.some((p) => local.includes(p));
  const mailboxIsGeneric = !localRaw || GENERIC_MAILBOX.test(localRaw);

  // A personal mailbox that is not this person's: the recipient is someone else, so do not greet this name.
  if (!mailboxIsGeneric && !nameMatchesMailbox) return "";
  if (nameMatchesMailbox) return display;

  if (contactRole && HIRING_ROLE_RE.test(String(contactRole))) return display;

  // Does the posting tie this exact name to recruiting/hiring (and not merely to authorship)?
  const evidence = String(evidenceText || "");
  if (evidence) {
    const lower = evidence.toLowerCase();
    const full = clean.toLowerCase();
    const needles = lower.includes(full) ? [full] : parts.slice(0, 1);
    for (const needle of needles) {
      if (needle.length < 3) continue;
      for (let from = 0, idx = lower.indexOf(needle); idx !== -1; idx = lower.indexOf(needle, from)) {
        from = idx + needle.length;
        const win = evidence.slice(Math.max(0, idx - 120), Math.min(evidence.length, idx + needle.length + 120));
        if (HIRING_TEXT_CUE.test(win)) return display;
      }
    }
  }
  return "";
}

/* ----------------------------- Subject generation ----------------------------- */

const QUOTED_RE = /["“”«`‘]([^"“”»`’‘\n]{3,160})["“”»`’]/;
const DETAIL_VERB_RE = /\b(?:mention|include|contain|quote|cite|state|specify|indicate|add|reference|mark|tag)\w*\b/i;
const ID_WORDS_RE = /\b(?:job|requisition|req|reference|ref|position|opening|vacancy|posting|jd)\s*-?\s*(?:id|code|no\.?|number|#)|\b(?:ref|req)\b\s*[:#]/i;

function extractJobId(text: string): string {
  const patterns = [
    /\b(?:job|requisition|req|reference|ref|position|opening|vacancy|posting|role|jd)[\s-]*(?:id|code|no\.?|number|#|ref(?:erence)?)\s*(?:is|:|#|=|-|–)?\s*["“`]?([A-Z0-9][A-Z0-9_\/.-]{1,30}[A-Z0-9])/gi,
    /\b(?:ref|req)\.?\s*[:#]\s*["“`]?([A-Z0-9][A-Z0-9_\/.-]{1,30}[A-Z0-9])/gi,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) if (/\d/.test(m[1])) return m[1];
  }
  return "";
}

/** Sentences/lines of the JD that talk about the application email's subject (a trailing ":" pulls in the next line). */
function subjectSegments(text: string): string[] {
  const parts = text.split(/\n+|(?<=[A-Za-z]{3}[.!?])\s+(?=[A-Z"“])/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  parts.forEach((s, i) => {
    if (!/\bsubject\b|\be-?mail (?:title|heading)\b|\bmail title\b/i.test(s)) return;
    out.push(/[:\-–—]$/.test(s) && parts[i + 1] ? `${s} ${parts[i + 1]}` : s);
  });
  return out;
}

/**
 * Employer instructions about the email subject, in any wording: an exact template (quoted, or after "subject:" /
 * "subject should be" / "use the subject ..."), and/or required details (a job ID, or phrases to mention).
 */
export function extractEmployerSubjectRequirement(jd?: string | null): { template: string; jobId: string; requiredPhrases: string[] } {
  const text = String(jd || "");
  let template = "";
  let needsId = false;
  const requiredPhrases: string[] = [];

  for (const seg of subjectSegments(text)) {
    const isDetail =
      DETAIL_VERB_RE.test(seg) &&
      (/\bin\s+(?:the\s+|your\s+)?(?:e-?mail\s+|mail\s+)?subject/i.test(seg) || /\bsubject(?:\s*line)?\b[^.\n:]{0,40}\b(?:include|contain|mention|have)/i.test(seg));
    if (isDetail) {
      if (ID_WORDS_RE.test(seg)) needsId = true;
      const q = seg.match(QUOTED_RE)?.[1]?.trim();
      if (q && !ID_WORDS_RE.test(q)) requiredPhrases.push(q);
      continue;
    }
    if (template) continue;
    const quoted = seg.match(QUOTED_RE)?.[1]?.trim();
    if (quoted) { template = quoted; continue; }
    const idx = seg.search(/\bsubject\b/i);
    const tail = seg.slice(idx).replace(/^subject/i, "");
    const m = tail.match(/^(?:[\s-]*(?:line|header|title|format))?(?:\s+(?:of|for)\s+(?:the |your )?(?:e-?mail|mail|message))?(?:\s*(?:should|must|needs? to|has to|to|will)\s*(?:be|read|look like|say|follow(?: this format)?|be in (?:the )?format))?\s*(?:format)?\s*(?:[:=]|[-–—]{1,2}|\bas\b|\bis\b|\bbe\b|\bread[s]?\b)\s*(.+)$/i);
    const cand = m?.[1]?.trim().replace(/[.\s]+$/, "").replace(/^["“”']|["“”']$/g, "").trim();
    if (cand && cand.length >= 3 && cand.length <= 160) template = cand;
  }
  const wantsId = needsId || /\b(?:job|req|ref(?:erence)?|requisition|position)\s*-?\s*(?:id|code|no|number)\b/i.test(template);
  return { template, jobId: wantsId ? extractJobId(text) : "", requiredPhrases };
}

function fillSubjectPlaceholders(template: string, v: { name: string; role: string; company: string; jobId: string }): string {
  const keyValue = (inner: string): string | null => {
    const k = inner.toLowerCase().replace(/[_*]/g, " ").replace(/\s+/g, " ").trim();
    if (/^(?:(?:your|candidate'?s?|applicant'?s?|full|first|last) )*(?:full )?name$/.test(k)) return v.name;
    if (/^(?:(?:job|position|role) )?(?:title|designation)$|^(?:position|role|post|position name|role name|job role)$/.test(k)) return v.role;
    if (/^(?:company|organi[sz]ation)(?: name)?$/.test(k)) return v.company;
    if (/^(?:(?:job|position|requisition|req|reference|ref|opening|vacancy|posting) ?(?:id|code|no\.?|number|#)?|id|ref(?:erence)?(?: ?(?:id|no|number))?)$/.test(k)) return v.jobId || null;
    return null;
  };
  const PH = /\{\{\s*([^{}]{1,40}?)\s*\}\}|\[\s*([^\[\]]{1,40}?)\s*\]|<\s*([^<>]{1,40}?)\s*>|\{\s*([^{}]{1,40}?)\s*\}|\(\s*((?:your |candidate |applicant |full )?name|job title|position|role|job id|ref(?:erence)?(?: ?(?:no|id|number))?)\s*\)/gi;
  let out = template.replace(PH, (whole, a, b, c, d, e) => {
    const val = keyValue(a ?? b ?? c ?? d ?? e ?? "");
    return val === null ? whole : val;
  });
  out = out
    .replace(/\b(?:your|candidate|applicant) (?:full )?name\b/gi, (w) => v.name || w)
    .replace(/\bfull name\b/gi, (w) => v.name || w)
    .replace(/\b(?:job|position) title\b/gi, (w) => v.role || w);
  return out.replace(/\s{2,}/g, " ").replace(/\s*[-–—|]\s*(?=[-–—|]|$)/g, "").trim();
}

/**
 * Single source of truth for the application email subject (Gemini output is overwritten with it; the
 * deterministic fallback uses it directly). Priority:
 *  1. employer's exact subject template, with only candidate/job/company/ID placeholders filled in;
 *  2. required details (job ID, mandated phrases) added to the default subject;
 *  3. "Application for <job title> — <candidate name>".
 * Candidate skills, technologies or domains are never appended.
 */
/** "" when the job title is missing or only a placeholder, so a role is never invented. */
export function knownRoleTitle(title?: string | null): string {
  const t = String(title || "").trim();
  return /^(?:job opening|role|position|the open position|unknown|n\/a|null)$/i.test(t) ? "" : t;
}

export function buildApplicationSubject(params: { roleTitle?: string | null; candidateName?: string | null; companyName?: string | null; jobDescription?: string | null }): string {
  const role = knownRoleTitle(String(params.roleTitle || "").split(/\s+[|•]\s+/)[0].replace(/\s+/g, " ").trim());
  const name = String(params.candidateName || "").trim();
  const company = String(params.companyName || "").trim();
  const req = extractEmployerSubjectRequirement(params.jobDescription);
  if (req.template) {
    // Screenshot OCR often reads a capital "I" as "l" ("Al Engineer"); the required subject must be repaired before use.
    const filled = fillSubjectPlaceholders(sanitizeOcrText(req.template), { name, role, company, jobId: req.jobId });
    if (filled) return filled;
  }
  let subject = role ? `Application for ${role}${name ? ` — ${name}` : ""}` : `Application${name ? ` — ${name}` : ""}`;
  if (req.jobId) subject += ` (${req.jobId})`;
  for (const p of req.requiredPhrases) if (!subject.toLowerCase().includes(p.toLowerCase())) subject += ` | ${p}`;
  return subject;
}

function recipientGreeting_(jobProfile: JobTargetProfile): string {
  const name = jobProfile.recipientNameVerified
    ? String(jobProfile.hiringManagerName || "").trim()
    : resolveRecipientName(jobProfile.hiringManagerName || jobProfile.contactName, jobProfile.recipientEmail || jobProfile.contactEmail, jobProfile.recipientEvidence, jobProfile.recipientTitle);
  return name ? `Hi ${name.split(" ")[0]},` : "Hi Hiring Team,";
}

function safeParseCanonical(text: string): CanonicalResume | undefined {
  try {
    return parseResumeToCanonical(text);
  } catch {
    return undefined;
  }
}

/** "LAKSHMI NARAYANA" -> "Lakshmi Narayana"; mixed-case names are left untouched. */
export function toDisplayName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  return n === n.toUpperCase() ? n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : n;
}

export async function generateTargetedColdEmail(params: {
  jobProfile: JobTargetProfile;
  canonicalResume?: CanonicalResume;
  resumeText?: string;
  candidateName?: string;
  candidateEmail?: string;
  attachmentFilename?: string;
}): Promise<ColdEmailDraftResult> {
  const { jobProfile } = params;

  // Candidate identity comes ONLY from this candidate's own resume (or the caller's account); nothing is defaulted
  // to another person's details.
  const canonicalResume = params.canonicalResume || (params.resumeText ? safeParseCanonical(params.resumeText) : undefined);
  const fullCandidateName = (canonicalResume?.fullName || params.candidateName || "").trim();
  const candidateDisplayName = fullCandidateName && fullCandidateName.toLowerCase() !== "applicant" ? toDisplayName(fullCandidateName) : "";

  const realUrl = (u?: string) => (u && !/\/applicant\/?$/i.test(u.trim()) ? u.trim() : "");
  const linkedinUrl = realUrl(canonicalResume?.linkedinUrl);
  const githubUrl = realUrl(canonicalResume?.githubUrl);

  const companyName = jobProfile.companyName?.trim() || "the hiring team";
  const targetRoleTitle =
    knownRoleTitle(jobProfile.targetRoleTitle) || knownRoleTitle(jobProfile.targetRole);

  // Compute clean attachment filename: Resume_Loka_Surya_Prakash_[CompanyName].pdf
  const attachmentFilename =
    params.attachmentFilename ||
    getCandidateFilename(params.resumeText || fullCandidateName || "", companyName);

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
  let targetSkills = intersectSkillsWithResume(cleanTargetSkills, canonicalResume, params.resumeText);
  if (targetSkills.length === 0) {
    const backfill = flattenResumeSkills(canonicalResume).slice(0, 3);
    targetSkills = backfill.length > 0 ? backfill : ["Python"];
  }

  // JD-driven positioning: the role family decides the pitch, and achievements are ranked for THAT role.
  const roleFamily: RoleFamily = detectRoleFamily(targetRoleTitle, jobProfile.jobDescription);
  const profile = ROLE_PROFILES[roleFamily];

  // Only the candidate's own resume bullets are ever used as proof; there is no shared/reference achievement list.
  const ranked: RankedAchievement[] = canonicalResume ? rankAchievementsForRole(canonicalResume, roleFamily, targetSkills, 18) : [];

  // Format: short role-specific intro, "My most relevant experience includes:" + 3-4 short bullets chosen from the
  // candidate's own evidence for THIS job, then a brief close. Not every project is listed, only the strongest.
  const BODY_WORD_LIMIT = 190;
  const wc = (t: string) => t.split(/\s+/).filter(Boolean).length;
  const intro = `I am applying for ${targetRoleTitle ? `the ${targetRoleTitle} position` : "the open position"} at ${companyName}. My background in ${profile.domain}, including ${joinNatural(targetSkills.slice(0, 3))}, maps directly to your requirements.`;
  const linkParts = [githubUrl ? `GitHub (${githubUrl})` : "", linkedinUrl ? `LinkedIn (${linkedinUrl})` : ""].filter(Boolean);
  const linkSentence = linkParts.length > 0 ? ` You can also find me on ${linkParts.join(" and ")}.` : "";
  const closing_ = `Please find the attached resume.${linkSentence} I look forward to speaking with your team.`;
  const BULLET_HEADING = "My most relevant experience includes:";
  const recipientGreeting = recipientGreeting_(jobProfile);
  const fixedWords = wc(recipientGreeting) + wc(intro) + wc(BULLET_HEADING) + wc(closing_) + wc(`Best regards, ${candidateDisplayName}`);

  // Selection: one bullet per project, strongest role/JD evidence first. Bullets whose own text proves the target
  // role are preferred; weaker ones only fill up to 3 so the recruiter always sees at least 3 points when they exist.
  const projectKey = (c: RankedAchievement) => `${c.company}|${c.project}`;
  const isPrimary = (c: RankedAchievement) => scoreTextForRole(`${c.clause} ${c.techs.join(" ")}`, roleFamily, targetSkills) > 0;
  const chosen: RankedAchievement[] = [];
  let used = fixedWords;
  const take = (pool: RankedAchievement[], max: number) => {
    for (const cand of pool) {
      if (chosen.length >= max) break;
      if (chosen.some((c) => projectKey(c) === projectKey(cand))) continue;
      const cost = wc(cand.clause) + 4;
      if (chosen.length >= 3 && used + cost > BODY_WORD_LIMIT) continue;
      chosen.push(cand);
      used += cost;
    }
  };
  take(ranked.filter(isPrimary), 4);
  if (chosen.length < 3) take(ranked, 3);

  // Subject: primary role title + candidate name only (no skills/domains); employer-mandated format honored.
  const subject = buildApplicationSubject({ roleTitle: targetRoleTitle, candidateName: candidateDisplayName, companyName: jobProfile.companyName, jobDescription: jobProfile.jobDescription });

  // Each employer is named once (first bullet that uses it); later bullets of the same employer lead with the project.
  const namedCompanies = new Set<string>();
  const bullets = chosen.map((c) => {
    const first = !namedCompanies.has(c.company);
    namedCompanies.add(c.company);
    const lead = c.standalone
      ? `In my ${c.company} project`
      : first
      ? (c.project && c.project !== c.company ? `At ${c.company} (${c.project})` : `At ${c.company}`)
      : (c.project && c.project !== c.company ? `In ${c.project}` : "In the same role");
    return `- ${lead}, I ${c.clause}.`;
  });

  const closing = `Best regards,\n${candidateDisplayName}`;
  const fullBody = [recipientGreeting, intro, `${BULLET_HEADING}\n${bullets.join("\n")}`, closing_, closing].join("\n\n");
  const wordCount = fullBody.trim().split(/\s+/).filter(Boolean).length;

  return {
    subject,
    body: fullBody,
    wordCount,
    referencedProjects: chosen.map((c) => `${c.company}${c.project ? ` / ${c.project}` : ""}: ${c.clause}`),
    keyMetricsUsed: chosen
      .map((c) => (c.clause.match(/\d+(?:\.\d+)?\s*(?:%|x\b|[KMB]\+)|\d{1,3}(?:,\d{3})+\+?/) || [""])[0])
      .filter(Boolean),
    targetStackMatched: targetSkills,
  };
}
