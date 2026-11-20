/**
 * Shared assembly + style checks for application emails (AI path and deterministic fallback).
 *
 * The model writes only the persuasive content (opening, bullets, closing line). Everything that must be exact is
 * assembled here: the verified greeting, the attachment reference, the candidate's own profile links and sign-off.
 */
import { normalizePlainTextEmail } from "@/lib/email/plain-text";

export const ATTACHMENT_SENTENCE = "Please find the attached resume.";

const GREETING_LINE_RE = /^(?:hi|hello|hey|dear|greetings|good (?:morning|afternoon|evening))\b[^\n]{0,60}[,!:]?\s*$/i;
const SIGNOFF_LINE_RE = /^(?:best(?: regards)?|kind regards|warm regards|regards|sincerely|thanks|thank you|many thanks|cheers|best wishes|yours (?:sincerely|truly))[,!.]?\s*$/i;
const ATTACHMENT_SENTENCE_RE = /[^.!?\n]*\b(?:attached|attaching|enclosed|attachment)\b[^.!?\n]*\b(?:resume|résumé|cv)\b[^.!?\n]*[.!?]?|[^.!?\n]*\b(?:resume|résumé|cv)\b[^.!?\n]*\b(?:attached|enclosed|attachment)\b[^.!?\n]*[.!?]?/gi;
const PROFILE_LINE_RE = /^(?:github|linkedin|portfolio|website|phone|email|e-mail|mobile)\s*[:|-]|(?:github\.com|linkedin\.com)\//i;

/**
 * Removes what the code assembles itself (greeting, sign-off, signature links, resume-attachment sentences) from
 * model-written content, after plain-text normalisation.
 */
export function extractEmailContent(raw: string): string {
  const lines = normalizePlainTextEmail(raw).split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length && GREETING_LINE_RE.test(lines[0].trim())) lines.shift();
  const signoff = lines.findIndex((l) => SIGNOFF_LINE_RE.test(l.trim()));
  const kept = (signoff >= 0 ? lines.slice(0, signoff) : lines).filter((l) => !PROFILE_LINE_RE.test(l.trim()));
  const text = kept
    .join("\n")
    .replace(ATTACHMENT_SENTENCE_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  return text
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SignatureInput {
  candidateName: string;
  githubUrl?: string;
  linkedinUrl?: string;
}

/** Final plain-text body: greeting, content, attachment reference, sign-off, verified links. */
export function assembleEmailBody(greetingLine: string, content: string, sig: SignatureInput): string {
  const paragraphs = content.trim().split(/\n{2,}/);
  const last = paragraphs[paragraphs.length - 1] || "";
  // The attachment reference closes the final prose paragraph; after a bullet list it gets its own line.
  if (last && !/^- /m.test(last) && /[.!?]$/.test(last.trim())) paragraphs[paragraphs.length - 1] = `${last.trim()} ${ATTACHMENT_SENTENCE}`;
  else paragraphs.push(ATTACHMENT_SENTENCE);
  const links = [sig.githubUrl ? `GitHub: ${sig.githubUrl}` : "", sig.linkedinUrl ? `LinkedIn: ${sig.linkedinUrl}` : ""].filter(Boolean);
  const signature = ["Best regards,", sig.candidateName, ...links].filter(Boolean).join("\n");
  return [greetingLine, ...paragraphs, signature].join("\n\n");
}

export const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** Generic phrases recruiters skim past; the email must sound specific instead. */
const CLICHES: Array<[RegExp, string]> = [
  [/\bI am writing to\b|\bI'm writing to\b/i, "I am writing to"],
  [/\bI am (?:confident|certain|sure)\b|\bI'm confident\b/i, "I am confident"],
  [/\bI believe\b/i, "I believe"],
  [/\b(?:perfect|strong|great|ideal|excellent) (?:fit|match|candidate)\b/i, "strong/perfect fit"],
  [/\baligns? (?:perfectly|directly|closely|well)\b/i, "aligns perfectly"],
  [/\bmaps? directly\b/i, "maps directly"],
  [/\bpassion(?:ate)?\b/i, "passionate"],
  [/\bleverag(?:e|ing)\b/i, "leverage"],
  [/\bsynerg/i, "synergy"],
  [/\besteemed\b/i, "esteemed"],
  [/\bproven track record\b/i, "proven track record"],
  [/\bresults-driven\b/i, "results-driven"],
  [/\b(?:thrilled|excited) to apply\b/i, "excited to apply"],
  [/\bmakes? me a\b/i, "makes me a ..."],
  [/\bspearhead/i, "spearheaded"],
  [/\bdirectly (?:relevant|applicable)\b/i, "directly relevant"],
  [/\bwell[- ]suited\b/i, "well-suited"],
  [/\bcaught my (?:eye|attention)\b/i, "caught my eye"],
  [/\bseamless(?:ly)?\b/i, "seamless"],
  [/\brobust\b/i, "robust"],
  [/\baligns? with my\b/i, "aligns with my experience"],
  [/\bI(?: am|'m) writing (?:regarding|about|in response)\b/i, "I'm writing regarding"],
];

const RESUME_META = /\b(?:tailored|customi[sz]ed|single-page|one-page|generated|optimi[sz]ed)\s+(?:resume|cv)\b/i;

/**
 * Style issues in model-written content. These never make a draft unsafe (accuracy is validated separately), so
 * they trigger a rewrite request but do not force the deterministic fallback.
 */
export function findStyleIssues(content: string, opts: { employers?: string[]; minWords?: number; maxWords?: number } = {}): string[] {
  const issues: string[] = [];
  const found = CLICHES.filter(([re]) => re.test(content)).map(([, label]) => label);
  if (found.length) issues.push(`replace generic phrases: ${found.join(", ")}`);
  if (RESUME_META.test(content)) issues.push("do not describe the resume as tailored/optimized/one-page");
  const words = wordCount(content);
  if (opts.minWords && words < opts.minWords) issues.push(`too short (${words} words); target ${opts.minWords}-${opts.maxWords}`);
  if (opts.maxWords && words > opts.maxWords) issues.push(`too long (${words} words); target ${opts.minWords}-${opts.maxWords}`);
  for (const employer of opts.employers || []) {
    const core = employer.replace(/\b(?:private|pvt|limited|ltd|inc|llc)\b\.?/gi, "").trim();
    if (core.length < 3) continue;
    const n = (content.match(new RegExp(core.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
    if (n > 1) issues.push(`employer "${core}" is named ${n} times; name it once`);
  }
  return issues;
}

/** "- " bullet lines of an email body. */
export function bulletLines(body: string): string[] {
  return body.split("\n").filter((l) => /^- \S/.test(l));
}
