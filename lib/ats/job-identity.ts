/**
 * Deterministic job-identity normalisation shared by the screenshot / text extractors.
 *
 * Fixes the classic LinkedIn failure mode:
 *   "Hiring: AI Engineer - Agentic AI | 100% Remote (Canada) ... paige.millington@vaco.com"
 * where "Agentic AI" (a specialisation / track) was mistaken for the company name.
 *
 * Rules:
 *  - Text after a separator in "[Role] - [Track]" that is a technical term is NOT a company; the role
 *    becomes the left side and the track is recorded as a specialization (feeds the tech-stack keywords).
 *  - If no explicit company is known, derive it from the recipient email domain
 *    (paige.millington@vaco.com -> "Vaco"), unless the domain is a generic mail provider.
 */

export const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "yahoo.co.in", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "rediffmail.com", "gmx.com", "mail.com",
]);

const TECH_TRACK_WORDS = new Set([
  "agentic", "ai", "ml", "genai", "gen", "generative", "machine", "learning", "deep", "data", "science",
  "engineering", "analytics", "full", "stack", "fullstack", "front", "frontend", "back", "backend", "end",
  "cloud", "devops", "mlops", "llmops", "llm", "llms", "nlp", "computer", "vision", "security", "cyber",
  "mobile", "web", "embedded", "platform", "infrastructure", "sre", "qa", "software", "and", "&", "/",
  "remote", "hybrid", "onsite", "on-site", "contract", "full-time", "part-time", "time", "part",
  "python", "java", "javascript", "typescript", "react", "node", "nodejs", "golang", "go", "rust", "sql",
  "aws", "azure", "gcp", ".net", "dotnet", "c++", "c#", "rag",
]);

/** True when the phrase is purely technical / work-mode vocabulary (e.g. "Agentic AI", "Full Stack"). */
export function isTechTrackTerm(phrase: string | null | undefined): boolean {
  if (!phrase) return false;
  const cleaned = phrase.trim().replace(/[()]/g, " ");
  if (!cleaned) return false;
  const words = cleaned.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  return words.every((w) => TECH_TRACK_WORDS.has(w) || TECH_TRACK_WORDS.has(w.replace(/[^a-z0-9+#.&/-]/g, "")));
}

const LOCATION_OR_MODE_PART = /(?:\bremote\b|\bhybrid\b|\bon-?site\b|\d+\s*%|\(.*\)|\bcontract\b|\bfull[\s-]?time\b|\bpart[\s-]?time\b)/i;

const KNOWN_BRAND_CASING: Record<string, string> = {
  ibm: "IBM", sap: "SAP", hp: "HP", kpmg: "KPMG", pwc: "PwC", ey: "EY", tcs: "TCS", lg: "LG", ge: "GE",
};

/** "vaco.com" -> "Vaco", "mail.acme-corp.co.uk" -> "Acme Corp". Returns null for generic providers. */
export function companyFromEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/[>\s,;.]+$/, "");
  if (!domain || !domain.includes(".")) return null;
  if (GENERIC_EMAIL_DOMAINS.has(domain)) return null;
  const labels = domain.split(".");
  const secondLevel = ["co", "com", "org", "net", "ac", "gov", "edu"];
  const base =
    labels.length >= 3 && secondLevel.includes(labels[labels.length - 2])
      ? labels[labels.length - 3]
      : labels[labels.length - 2];
  if (!base || GENERIC_EMAIL_DOMAINS.has(`${base}.com`)) return null;
  if (KNOWN_BRAND_CASING[base]) return KNOWN_BRAND_CASING[base];
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface JobIdentityInput {
  companyName?: string | null;
  jobTitle?: string | null;
  recipientEmail?: string | null;
  /** Raw post text / job description / evidence text, used only as a fallback source. */
  sourceText?: string | null;
}

export interface JobIdentityResult {
  companyName: string | null;
  jobTitle: string | null;
  recipientEmail: string | null;
  specializations: string[];
  companySource: "explicit" | "title" | "email-domain" | "none";
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function stripDecor(s: string): string {
  return s
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/^(?:we(?:'|’)?re\s+)?(?:now\s+)?(?:hiring|job opening|opening|vacancy|position|role)\s*[:\-–—]\s*/i, "")
    .replace(/[^\p{L}\p{N})+#]+$/u, "")
    .trim();
}

export function normalizeJobIdentity(input: JobIdentityInput): JobIdentityResult {
  const specs: string[] = [];
  const addSpec = (s: string) => {
    const t = s.trim();
    if (t && !specs.some((x) => x.toLowerCase() === t.toLowerCase())) specs.push(t);
  };

  let company = input.companyName?.trim() || null;
  let companySource: JobIdentityResult["companySource"] = company ? "explicit" : "none";
  let title = input.jobTitle?.trim() || null;
  let email = input.recipientEmail?.trim() || null;
  const source = input.sourceText || "";

  // Fallbacks from raw text when the model returned nothing
  if (!email) {
    const m = source.match(EMAIL_RE);
    if (m) email = m[0];
  }
  if (!title) {
    const m = source.match(/hiring\s*[:\-–—]\s*([^\n]+)/i);
    if (m) title = m[1].trim();
  }

  // 1. Split "[Role] - [Track] | [Work mode]" on spaced separators only (keeps "Full-Stack" intact)
  let titleCompany: string | null = null;
  if (title) {
    title = stripDecor(title);
    const parts = title.split(/\s+[-–—|:]\s+|\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      title = stripDecor(parts[0]);
      for (const part of parts.slice(1)) {
        if (isTechTrackTerm(part)) {
          if (!/^(?:remote|hybrid|on-?site|contract|full[\s-]?time|part[\s-]?time)$/i.test(part)) addSpec(part);
        } else if (LOCATION_OR_MODE_PART.test(part)) {
          continue;
        } else if (!titleCompany && /^[A-Z]/.test(part)) {
          titleCompany = part;
        }
      }
    }
    title = title.replace(/\s*\([^)]*\)\s*$/, "").trim() || null;
  }

  // 2. A "company" that is actually a technical track is a specialization, not an employer
  if (company && isTechTrackTerm(company)) {
    addSpec(company);
    company = null;
    companySource = "none";
  }
  if (!company && titleCompany) {
    company = titleCompany;
    companySource = "title";
  }

  // 3. Email-domain fallback
  if (!company) {
    const fromDomain = companyFromEmailDomain(email);
    if (fromDomain) {
      company = fromDomain;
      companySource = "email-domain";
    }
  }

  return {
    companyName: company,
    jobTitle: title,
    recipientEmail: email,
    specializations: specs,
    companySource,
  };
}

/** Applies normalizeJobIdentity to an extraction object (companyName/jobTitle/recipientEmail/requiredSkills). */
export function applyJobIdentityRules<
  T extends {
    companyName: string | null;
    jobTitle: string | null;
    recipientEmail: string | null;
    requiredSkills: string[];
    jobDescription?: string | null;
    evidenceText?: string | null;
  },
>(extraction: T): T {
  const id = normalizeJobIdentity({
    companyName: extraction.companyName,
    jobTitle: extraction.jobTitle,
    recipientEmail: extraction.recipientEmail,
    sourceText: [extraction.evidenceText, extraction.jobDescription].filter(Boolean).join("\n"),
  });
  const skills = [...(extraction.requiredSkills || [])];
  for (const spec of id.specializations) {
    if (!skills.some((s) => s.toLowerCase() === spec.toLowerCase())) skills.push(spec);
  }
  return {
    ...extraction,
    companyName: id.companyName,
    jobTitle: id.jobTitle,
    recipientEmail: extraction.recipientEmail ?? id.recipientEmail,
    requiredSkills: skills,
  };
}

export const JOB_IDENTITY_PROMPT_RULES = `
COMPANY vs ROLE-SPECIALIZATION RULES (critical):
- In a headline like "Hiring: [Role] - [Specialization/Track]" (e.g. "Hiring: AI Engineer - Agentic AI | 100% Remote (Canada)"), the text after the hyphen is a technical track, NOT a company. Never treat technical terms (Agentic AI, Full Stack, Backend, GenAI, Cloud, Data Science, Remote, etc.) as companyName.
- jobTitle must be the clean role only (e.g. "AI Engineer"); put the specialization (e.g. "Agentic AI") into requiredSkills.
- If no company is explicitly named in the post body, derive companyName from the recipient email domain (paige.millington@vaco.com -> "Vaco"), unless the domain is a generic provider (gmail.com, outlook.com, yahoo.com, hotmail.com, icloud.com) — then return null.
`;
