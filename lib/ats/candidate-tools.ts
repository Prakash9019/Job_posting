import type { CanonicalResume } from "./tailor";

export const AI_TOOLS_CATEGORY = "AI Development Tools";
const AI_TOOLS_KEY_RE = /^ai development tools$/i;

/**
 * Tools a specific candidate has explicitly confirmed as part of their workflow, keyed by that candidate's own
 * resume email: CONFIRMED_AI_TOOLS='{"me@example.com":["Cursor","Claude","Claude Code","Gemini"]}'.
 * There is no global default: a candidate without an entry only ever gets tools extracted from their own resume.
 */
export function getConfirmedAiTools(email?: string): string[] {
  const key = (email || "").trim().toLowerCase();
  const raw = process.env.CONFIRMED_AI_TOOLS;
  if (!key || !raw) return [];
  try {
    const map = JSON.parse(raw) as Record<string, unknown>;
    const entry = Object.entries(map).find(([k]) => k.trim().toLowerCase() === key)?.[1];
    return Array.isArray(entry) ? entry.map((t) => String(t).trim()).filter(Boolean) : [];
  } catch {
    console.warn("CONFIRMED_AI_TOOLS is not valid JSON; ignoring.");
    return [];
  }
}

/** Skills in a category the candidate's own resume (or confirmed profile) lists as AI development tools. */
export function getAiToolSkills(canonical: Pick<CanonicalResume, "technicalSkills">): string[] {
  const ts = canonical.technicalSkills;
  if (!ts || Array.isArray(ts) || typeof ts !== "object") return [];
  return Object.entries(ts as Record<string, string[] | string>)
    .filter(([k]) => AI_TOOLS_KEY_RE.test(k.trim()))
    .flatMap(([, v]) => (Array.isArray(v) ? v.map(String) : String(v).split(/,\s*/)))
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Ensures this candidate's confirmed tools are listed under "AI Development Tools" (idempotent; keeps any tools
 * already extracted from their own resume). Skills only: it never edits project bullets, so no project is claimed
 * to have been built with these tools.
 */
export function applyConfirmedAiTools(canonical: CanonicalResume): CanonicalResume {
  const confirmed = getConfirmedAiTools(canonical.email);
  if (confirmed.length === 0) return canonical;
  const record: Record<string, string[]> =
    canonical.technicalSkills && !Array.isArray(canonical.technicalSkills) && typeof canonical.technicalSkills === "object"
      ? (canonical.technicalSkills as Record<string, string[]>)
      : {};
  const existingKey = Object.keys(record).find((k) => AI_TOOLS_KEY_RE.test(k.trim())) || AI_TOOLS_CATEGORY;
  const current = getAiToolSkills({ technicalSkills: record });
  const seen = new Set(current.map((t) => t.toLowerCase()));
  const merged = [...current, ...confirmed.filter((t) => !seen.has(t.toLowerCase()))];
  delete record[existingKey];
  record[AI_TOOLS_CATEGORY] = merged;
  canonical.technicalSkills = record;
  return canonical;
}
