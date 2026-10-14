/**
 * ApplyPilot Comprehensive Security Test Suite
 *
 * Verifies:
 * 1. Session Forgery & Signature Tampering Resistance
 * 2. Multi-Tenant User Isolation & Cross-User Resource Protection (403 Forbidden)
 * 3. Unauthorized Email Sending Protection & Duplicate Prevention
 * 4. OAuth State Forgery & Anti-CSRF Validation
 * 5. AES-256-GCM Token Encryption, AEAD Tamper Detection & Key Migration
 * 6. RFC 2822 / RFC 2045 MIME Email & Attachment Construction
 */

import crypto from "crypto";
import { prisma } from "../lib/db/prisma";
import { encrypt, decrypt } from "../lib/security/encryption";
import { NextRequest } from "next/server";
import { POST as handleSessionPost, GET as handleSessionGet } from "../app/api/auth/session/route";
import {
  createSessionToken,
  verifySessionToken,
  signOAuthState,
  verifyOAuthState,
  verifyCredentials,
  SESSION_COOKIE_NAME,
} from "../lib/auth/session";
import {
  requireUser,
  assertBatchAccess,
  assertResumeAccess,
  assertDraftAccess,
  assertScreenshotAccess,
  assertFileAccess,
  AuthError,
} from "../lib/auth/authorization";
import { buildMimeMessage, sendEmailDraft } from "../lib/email/gmail";

async function runSecurityTests() {
  console.log("==========================================================");
  console.log("🛡️  APPLYPILOT COMPREHENSIVE SECURITY TEST SUITE");
  console.log("==========================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}${detail ? ` - ${detail}` : ""}`);
      throw new Error(`Test failed: ${name}`);
    }
  }

  // =========================================================================
  // 0. AUTHENTICATION & CREDENTIAL VERIFICATION (POST /api/auth/session)
  // =========================================================================
  console.log("--- 0. Authentication & Credential Verification (POST /api/auth/session) ---");

  // 1. Direct verifyCredentials unit checks
  assert(verifyCredentials({ userId: "user_a" }) === null, "Direct verifyCredentials({ userId: 'user_a' }) without password is null");
  assert(verifyCredentials({ userId: "user_b" }) === null, "Direct verifyCredentials({ userId: 'user_b' }) without password is null");
  assert(verifyCredentials({}) === null, "Direct verifyCredentials({}) with empty object is null");
  assert(verifyCredentials({ userId: "user_a", password: "wrong_password" }) === null, "Direct verifyCredentials with invalid password is null");
  assert(verifyCredentials({ userId: "user_a", password: "UserA_PilotPass_2026!" }) === "user_a", "Direct verifyCredentials with valid User A password derives 'user_a'");
  assert(verifyCredentials({ userId: "user_b", password: "UserB_PilotPass_2026!" }) === "user_b", "Direct verifyCredentials with valid User B password derives 'user_b'");
  assert(verifyCredentials({ userId: "user_b", password: "UserA_PilotPass_2026!" }) === null, "Direct verifyCredentials cross-user mismatch (User A password for User B) is null");

  // 2. Unauthenticated POST /api/auth/session requests
  const unauthPostA = await handleSessionPost(new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "user_a" }),
  }));
  assert(unauthPostA.status === 401, "POST merely supplying { userId: 'user_a' } is REJECTED with 401 Unauthorized");

  const unauthPostB = await handleSessionPost(new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "user_b" }),
  }));
  assert(unauthPostB.status === 401, "POST merely supplying { userId: 'user_b' } is REJECTED with 401 Unauthorized");

  const emptyPost = await handleSessionPost(new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  }));
  assert(emptyPost.status === 401, "POST with empty request body is REJECTED with 401 Unauthorized");

  // 3. Header manipulation attacks
  const manipulatedHeaderPost = await handleSessionPost(new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": "user_a",
      "x-forwarded-user": "user_a",
    },
    body: JSON.stringify({ userId: "user_a" }),
  }));
  assert(manipulatedHeaderPost.status === 401, "POST with manipulated client headers (x-user-id) is REJECTED with 401 Unauthorized");

  // 4. Cookie manipulation attacks
  const manipulatedCookiePost = await handleSessionPost(new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: "active_user_id=user_a; user_id=user_a; applypilot_session=forged_token",
    },
    body: JSON.stringify({ userId: "user_a" }),
  }));
  assert(manipulatedCookiePost.status === 401, "POST with manipulated cookies (active_user_id, fake session) is REJECTED with 401 Unauthorized");

  // 5. Body property injection / privilege escalation attacks
  const injectionBodyPost = await handleSessionPost(new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "user_a",
      role: "admin",
      authenticated: true,
      bypass: true,
      trusted: true,
    }),
  }));
  assert(injectionBodyPost.status === 401, "POST with injected body properties (role: admin, authenticated: true) is REJECTED with 401 Unauthorized");

  // 6. Invalid password test
  const wrongPasswordPost = await handleSessionPost(new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "user_a", password: "wrong_guess_12345" }),
  }));
  assert(wrongPasswordPost.status === 401, "POST with incorrect password is REJECTED with 401 Unauthorized");

  // 7. Cross-user credential mismatch
  const crossUserPost = await handleSessionPost(new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "user_b", password: "UserA_PilotPass_2026!" }),
  }));
  assert(crossUserPost.status === 401 || crossUserPost.status === 403, "POST requesting User B with User A credentials is REJECTED");

  // 8. Legitimate verified authentication for User A
  const validAuthPostA = await handleSessionPost(new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "user_a", password: "UserA_PilotPass_2026!" }),
  }));
  assert(validAuthPostA.status === 200, "POST with verified User A credentials succeeds with 200 OK");
  const cookieHeaderA = validAuthPostA.headers.get("set-cookie") || "";
  assert(cookieHeaderA.includes(SESSION_COOKIE_NAME) && cookieHeaderA.includes("HttpOnly"), "POST sets HttpOnly applypilot_session cookie on verified authentication");

  // 9. Legitimate verified authentication for User B
  const validAuthPostB = await handleSessionPost(new NextRequest("http://localhost:3000/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: "user_b", password: "UserB_PilotPass_2026!" }),
  }));
  assert(validAuthPostB.status === 200, "POST with verified User B credentials succeeds with 200 OK");
  const cookieHeaderB = validAuthPostB.headers.get("set-cookie") || "";
  assert(cookieHeaderB.includes(SESSION_COOKIE_NAME), "POST sets applypilot_session cookie for User B");

  // 10. Unauthenticated GET /api/auth/session
  const unauthGet = await handleSessionGet(new NextRequest("http://localhost:3000/api/auth/session"));
  assert(unauthGet.status === 401, "GET /api/auth/session without session cookie is REJECTED with 401");

  // =========================================================================
  // 1. SESSION FORGERY & SIGNATURE TAMPERING
  // =========================================================================
  console.log("\n--- 1. Session Forgery & Signature Tampering Protection ---");

  const validTokenUserA = createSessionToken("user_a");
  const verifiedUserA = verifySessionToken(validTokenUserA);
  assert(verifiedUserA !== null && verifiedUserA.userId === "user_a", "Valid session token verifies successfully");

  // Tamper test: replace payload with forged user_b while keeping user_a signature
  const [b64PayloadA, sigA] = validTokenUserA.split(".");
  const forgedPayload = Buffer.from(
    JSON.stringify({ userId: "user_b", createdAt: Date.now(), expiresAt: Date.now() + 100000 })
  ).toString("base64url");
  const forgedToken = `${forgedPayload}.${sigA}`;
  assert(verifySessionToken(forgedToken) === null, "Forged session token (altered payload with original signature) is REJECTED");

  // Tamper test: corrupted signature
  const tamperedSigToken = `${b64PayloadA}.invalid_corrupted_signature_12345`;
  assert(verifySessionToken(tamperedSigToken) === null, "Session token with corrupted signature is REJECTED");

  // Expired session test
  const expiredToken = createSessionToken("user_a", -10); // Expired 10 seconds ago
  assert(verifySessionToken(expiredToken) === null, "Expired session token is REJECTED");

  // Unauthenticated request (no session cookie)
  let missingSessionRejected = false;
  try {
    const unauthReq = new Request("http://localhost:3000/api/overview");
    requireUser(unauthReq);
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 401) {
      missingSessionRejected = true;
    }
  }
  assert(missingSessionRejected, "Request without session cookie is REJECTED with 401 Unauthorized");

  // Spoofed header test: client attempts to send x-user-id: user_b without valid cookie
  let spoofedHeaderRejected = false;
  try {
    const spoofReq = new Request("http://localhost:3000/api/overview", {
      headers: { "x-user-id": "user_b" },
    });
    requireUser(spoofReq);
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 401) {
      spoofedHeaderRejected = true;
    }
  }
  assert(spoofedHeaderRejected, "Client spoofed header 'x-user-id' without verified session is REJECTED with 401");

  // Verified cookie extraction
  const cookieReq = new Request("http://localhost:3000/api/overview", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${validTokenUserA}` },
  });
  const extractedUser = requireUser(cookieReq);
  assert(extractedUser.userId === "user_a", "Verified session cookie establishes valid user identity");

  // =========================================================================
  // 2. CROSS-USER ACCESS & RESOURCE OWNERSHIP GUARDS
  // =========================================================================
  console.log("\n--- 2. Multi-Tenant User Isolation & Ownership Guards ---");

  // Setup database fixtures
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

  const resumeA = await prisma.resume.create({
    data: {
      userId: "user_a",
      fileName: "user_a_private_resume.pdf",
      filePath: "resumes/user_a/test.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      extractedText: "Secret candidate qualifications",
      isActive: true,
    },
  });

  const batchA = await prisma.batch.create({
    data: {
      userId: "user_a",
      name: "User A Confidential Batch",
      totalScreenshots: 1,
      resumeId: resumeA.id,
    },
  });

  const screenshotA = await prisma.screenshot.create({
    data: {
      batchId: batchA.id,
      fileName: "user_a_lead.png",
      filePath: "screenshots/user_a/test.png",
      fileSize: 2048,
      mimeType: "image/png",
      fileHash: "hash_security_test_1",
    },
  });

  const draftA = await prisma.emailDraft.create({
    data: {
      userId: "user_a",
      batchId: batchA.id,
      screenshotId: screenshotA.id,
      companyName: "Stealth Startup",
      jobTitle: "Principal Architect",
      recipientEmail: "talent@stealth.io",
      subject: "Application for Principal Architect",
      body: "Confidential application message...",
      reviewStatus: "NEEDS_REVIEW",
    },
  });

  // User A can access own resources
  const batchAccessA = await assertBatchAccess(batchA.id, "user_a");
  assert(batchAccessA.id === batchA.id, "User A can access User A's batch");

  const resumeAccessA = await assertResumeAccess(resumeA.id, "user_a");
  assert(resumeAccessA.id === resumeA.id, "User A can access User A's resume");

  const draftAccessA = await assertDraftAccess(draftA.id, "user_a");
  assert(draftAccessA.id === draftA.id, "User A can access User A's draft");

  const screenshotAccessA = await assertScreenshotAccess(screenshotA.id, "user_a");
  assert(screenshotAccessA.id === screenshotA.id, "User A can access User A's screenshot");

  // User B attempting cross-user access: MUST receive 403 Forbidden
  let crossBatchBlocked = false;
  try {
    await assertBatchAccess(batchA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) crossBatchBlocked = true;
  }
  assert(crossBatchBlocked, "User B accessing User A's batch is REJECTED with 403 Forbidden");

  let crossResumeBlocked = false;
  try {
    await assertResumeAccess(resumeA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) crossResumeBlocked = true;
  }
  assert(crossResumeBlocked, "User B accessing User A's resume is REJECTED with 403 Forbidden");

  let crossDraftBlocked = false;
  try {
    await assertDraftAccess(draftA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) crossDraftBlocked = true;
  }
  assert(crossDraftBlocked, "User B accessing User A's draft is REJECTED with 403 Forbidden");

  let crossScreenshotBlocked = false;
  try {
    await assertScreenshotAccess(screenshotA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) crossScreenshotBlocked = true;
  }
  assert(crossScreenshotBlocked, "User B accessing User A's screenshot is REJECTED with 403 Forbidden");

  let crossFileResumeBlocked = false;
  try {
    await assertFileAccess("resume", resumeA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) crossFileResumeBlocked = true;
  }
  assert(crossFileResumeBlocked, "User B streaming User A's resume file is REJECTED with 403 Forbidden");

  let crossFileScreenshotBlocked = false;
  try {
    await assertFileAccess("screenshot", screenshotA.id, "user_b");
  } catch (err) {
    if (err instanceof AuthError && err.statusCode === 403) crossFileScreenshotBlocked = true;
  }
  assert(crossFileScreenshotBlocked, "User B streaming User A's screenshot file is REJECTED with 403 Forbidden");

  // =========================================================================
  // 3. UNAUTHORIZED EMAIL SENDING & DUPLICATE PROTECTION
  // =========================================================================
  console.log("\n--- 3. Unauthorized Email Sending Protection ---");

  // User B attempting to send User A's draft
  let unauthorizedSendBlocked = false;
  try {
    await sendEmailDraft({
      draftId: draftA.id,
      userId: "user_b",
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Security Violation")) {
      unauthorizedSendBlocked = true;
    }
  }
  assert(unauthorizedSendBlocked, "User B attempting to send User A's email draft is REJECTED as Security Violation");

  // Sending unapproved draft
  let unapprovedSendBlocked = false;
  try {
    await sendEmailDraft({
      draftId: draftA.id,
      userId: "user_a",
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("must be explicitly approved")) {
      unapprovedSendBlocked = true;
    }
  }
  assert(unapprovedSendBlocked, "Attempting to send an unapproved email draft is REJECTED");

  // Duplicate sending prevention
  const approvedDraft = await prisma.emailDraft.create({
    data: {
      userId: "user_a",
      batchId: batchA.id,
      companyName: "Duplicate Test Co",
      jobTitle: "Dev",
      recipientEmail: "duplicate@test.com",
      subject: "Test",
      body: "Body",
      reviewStatus: "APPROVED",
    },
  });

  // Simulate an existing SENT record
  await prisma.sendAttempt.create({
    data: {
      draftId: approvedDraft.id,
      userId: "user_a",
      senderEmail: "user_a@gmail.com",
      recipientEmail: "duplicate@test.com",
      subject: "Test",
      status: "SENT",
      gmailMessageId: "msg_existing_123",
    },
  });

  let duplicateSendBlocked = false;
  try {
    await sendEmailDraft({
      draftId: approvedDraft.id,
      userId: "user_a",
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already been sent")) {
      duplicateSendBlocked = true;
    }
  }
  assert(duplicateSendBlocked, "Attempting to send an already-sent draft is REJECTED (duplicate prevention)");

  // =========================================================================
  // 4. OAUTH STATE FORGERY & CSRF PROTECTION
  // =========================================================================
  console.log("\n--- 4. OAuth State Forgery & CSRF Protection ---");

  const validOAuthState = signOAuthState("user_a");
  const verifiedOAuthState = verifyOAuthState(validOAuthState);
  assert(verifiedOAuthState !== null && verifiedOAuthState.userId === "user_a", "Valid cryptographic OAuth state verifies successfully");

  // Tampered OAuth state: changing userId
  const stateSig = validOAuthState.split(".")[1];
  const forgedStatePayload = Buffer.from(
    JSON.stringify({ userId: "user_b", nonce: "nonce123", issuedAt: Date.now() })
  ).toString("base64url");
  const tamperedState = `${forgedStatePayload}.${stateSig}`;
  assert(verifyOAuthState(tamperedState) === null, "Forged OAuth state parameter is REJECTED");

  // Expired OAuth state (older than 15 minutes)
  const expiredStatePayload = Buffer.from(
    JSON.stringify({ userId: "user_a", nonce: "nonce123", issuedAt: Date.now() - 20 * 60 * 1000 })
  ).toString("base64url");
  const secret = process.env.SESSION_SECRET || process.env.ENCRYPTION_SECRET!;
  const expiredSig = crypto.createHmac("sha256", Buffer.from(secret, "hex")).update(expiredStatePayload).digest("base64url");
  const expiredState = `${expiredStatePayload}.${expiredSig}`;
  assert(verifyOAuthState(expiredState) === null, "Expired OAuth state (> 15 min) is REJECTED");

  // =========================================================================
  // 5. ENCRYPTION, KEY ROTATION & INTEGRITY
  // =========================================================================
  console.log("\n--- 5. AES-256-GCM Token Encryption & Key Rotation ---");

  const testKeyOld = "36f7677383b8f2438baa38a9ea816b488c715872e977e52faf2f5d22e53f7106";
  const testKeyNew = "3eb5072edb8ec002a891acdb3239e0e80a8cf570d2136435bc2348f6e6ec613d";
  const sensitiveToken = "ya29.a0AfH6SMD_secure_refresh_token_xyz987";

  const encryptedOld = encrypt(sensitiveToken, testKeyOld);
  assert(encryptedOld.includes(":"), "Token encrypted using AES-256-GCM format");

  // Decrypt with fallback to old key
  process.env.ENCRYPTION_SECRET = testKeyNew;
  process.env.OLD_ENCRYPTION_SECRET = testKeyOld;
  const decryptedOld = decrypt(encryptedOld);
  assert(decryptedOld === sensitiveToken, "Fallback decryption safely recovers token encrypted with prior key");

  // Re-encrypt with new key
  const encryptedNew = encrypt(sensitiveToken, testKeyNew);
  const decryptedNew = decrypt(encryptedNew);
  assert(decryptedNew === sensitiveToken, "Token successfully decrypted with new ENCRYPTION_SECRET");

  // Integrity test: modifying auth tag
  let authTagTamperDetected = false;
  try {
    const parts = encryptedNew.split(":");
    const corruptedTag = `${parts[0]}:${parts[1]}:${Buffer.from("corruptedtag1234").toString("base64")}`;
    decrypt(corruptedTag);
  } catch {
    authTagTamperDetected = true;
  }
  assert(authTagTamperDetected, "AEAD Authentication Tag tampering is detected and rejected");

  // =========================================================================
  // 6. RFC 2822 / RFC 2045 MIME EMAIL & ATTACHMENT HANDLING
  // =========================================================================
  console.log("\n--- 6. RFC 2822 / RFC 2045 MIME Email & Attachment Handling ---");

  const pdfData = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n".repeat(15));
  const mimeMsg = buildMimeMessage({
    from: "user_a@gmail.com",
    to: "recruiter@tech.com",
    subject: "Application for Engineering Role",
    body: "Please find my attached resume.",
    attachment: {
      filename: "Resume_User_A.pdf",
      content: pdfData,
      contentType: "application/pdf",
    },
  });

  const rawDecodedMime = Buffer.from(mimeMsg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  assert(rawDecodedMime.includes("MIME-Version: 1.0"), "MIME message contains MIME-Version header");
  assert(rawDecodedMime.includes("multipart/mixed"), "MIME message contains multipart/mixed Content-Type");
  assert(rawDecodedMime.includes('Content-Disposition: attachment; filename="Resume_User_A.pdf"'), "Attachment includes Content-Disposition header with filename");
  assert(rawDecodedMime.includes("Date: "), "MIME message includes RFC Date header");

  // Verify attachment base64 line chunking (lines <= 76 characters per RFC 2045)
  const lines = rawDecodedMime.split("\r\n");
  const base64AttachmentLines = lines.filter((l) => l.length > 50 && /^[A-Za-z0-9+/=]+$/.test(l));
  const allLinesUnder76 = base64AttachmentLines.every((l) => l.length <= 76);
  assert(allLinesUnder76 && base64AttachmentLines.length > 0, "Attachment base64 chunks strictly respect RFC 2045 76-character line limit");

  // Cleanup database fixtures
  await prisma.sendAttempt.deleteMany({ where: { draftId: approvedDraft.id } });
  await prisma.emailDraft.deleteMany({ where: { id: { in: [draftA.id, approvedDraft.id] } } });
  await prisma.screenshot.deleteMany({ where: { id: screenshotA.id } });
  await prisma.batch.deleteMany({ where: { id: batchA.id } });
  await prisma.resume.deleteMany({ where: { id: resumeA.id } });

  console.log("\n==========================================================");
  console.log(`🎉 ALL ${passed}/${total} SECURITY TESTS PASSED!`);
  console.log("==========================================================\n");
}

runSecurityTests()
  .catch((err) => {
    console.error("❌ Fatal test failure:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
