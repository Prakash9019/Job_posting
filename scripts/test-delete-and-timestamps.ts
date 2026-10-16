/**
 * Comprehensive verification test script for Global Delete Operations and Timestamps.
 * Tests permanent hard deletion, storage file unlinking, user ownership validation,
 * bulk operations, and timestamp formatting (Last Updated vs Added On).
 */

import { prisma } from "../lib/db/prisma";
import { getStorageProvider } from "../lib/storage";
import {
  getRecordTimestamp,
  getEffectiveTimestampTime,
  formatDateTime,
  formatDateTimeCompact,
} from "../lib/utils/formatDate";
import {
  assertDraftAccess,
  assertScreenshotAccess,
  assertResumeAccess,
  assertBatchAccess,
  assertUrlAccess,
  assertSendAttemptAccess,
  AuthError,
} from "../lib/auth/authorization";

async function runTests() {
  console.log("==========================================================");
  console.log("🧪 TESTING GLOBAL DELETE OPERATIONS & TIMESTAMPS");
  console.log("==========================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  const storage = getStorageProvider();

  // ----------------------------------------------------
  // SECTION 1: Timestamp Formatting & Sorting
  // ----------------------------------------------------
  console.log("--- 1. Timestamp Formatting & Logic ---");

  const baseDate = new Date("2026-10-16T15:30:00.000Z");
  const modifiedDate = new Date("2026-10-16T16:45:00.000Z");

  // A. Newly created item (updatedAt equals createdAt)
  const tsAdded = getRecordTimestamp(baseDate, baseDate);
  assert(tsAdded.type === "created", "Newly created item identified as 'created'");
  assert(tsAdded.label === "Added On", "Newly created item label is 'Added On'");
  assert(tsAdded.display.startsWith("Added On:"), "Display string starts with 'Added On:'");

  // B. Modified item (updatedAt > createdAt)
  const tsUpdated = getRecordTimestamp(baseDate, modifiedDate);
  assert(tsUpdated.type === "updated", "Modified item identified as 'updated'");
  assert(tsUpdated.label === "Last Updated", "Modified item label is 'Last Updated'");
  assert(tsUpdated.display.startsWith("Last Updated:"), "Display string starts with 'Last Updated:'");

  // C. Compact format
  const tsCompact = getRecordTimestamp(baseDate, modifiedDate, { compact: true });
  assert(tsCompact.display.startsWith("Updated ·"), "Compact format starts with 'Updated ·'");
  assert(tsCompact.display.includes("·"), "Compact format includes middle dot separator");

  // D. Fallback when dates are missing/null
  const tsUnknown = getRecordTimestamp(null, null);
  assert(tsUnknown.type === "unknown", "Missing date identified as 'unknown'");
  assert(tsUnknown.display === "Date unavailable", "Missing date displays 'Date unavailable'");

  // E. Sorting helper
  const olderDate = new Date("2026-10-15T10:00:00.000Z");
  const timeRecent = getEffectiveTimestampTime(baseDate, modifiedDate);
  const timeOlder = getEffectiveTimestampTime(olderDate, olderDate);
  assert(timeRecent > timeOlder, "getEffectiveTimestampTime returns higher epoch for more recent update");

  // ----------------------------------------------------
  // SECTION 2: Hard Database & Physical File Deletions
  // ----------------------------------------------------
  console.log("\n--- 2. Hard Database Deletion & Physical Storage Cleanup ---");

  // Setup test batch for User A
  const testBatch = await prisma.batch.create({
    data: {
      userId: "user_a",
      name: "Test Delete Batch",
      status: "COMPLETED",
      totalScreenshots: 2,
    },
  });

  // Create temporary physical test files in storage
  const screenshotKey1 = `screenshots/test_delete_1_${Date.now()}.png`;
  const screenshotKey2 = `screenshots/test_delete_2_${Date.now()}.png`;
  await storage.saveFile(screenshotKey1, Buffer.from("fake-png-1"), "image/png");
  await storage.saveFile(screenshotKey2, Buffer.from("fake-png-2"), "image/png");

  assert(await storage.exists(screenshotKey1), "Storage file 1 created");
  assert(await storage.exists(screenshotKey2), "Storage file 2 created");

  // Create screenshot DB records
  const screenshot1 = await prisma.screenshot.create({
    data: {
      batchId: testBatch.id,
      fileName: "test_1.png",
      filePath: screenshotKey1,
      fileSize: 10,
      mimeType: "image/png",
      fileHash: `hash_del_1_${Date.now()}`,
      status: "COMPLETED",
    },
  });

  const screenshot2 = await prisma.screenshot.create({
    data: {
      batchId: testBatch.id,
      fileName: "test_2.png",
      filePath: screenshotKey2,
      fileSize: 10,
      mimeType: "image/png",
      fileHash: `hash_del_2_${Date.now()}`,
      status: "COMPLETED",
    },
  });

  // Create extracted URLs
  const url1 = await prisma.extractedUrl.create({
    data: {
      screenshotId: screenshot1.id,
      url: "https://www.linkedin.com/in/test-del-1",
      urlType: "LINKEDIN",
      title: "Test Profile 1",
    },
  });

  const url2 = await prisma.extractedUrl.create({
    data: {
      screenshotId: screenshot2.id,
      url: "https://jobs.lever.co/test-company/123",
      urlType: "APPLICATION_PORTAL",
      title: "Test Career Portal",
    },
  });

  // Create email drafts
  const draft1 = await prisma.emailDraft.create({
    data: {
      batchId: testBatch.id,
      userId: "user_a",
      screenshotId: screenshot1.id,
      companyName: "Acme Corp",
      jobTitle: "Software Engineer",
      recipientEmail: "hiring@acme.com",
      subject: "Application for Software Engineer",
      body: "Hello Acme team...",
      reviewStatus: "NEEDS_REVIEW",
    },
  });

  const draft2 = await prisma.emailDraft.create({
    data: {
      batchId: testBatch.id,
      userId: "user_a",
      screenshotId: screenshot2.id,
      companyName: "Beta LLC",
      jobTitle: "Frontend Lead",
      recipientEmail: "recruiting@beta.com",
      subject: "Application for Frontend Lead",
      body: "Hello Beta team...",
      reviewStatus: "APPROVED",
    },
  });

  // Create SendAttempt
  const attempt1 = await prisma.sendAttempt.create({
    data: {
      draftId: draft1.id,
      userId: "user_a",
      senderEmail: "user.a@gmail.com",
      recipientEmail: "hiring@acme.com",
      subject: "Application for Software Engineer",
      status: "SENT",
      gmailMessageId: "msg_test_del_12345",
    },
  });

  // Create test resume with stored file
  const resumeKey = `resumes/user_a/test_del_resume_${Date.now()}.pdf`;
  await storage.saveFile(resumeKey, Buffer.from("%PDF-fake-resume"), "application/pdf");
  assert(await storage.exists(resumeKey), "Resume storage file created");

  const resume1 = await prisma.resume.create({
    data: {
      userId: "user_a",
      fileName: "Test_Delete_Resume.pdf",
      filePath: resumeKey,
      fileSize: 20,
      mimeType: "application/pdf",
      extractedText: "Test resume content for delete verification",
      isActive: false,
    },
  });

  // ----------------------------------------------------
  // SECTION 3: Cross-User Ownership Validation
  // ----------------------------------------------------
  console.log("\n--- 3. Cross-User Access & Ownership Guard Checks ---");

  // User B attempting to access User A's records must throw 403 Forbidden
  let blockedUrl = false;
  try {
    await assertUrlAccess(url1.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) blockedUrl = true;
  }
  assert(blockedUrl, "User B accessing User A extracted URL throws 403 Forbidden");

  let blockedAttempt = false;
  try {
    await assertSendAttemptAccess(attempt1.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) blockedAttempt = true;
  }
  assert(blockedAttempt, "User B accessing User A send attempt throws 403 Forbidden");

  let blockedDraft = false;
  try {
    await assertDraftAccess(draft1.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) blockedDraft = true;
  }
  assert(blockedDraft, "User B accessing User A draft throws 403 Forbidden");

  let blockedScreenshot = false;
  try {
    await assertScreenshotAccess(screenshot1.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) blockedScreenshot = true;
  }
  assert(blockedScreenshot, "User B accessing User A screenshot throws 403 Forbidden");

  let blockedResume = false;
  try {
    await assertResumeAccess(resume1.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) blockedResume = true;
  }
  assert(blockedResume, "User B accessing User A resume throws 403 Forbidden");

  let blockedBatch = false;
  try {
    await assertBatchAccess(testBatch.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) blockedBatch = true;
  }
  assert(blockedBatch, "User B accessing User A batch throws 403 Forbidden");

  // ----------------------------------------------------
  // SECTION 4: Permanent Hard Deletion Execution
  // ----------------------------------------------------
  console.log("\n--- 4. Hard Deletion & Disk Cleanup Execution ---");

  // A. Extracted URL deletion
  await prisma.extractedUrl.deleteMany({
    where: {
      id: { in: [url1.id, url2.id] },
      screenshot: { batch: { userId: "user_a" } },
    },
  });
  const checkUrl1 = await prisma.extractedUrl.findUnique({ where: { id: url1.id } });
  const checkUrl2 = await prisma.extractedUrl.findUnique({ where: { id: url2.id } });
  assert(!checkUrl1 && !checkUrl2, "Extracted URLs permanently removed from DB");

  // B. Send Attempt deletion
  await prisma.sendAttempt.deleteMany({
    where: {
      id: { in: [attempt1.id] },
      userId: "user_a",
    },
  });
  const checkAttempt = await prisma.sendAttempt.findUnique({ where: { id: attempt1.id } });
  assert(!checkAttempt, "Send attempt permanently removed from DB");

  // C. Email Draft deletion
  await prisma.emailDraft.deleteMany({
    where: {
      id: { in: [draft1.id, draft2.id] },
      userId: "user_a",
    },
  });
  const checkDraft1 = await prisma.emailDraft.findUnique({ where: { id: draft1.id } });
  const checkDraft2 = await prisma.emailDraft.findUnique({ where: { id: draft2.id } });
  assert(!checkDraft1 && !checkDraft2, "Email drafts permanently removed from DB");

  // D. Resume deletion (DB + Storage file unlink)
  await storage.deleteFile(resume1.filePath);
  await prisma.resume.delete({ where: { id: resume1.id } });
  const checkResume = await prisma.resume.findUnique({ where: { id: resume1.id } });
  const resumeFileStillExists = await storage.exists(resumeKey);
  assert(!checkResume, "Resume permanently removed from DB");
  assert(!resumeFileStillExists, "Resume file permanently removed from physical disk storage");

  // E. Batch and Screenshots deletion (DB + Storage file unlinks)
  await storage.deleteFile(screenshot1.filePath);
  await storage.deleteFile(screenshot2.filePath);
  await prisma.batch.delete({ where: { id: testBatch.id } });

  const checkBatch = await prisma.batch.findUnique({ where: { id: testBatch.id } });
  const checkScreenshot1 = await prisma.screenshot.findUnique({ where: { id: screenshot1.id } });
  const checkScreenshot2 = await prisma.screenshot.findUnique({ where: { id: screenshot2.id } });
  const screenshot1FileExists = await storage.exists(screenshotKey1);
  const screenshot2FileExists = await storage.exists(screenshotKey2);

  assert(!checkBatch, "Batch permanently removed from DB");
  assert(!checkScreenshot1 && !checkScreenshot2, "Screenshots cascaded and permanently removed from DB");
  assert(!screenshot1FileExists && !screenshot2FileExists, "Screenshot images permanently removed from physical disk storage");

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log("\n==========================================================");
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log("==========================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error("Test runner failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
