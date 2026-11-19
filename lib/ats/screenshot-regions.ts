/**
 * Deterministic guards for screenshot extraction.
 *
 * Split-screen screenshots mix several applications (video player, notebook, course page, the real job post).
 * The vision model is asked to segment the screenshot into regions and to transcribe ONLY the job-post region;
 * this module then verifies that every job field is grounded in that region and never in an excluded one.
 *
 * Nothing here is specific to a role, company or layout.
 */

import { ROLE_PROFILES, detectRoleFamily } from "@/lib/ats/role-profile";

export interface ScreenshotRegion {
  /** JOB_POST = the hiring post / JD / application form. OTHER = anything else (video, course page, tabs, ads...). */
  kind: "JOB_POST" | "OTHER";
  /** Short description of the region, e.g. "LinkedIn post (bottom)" or "YouTube course page (middle)". */
  description: string;
  /** Verbatim text visible inside THIS region (headings/titles are what matters). */
  text: string;
}

export interface RegionAwareExtraction {
  category: string;
  jobTitle: string | null;
  companyName: string | null;
  jobDescription: string | null;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  manualReviewReason: string | null;
  regions?: ScreenshotRegion[];
  screenLayout?: "SINGLE_WINDOW" | "SPLIT_SCREEN" | null;
  jobPostText?: string | null;
  jobTitleEvidence?: string | null;
  jobPostComplete?: boolean | null;
  incompleteJobPost?: boolean;
  titleUnknown?: boolean;
  inferredRoleTitle?: string | null;
}

const norm = (s: string | null | undefined) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** True when `needle` (normalised) occurs inside `haystack` (normalised), tolerating OCR spacing/punctuation. */
function containsPhrase(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const h = norm(haystack);
  const n = norm(needle);
  return n.length >= 3 && h.includes(n);
}

const MIN_JD_CHARS = 80;
const JOB_CATEGORIES = new Set(["JOB_POST", "RECRUITER_CONTACT", "APPLICATION_PORTAL"]);

/**
 * Verifies the extracted job identity against the detected regions.
 *  - jobTitle must be grounded in the job-post region text (or the title evidence quoted from it); a title that only
 *    appears in an excluded region (video title, course name, tab, ...) is discarded and reported as missing.
 *  - jobDescription lines copied from excluded regions are removed.
 *  - Incomplete posts (no title, clipped, too little JD) are flagged so no tailored application is generated.
 */
export function applyScreenshotRegionGuards<T extends RegionAwareExtraction>(extraction: T): T {
  const out: T = { ...extraction };
  const regions = (extraction.regions || []).filter((r) => r && (r.text || r.description));
  const excluded = regions.filter((r) => r.kind !== "JOB_POST");
  const jobRegionText = [
    extraction.jobPostText,
    ...regions.filter((r) => r.kind === "JOB_POST").map((r) => r.text),
  ]
    .filter(Boolean)
    .join("\n");
  const hasRegionInfo = regions.length > 0 || !!extraction.jobPostText;
  // Hashtags are topic tags, not a stated job title: never let them ground a title.
  const stripTags = (t: string | null | undefined) => String(t || "").replace(/#[\p{L}\p{N}_]+/gu, " ");

  const notes: string[] = [];

  // No usable region metadata: only a screenshot the model explicitly reports as a single window may be processed
  // as-is. Anything else may mix applications, so it must be reviewed instead of silently using nearby text.
  const hasJobRegion = !!extraction.jobPostText?.trim() || regions.some((r) => r.kind === "JOB_POST" && r.text?.trim());
  const regionless = !hasJobRegion;
  if (regionless && JOB_CATEGORIES.has(out.category) && extraction.screenLayout !== "SINGLE_WINDOW") {
    out.incompleteJobPost = true;
    out.confidence = "LOW";
    out.jobTitle = null; // unverified: could belong to another window
    notes.push("Job-post region could not be identified and the screenshot may contain several windows; job details were not verified. Review manually or upload a cropped screenshot of the post");
  }

  if (hasRegionInfo && out.jobTitle) {
    // The title must be written inside the job-post region. If the model returned no job-region transcription,
    // its own quoted evidence is the only fallback (never the free-form description).
    const inJobPost = containsPhrase(stripTags(jobRegionText || extraction.jobTitleEvidence), out.jobTitle);
    const inExcluded = excluded.some((r) => containsPhrase(`${r.text}\n${r.description}`, out.jobTitle));

    if (inExcluded && !inJobPost) {
      notes.push(`Job title "${out.jobTitle}" belongs to an unrelated screen region and was discarded`);
      out.jobTitle = null;
    } else if (!inJobPost) {
      notes.push(`Job title "${out.jobTitle}" is not visible inside the job-post region and was discarded`);
      out.jobTitle = null;
    }
  }

  // Strip any JD line that was copied from an excluded region and is not also present in the job-post region.
  if (out.jobDescription && excluded.length > 0) {
    const excludedLines = excluded.flatMap((r) => String(r.text || "").split(/\n+/)).map(norm).filter((l) => l.length >= 12);
    const kept = out.jobDescription.split(/\n/).filter((line) => {
      const n = norm(line);
      if (n.length < 12) return true;
      const fromExcluded = excludedLines.some((e) => e === n || (n.length >= 12 && e.includes(n)));
      return !fromExcluded || containsPhrase(jobRegionText, line);
    });
    if (kept.length !== out.jobDescription.split(/\n/).length) {
      notes.push("Removed job-description lines that came from unrelated screen regions");
      out.jobDescription = kept.join("\n").trim() || null;
    }
  }

  // Completeness: only meaningful for screenshots that should contain a job post.
  //  - BLOCKING (incompleteJobPost): too little job content to tailor an application from (clipped to nothing).
  //  - NON-BLOCKING (titleUnknown): the post still has a substantive description, but the title is clipped or
  //    unreadable. The application can go out with a neutral role wording; the title is never guessed.
  if (JOB_CATEGORIES.has(out.category)) {
    const jdLength = (out.jobDescription || "").trim().length;
    if (jdLength < MIN_JD_CHARS) {
      out.incompleteJobPost = true;
      out.confidence = "LOW";
      const why = [!out.jobTitle ? "job title not visible" : "", "job description missing or too short", extraction.jobPostComplete === false ? "job post appears clipped" : ""].filter(Boolean);
      notes.push(`Incomplete job post (${why.join("; ")}). Upload another screenshot that shows the full post, or review manually`);
    } else if (!out.jobTitle || extraction.jobPostComplete === false) {
      if (!out.jobTitle) {
        out.titleUnknown = true;
        // Understand what the post is about: the role the model read from the job-post content, or (fallback)
        // the role family the post's own text points to. Only job-post text is used, never excluded regions.
        const claimed = String(extraction.inferredRoleTitle || "").replace(/\s+/g, " ").trim();
        const postText = stripTags(jobRegionText || out.jobDescription);
        // A claimed role that only exists in an excluded region (course/video title) is rejected.
        const fromExcluded = excluded.some((r) => containsPhrase(`${r.text} ${r.description}`, claimed)) && !containsPhrase(postText, claimed);
        const claimedOk = claimed.length >= 3 && claimed.length <= 60 && !fromExcluded;
        const family = detectRoleFamily(null, `${postText} ${String(jobRegionText || out.jobDescription || "").match(/#[\p{L}\p{N}_]+/gu)?.join(" ") || ""}`);
        const inferred = claimedOk ? claimed : family !== "generic" ? ROLE_PROFILES[family].label : "";
        out.inferredRoleTitle = inferred || null;
        notes.push(inferred ? `Job title is not stated in the screenshot; the role was inferred from the post content as "${inferred}". Please verify before sending` : "Job title is not visible and the role is not clear from the post, so the draft uses neutral wording (\"the open position\"). Please verify before sending");
      } else {
        out.inferredRoleTitle = null;
        notes.push("Part of the post is clipped; please verify against the original post before sending");
      }
    }
  }
  if (out.jobTitle) out.inferredRoleTitle = null;

  if (notes.length > 0) {
    out.manualReviewReason = [out.manualReviewReason, ...notes].filter(Boolean).join(" | ");
  }
  return out;
}

export const SCREENSHOT_REGION_PROMPT_RULES = `
SCREEN REGION RULES (critical; split-screen screenshots are common):
A. FIRST segment the screenshot into regions/application windows (e.g. video player, code notebook, course or video description, browser tabs, sidebars, notifications, ads, and the actual job/hiring post). Do this BEFORE extracting anything.
B. The job-post region is the one that actually announces a role: hiring language, requirements, location, apply instructions, recruiter email/URL. It is NOT the largest or most prominent text. Video titles, course names, presenter/instructor names, channel names, subtitles, tab titles, menus, and other applications are never part of the job post, even if they contain job-like words (e.g. "Engineer", "Architect", "AI").
C. Fill "regions" with one entry per region: kind "JOB_POST" for the hiring post, "OTHER" for everything else, a short description (with position, e.g. "bottom"), and the verbatim visible text of that region (for OTHER regions, only the headings/titles are needed).
D. "jobPostText" = verbatim transcription of ONLY the job-post region. Every job field below must come from jobPostText. Never merge text from different regions.
E. "jobTitle" must be a role title written inside the job-post region. "jobTitleEvidence" = the exact phrase from jobPostText that states it. If the job post never states or has clipped the title, set jobTitle and jobTitleEvidence to null. NEVER use a video/course/tab title, a presenter name, or any nearby text as the title, and never infer a title from another region.
E2. companyName, location, contact details, URLs, emails and employer instructions must also come from the job-post region only.
F1. "inferredRoleTitle": ONLY when no job title is stated in the job-post region (jobTitle is null), name the role the post is clearly hiring for, judged from its responsibilities, requirements, skills and hashtags (e.g. "AI/ML Engineer", "Full Stack Developer", "Data Engineer"). Use a short, generic role label supported by the job-post text. Never take it from other regions (video/course titles). Use null if the post does not make the role clear, or when jobTitle is present.
F0. "screenLayout" = "SINGLE_WINDOW" when exactly one application/page fills the screenshot (e.g. a lone LinkedIn post, job portal page or email), "SPLIT_SCREEN" when two or more windows/apps/panes (video, notebook, chat, browser chrome plus another page) are visible. Always provide it. A hashtag (#AIEngineer) is a topic tag, not a stated job title.
F. "jobPostComplete" = false ONLY when essential job content is cut off or absent: the role/title line, the requirements/responsibilities, or the how-to-apply/contact details are clipped at a screen edge or scrolled out of view. A cut-off author header, profile line, timestamp, or intro sentence does NOT make the post incomplete. If false, list what is missing in manualReviewReason.
G. If no job-post region exists, use category UNCERTAIN or UNRELATED and leave the job fields null.
`;
