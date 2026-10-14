import assert from "node:assert/strict";
import { google } from "googleapis";
import { NextRequest } from "next/server";
import { prisma } from "../lib/db/prisma";
import { encrypt } from "../lib/security/encryption";
import { POST } from "../app/api/drafts/bulk-send/route";
import { GET } from "../app/api/drafts/route";
import { createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth/session";

const restore: (() => void)[] = [];
function replace(target: object, name: string, value: unknown) {
  const original = Reflect.get(target, name);
  assert.ok(Reflect.set(target, name, value));
  restore.push(() => { Reflect.set(target, name, original); });
}

async function main() {
  const statuses = new Map([["one", "NEEDS_REVIEW"], ["two", "NEEDS_REVIEW"], ["rejected", "REJECTED"]]);
  const outcomes = new Map<string, string>();
  let sends = 0;
  replace(google, "gmail", () => ({ users: { messages: { send: async () => {
    sends++;
    if (sends === 2) throw new Error("Simulated send failure");
    return { data: { id: "fake-message" } };
  } } } }));
  replace(prisma.user, "findUnique", async () => ({ name: "Test", email: "sender@example.com" }));
  replace(prisma.gmailAccount, "findFirst", async () => ({ email: "sender@example.com", accessTokenEncrypted: encrypt("fake-access-token"), tokenExpiry: new Date(Date.now() + 3600000) }));
  replace(prisma.emailDraft, "findUnique", async ({ where }: { where: { id: string } }) => ({ id: where.id, userId: "user_a", reviewStatus: statuses.get(where.id), recipientEmail: "recipient@example.com", subject: "Application", body: "Test body" }));
  replace(prisma.emailDraft, "updateMany", async ({ where }: { where: { id: string } }) => {
    if (statuses.get(where.id) === "REJECTED") return { count: 0 };
    statuses.set(where.id, "APPROVED");
    return { count: 1 };
  });
  replace(prisma.sendAttempt, "findFirst", async () => null);
  replace(prisma.sendAttempt, "create", async ({ data }: { data: { draftId: string } }) => ({ id: data.draftId }));
  replace(prisma.sendAttempt, "update", async ({ where, data }: { where: { id: string }; data: { status: string } }) => { outcomes.set(where.id, data.status); return {}; });
  const headers = { "Content-Type": "application/json", cookie: `${SESSION_COOKIE_NAME}=${createSessionToken("user_a")}` };
  const response = await POST(new NextRequest("http://localhost/api/drafts/bulk-send", { method: "POST", headers, body: JSON.stringify({ userId: "user_a", senderEmail: "sender@example.com", draftIds: ["one", "two", "rejected", "one"], approveAndSend: true }) }));
  const result = await response.json();
  assert.equal(result.total, 3);
  assert.equal(result.successCount, 1);
  assert.equal(result.failureCount, 2);
  assert.equal(sends, 2, "Rejected and duplicate selections must not send");
  assert.equal(outcomes.get("one"), "SENT");
  assert.equal(outcomes.get("two"), "FAILED");
  assert.equal(statuses.get("rejected"), "REJECTED");
  replace(prisma.emailDraft, "findMany", async ({ where }: { where: { userId: string; sendAttempts: unknown } }) => {
    assert.equal(where.userId, "user_a");
    assert.deepEqual(where.sendAttempts, { none: { status: "SENT" } });
    return [];
  });
  assert.equal((await GET(new NextRequest("http://localhost/api/drafts", { headers }))).status, 200);
  console.log("PASS: explicit bulk approval, duplicate selection, rejected drafts, mixed success/failure, and sent-queue filtering. Gmail and database mocked; no emails sent.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => restore.reverse().forEach(fn => fn()));
