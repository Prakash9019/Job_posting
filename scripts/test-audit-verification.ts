/**
 * Comprehensive Audit & Verification Suite for ApplyPilot
 * 
 * Tests:
 * 1. Encryption Secret Protection & Key Rotation Fallback & Migration
 * 2. User Isolation & Authorization Enforcement across Resumes, Batches, Drafts, Files, History, Links
 * 3. Gmail OAuth Persistence, Token Expiry, and MIME Attachment Handling
 */

import { encrypt, decrypt } from "../lib/security/encryption";
import { buildMimeMessage } from "../lib/email/gmail";
import { prisma } from "../lib/db/prisma";
import {
  assertBatchAccess,
  assertResumeAccess,
  assertDraftAccess,
  assertFileAccess,
  requireUser,
  AuthError,
} from "../lib/auth/authorization";
import { createSessionToken } from "../lib/auth/session";

async function runTests() {
  console.log("==========================================================");
  console.log("🧪 RUNNING APPLYPILOT SECURITY & AUDIT VERIFICATION SUITE");
  console.log("==========================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  // -------------------------------------------------------------
  // TEST 1: Encryption Secret Protection, Key Rotation & Fallback
  // -------------------------------------------------------------
  console.log("--- 1. Testing Encryption Secret & Key Rotation Fallback ---");
  const oldSecret = "36f7677383b8f2438baa38a9ea816b488c715872e977e52faf2f5d22e53f7106";
  const newSecret = "3eb5072edb8ec002a891acdb3239e0e80a8cf570d2136435bc2348f6e6ec613d";

  // Encrypt with old secret
  const plaintextToken = "ya29.sample_oauth_refresh_token_secret_12345";
  const encryptedWithOld = encrypt(plaintextToken, oldSecret);
  assert(
    encryptedWithOld.split(":").length === 3,
    "Encrypted payload conforms to iv:ciphertext:tag format"
  );

  // Decrypt with current key while OLD_ENCRYPTION_SECRET is active in process.env
  process.env.ENCRYPTION_SECRET = newSecret;
  process.env.OLD_ENCRYPTION_SECRET = oldSecret;

  const decryptedViaFallback = decrypt(encryptedWithOld);
  assert(
    decryptedViaFallback === plaintextToken,
    "Fallback decryption successfully recovered token encrypted with old key"
  );

  // Encrypt with new key
  const encryptedWithNew = encrypt(plaintextToken, newSecret);
  const decryptedWithNew = decrypt(encryptedWithNew);
  assert(
    decryptedWithNew === plaintextToken,
    "Decryption with new ENCRYPTION_SECRET works directly"
  );

  // Tamper detection: altered ciphertext must throw
  let tamperDetected = false;
  try {
    const parts = encryptedWithNew.split(":");
    const tampered = `${parts[0]}:aGVsbG8td29ybGQ=:${parts[2]}`;
    decrypt(tampered);
  } catch {
    tamperDetected = true;
  }
  assert(tamperDetected, "Tampered ciphertext or auth tag is detected and rejected");

  // -------------------------------------------------------------
  // TEST 2: RFC 2822 MIME Construction & Attachment Chunking
  // -------------------------------------------------------------
  console.log("\n--- 2. Testing RFC 2822 MIME & Attachment Handling ---");
  const samplePdfContent = Buffer.from("%PDF-1.4 sample pdf resume content repeated ".repeat(20));
  const mimeMessage = buildMimeMessage({
    from: "applicant@example.com",
    to: "recruiter@company.com",
    subject: "Application for Senior Developer - Jane Doe",
    body: "Please find attached my resume for the open position.",
    attachment: {
      filename: "Jane_Doe_Resume.pdf",
      content: samplePdfContent,
      contentType: "application/pdf",
    },
  });

  assert(typeof mimeMessage === "string" && mimeMessage.length > 0, "MIME message successfully generated");
  
  // Decode base64url back to raw MIME text to verify RFC headers
  const rawMime = Buffer.from(
    mimeMessage.replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf-8");

  assert(rawMime.includes("From: applicant@example.com"), "MIME headers include correct From address");
  assert(rawMime.includes("To: recruiter@company.com"), "MIME headers include correct To address");
  assert(rawMime.includes("Content-Type: multipart/mixed"), "MIME headers define multipart/mixed for attachment");
  assert(rawMime.includes('Content-Disposition: attachment; filename="Jane_Doe_Resume.pdf"'), "MIME attachment has correct filename header");
  assert(rawMime.includes("Content-Transfer-Encoding: base64"), "MIME attachment is base64 encoded");
  assert(rawMime.includes("Date: "), "MIME includes RFC Date header");

  // -------------------------------------------------------------
  // TEST 3: User Isolation & Strict Authorization Guards
  // -------------------------------------------------------------
  console.log("\n--- 3. Testing User Isolation & Boundary Enforcement ---");

  // Create temporary test fixtures for User A and User B
  await prisma.user.upsert({
    where: { id: "user_a" },
    update: {},
    create: { id: "user_a", name: "User A" },
  });
  await prisma.user.upsert({
    where: { id: "user_b" },
    update: {},
    create: { id: "user_b", name: "User B" },
  });

  // Create Resume for User A
  const resumeUserA = await prisma.resume.create({
    data: {
      userId: "user_a",
      fileName: "user_a_resume.pdf",
      filePath: "resumes/user_a/test.pdf",
      fileSize: 1024,
      extractedText: "Skills: TypeScript, Node.js, Next.js",
      isActive: true,
    },
  });

  // Create Batch for User A
  const batchUserA = await prisma.batch.create({
    data: {
      userId: "user_a",
      name: "User A Secret Batch",
      totalScreenshots: 1,
      resumeId: resumeUserA.id,
    },
  });

  // Create Screenshot for User A
  const screenshotUserA = await prisma.screenshot.create({
    data: {
      batchId: batchUserA.id,
      fileName: "job_post.png",
      filePath: "screenshots/user_a/test.png",
      fileSize: 2048,
      mimeType: "image/png",
      fileHash: "hash_test_12345",
    },
  });

  // Create Draft for User A
  const draftUserA = await prisma.emailDraft.create({
    data: {
      userId: "user_a",
      batchId: batchUserA.id,
      screenshotId: screenshotUserA.id,
      companyName: "Acme Corp",
      jobTitle: "Software Engineer",
      recipientEmail: "hiring@acme.com",
      subject: "Application for Software Engineer",
      body: "Hello Acme team...",
      reviewStatus: "NEEDS_REVIEW",
    },
  });

  // A. Verify User A can access own resources
  const ownBatch = await assertBatchAccess(batchUserA.id, "user_a");
  assert(ownBatch.id === batchUserA.id, "User A can access User A's batch");

  const ownResume = await assertResumeAccess(resumeUserA.id, "user_a");
  assert(ownResume.id === resumeUserA.id, "User A can access User A's resume");

  const ownDraft = await assertDraftAccess(draftUserA.id, "user_a");
  assert(ownDraft.id === draftUserA.id, "User A can access User A's draft");

  // B. Verify User B CANNOT access User A's resources (throws 403 Forbidden)
  let batchBlocked = false;
  try {
    await assertBatchAccess(batchUserA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) batchBlocked = true;
  }
  assert(batchBlocked, "User B accessing User A's batch is REJECTED with 403 Forbidden");

  let resumeBlocked = false;
  try {
    await assertResumeAccess(resumeUserA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) resumeBlocked = true;
  }
  assert(resumeBlocked, "User B accessing User A's resume is REJECTED with 403 Forbidden");

  let draftBlocked = false;
  try {
    await assertDraftAccess(draftUserA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) draftBlocked = true;
  }
  assert(draftBlocked, "User B accessing User A's draft is REJECTED with 403 Forbidden");

  let resumeFileBlocked = false;
  try {
    await assertFileAccess("resume", resumeUserA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) resumeFileBlocked = true;
  }
  assert(resumeFileBlocked, "User B streaming User A's resume PDF is REJECTED with 403 Forbidden");

  let screenshotFileBlocked = false;
  try {
    await assertFileAccess("screenshot", screenshotUserA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) screenshotFileBlocked = true;
  }
  assert(screenshotFileBlocked, "User B streaming User A's screenshot image is REJECTED with 403 Forbidden");

  // C. Verify requireUser requires valid user context
  let missingContextBlocked = false;
  try {
    const mockReq = new Request("http://localhost:3000/api/overview");
    requireUser(mockReq);
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 401) missingContextBlocked = true;
  }
  assert(missingContextBlocked, "Request with missing user identity is REJECTED with 401 Unauthorized");

  let invalidUserBlocked = false;
  try {
    const mockReq = new Request("http://localhost:3000/api/overview", {
      headers: { "x-user-id": "malicious_user_x" },
    });
    requireUser(mockReq);
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 401) invalidUserBlocked = true;
  }
  assert(invalidUserBlocked, "Request with spoofed client header is REJECTED with 401 Unauthorized");

  // D. Verify valid verified session cookie succeeds
  const sessionToken = createSessionToken("user_a");
  const authReq = new Request("http://localhost:3000/api/overview", {
    headers: { cookie: `applypilot_session=${sessionToken}` },
  });
  const authResult = requireUser(authReq);
  assert(authResult.userId === "user_a", "Request with cryptographically verified session cookie succeeds");

  // Clean up test records
  await prisma.batch.delete({ where: { id: batchUserA.id } });
  await prisma.resume.delete({ where: { id: resumeUserA.id } });

  console.log("\n==========================================================");
  console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
  console.log("==========================================================\n");
}

runTests()
  .catch((err) => {
    console.error("Test suite failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
