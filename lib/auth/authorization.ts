import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  VALID_USER_IDS,
  ValidUserId,
  getSessionFromRequest,
} from "@/lib/auth/session";

export { VALID_USER_IDS, type ValidUserId };

export class AuthError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AuthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static [Symbol.hasInstance](instance: unknown) {
    return (
      Boolean(instance) &&
      typeof instance === "object" &&
      ((instance as Error).name === "AuthError" || "statusCode" in (instance as Record<string, unknown>))
    );
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return (
    error instanceof AuthError ||
    (Boolean(error) && typeof error === "object" && ((error as Error).name === "AuthError" || "statusCode" in (error as Record<string, unknown>)))
  );
}

/**
 * Require a cryptographically verified server-side session.
 * Throws 401 Unauthorized if the session cookie/token is missing, invalid, expired, or forged.
 * Client-provided headers (x-user-id), query parameters, or unverified cookies are STRICTLY REJECTED.
 */
export function requireUser(req: NextRequest | Request): { userId: ValidUserId } {
  const session = getSessionFromRequest(req);
  if (!session) {
    throw new AuthError(
      401,
      "Unauthorized: Valid verified server-side session required. Please authenticate via POST /api/auth/session."
    );
  }
  return { userId: session.userId };
}

/**
 * Asserts that the specified batch exists and belongs to the authenticated user.
 */
export async function assertBatchAccess(batchId: string, userId: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    throw new AuthError(404, `Batch '${batchId}' not found.`);
  }

  if (batch.userId !== userId) {
    throw new AuthError(
      403,
      `Forbidden: Batch '${batchId}' belongs to another user. Cross-user access denied.`
    );
  }

  return batch;
}

/**
 * Asserts that the specified resume exists and belongs to the authenticated user.
 */
export async function assertResumeAccess(resumeId: string, userId: string) {
  const resume = await prisma.resume.findUnique({
    where: { id: resumeId },
  });

  if (!resume) {
    throw new AuthError(404, `Resume '${resumeId}' not found.`);
  }

  if (resume.userId !== userId) {
    throw new AuthError(
      403,
      `Forbidden: Resume '${resumeId}' belongs to another user. Cross-user access denied.`
    );
  }

  return resume;
}

/**
 * Asserts that the specified draft exists and belongs to the authenticated user.
 */
export async function assertDraftAccess(draftId: string, userId: string) {
  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId },
  });

  if (!draft) {
    throw new AuthError(404, `Email draft '${draftId}' not found.`);
  }

  if (draft.userId !== userId) {
    throw new AuthError(
      403,
      `Forbidden: Email draft '${draftId}' belongs to another user. Cross-user access denied.`
    );
  }

  return draft;
}

/**
 * Asserts that the specified screenshot exists and belongs to the authenticated user's batch.
 */
export async function assertScreenshotAccess(screenshotId: string, userId: string) {
  const screenshot = await prisma.screenshot.findUnique({
    where: { id: screenshotId },
    include: {
      batch: {
        select: { userId: true },
      },
    },
  });

  if (!screenshot) {
    throw new AuthError(404, `Screenshot '${screenshotId}' not found.`);
  }

  if (screenshot.batch.userId !== userId) {
    throw new AuthError(
      403,
      `Forbidden: Screenshot '${screenshotId}' belongs to another user. Cross-user access denied.`
    );
  }

  return screenshot;
}

/**
 * Asserts access to files (resumes or screenshots) based on user ownership.
 */
export async function assertFileAccess(
  type: string,
  id: string,
  userId: string
): Promise<{ filePath: string; mimeType: string; fileName: string }> {
  if (type === "screenshot") {
    const screenshot = await assertScreenshotAccess(id, userId);
    return {
      filePath: screenshot.filePath,
      mimeType: screenshot.mimeType,
      fileName: screenshot.fileName,
    };
  }

  if (type === "resume") {
    const resume = await assertResumeAccess(id, userId);
    return {
      filePath: resume.filePath,
      mimeType: resume.mimeType,
      fileName: resume.fileName,
    };
  }

  throw new AuthError(400, `Invalid file category '${type}'. Allowed: 'screenshot', 'resume'.`);
}
