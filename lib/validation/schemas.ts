import { z } from "zod";

// Email validation helper: returns valid trimmed email or null
export const optionalEmailSchema = z.string().trim().email().nullable().catch(null);

export const ExtractionCategoryEnum = z.enum([
  "JOB_POST",
  "RECRUITER_CONTACT",
  "LINKEDIN_PROFILE",
  "APPLICATION_PORTAL",
  "UNRELATED",
  "UNCERTAIN",
]);
export type ExtractionCategory = z.infer<typeof ExtractionCategoryEnum>;

export const ConfidenceEnum = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceEnum>;

export const WorkModeEnum = z.enum(["Remote", "Hybrid", "On-site", "Unspecified"]);

// Gemini Structured Extraction Schema
export const GeminiExtractionSchema = z.object({
  category: ExtractionCategoryEnum,
  companyName: z.string().trim().nullable().catch(null),
  jobTitle: z.string().trim().nullable().catch(null),
  recipientEmail: z.string().trim().nullable().catch(null),
  linkedInUrls: z.array(z.string().trim().url()).default([]).catch([]),
  applicationUrls: z.array(z.string().trim().url()).default([]).catch([]),
  otherUrls: z.array(z.string().trim().url()).default([]).catch([]),
  jobDescription: z.string().trim().nullable().catch(null),
  requiredSkills: z.array(z.string().trim()).default([]).catch([]),
  experienceRequirements: z.string().trim().nullable().catch(null),
  location: z.string().trim().nullable().catch(null),
  workMode: WorkModeEnum.nullable().catch(null),
  contactName: z.string().trim().nullable().catch(null),
  contactRole: z.string().trim().nullable().catch(null),
  evidenceText: z.string().trim().nullable().catch(null),
  confidence: ConfidenceEnum.default("MEDIUM"),
  manualReviewReason: z.string().trim().nullable().catch(null),
  // Screen-region understanding (screenshots only). Optional so text/manual extractions stay valid.
  regions: z.array(z.object({
    kind: z.enum(["JOB_POST", "OTHER"]).catch("OTHER"),
    description: z.string().trim().catch(""),
    text: z.string().trim().catch(""),
  })).optional().catch(undefined),
  /** SINGLE_WINDOW = one application fills the screenshot; SPLIT_SCREEN = several windows/apps are visible. */
  screenLayout: z.enum(["SINGLE_WINDOW", "SPLIT_SCREEN"]).nullable().optional().catch(null),
  jobPostText: z.string().trim().nullable().optional().catch(null),
  jobTitleEvidence: z.string().trim().nullable().optional().catch(null),
  jobPostComplete: z.boolean().nullable().optional().catch(null),
  /** Set by the region guards: title/JD missing or clipped, so no tailored application may be generated. */
  incompleteJobPost: z.boolean().optional().catch(undefined),
  /** Title not visible but the post is otherwise usable: draft is created with neutral role wording and a review note. */
  titleUnknown: z.boolean().optional().catch(undefined),
  /** Role the post is clearly hiring for, inferred from its content, ONLY when no title is stated (e.g. "AI/ML Engineer"). */
  inferredRoleTitle: z.string().trim().nullable().optional().catch(null),
});

export type GeminiExtraction = z.infer<typeof GeminiExtractionSchema>;

// Generated Email Schema
export const GeneratedEmailDraftSchema = z.object({
  subject: z.string().trim().min(3),
  body: z.string().trim().min(10),
  keyPointsMatched: z.array(z.string().trim()).default([]),
});

export type GeneratedEmailDraft = z.infer<typeof GeneratedEmailDraftSchema>;

// Update draft request schema
export const UpdateDraftSchema = z.object({
  subject: z.string().trim().min(1, "Subject cannot be empty"),
  body: z.string().trim().min(1, "Body cannot be empty"),
  recipientEmail: z.string().trim().email("Invalid recipient email"),
  companyName: z.string().trim().min(1, "Company name cannot be empty"),
  jobTitle: z.string().trim().min(1, "Job title cannot be empty"),
  reviewStatus: z.enum(["NEEDS_REVIEW", "APPROVED", "REJECTED"]).optional(),
}).partial().refine(data => Object.keys(data).length > 0, "Provide a field to update");

// Bulk send request schema
export const BulkSendRequestSchema = z.object({
  approveAndSend: z.boolean().default(false),
  draftIds: z.array(z.string().min(1)).min(1, "Select at least one draft to send"),
  userId: z.string().min(1, "User must be specified"),
});
