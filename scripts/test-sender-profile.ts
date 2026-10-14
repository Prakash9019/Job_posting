import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../lib/db/prisma";
import { PATCH } from "../app/api/profile/route";
import { PATCH as updateDraft } from "../app/api/drafts/[id]/route";
import { createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth/session";
import { sendEmailDraft } from "../lib/email/gmail";

// Prisma delegates are proxies; replace their methods directly for isolated tests.
const restorers: (() => void)[] = [];
const mock = {
  method(target: object, name: string, replacement: unknown) {
    const original = Reflect.get(target, name);
    Reflect.set(target, name, replacement);
    restorers.push(() => { Reflect.set(target, name, original); });
  },
  restoreAll() { restorers.splice(0).reverse().forEach(restore => restore()); },
};

async function main() {
  const request = (body: object, authenticated = true) => new NextRequest("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(authenticated ? { cookie: `${SESSION_COOKIE_NAME}=${createSessionToken("user_a")}` } : {}) },
    body: JSON.stringify(body),
  });
  let saved = false;
  mock.method(prisma.gmailAccount, "findFirst", async ({ where }: { where: { userId: string; email: string } }) => {
    assert.equal(where.userId, "user_a");
    return where.email === "sender@example.com" ? { email: where.email } : null;
  });
  mock.method(prisma.user, "update", async () => { saved = true; return {}; });
  assert.equal((await PATCH(request({ name: "Suryaprakash", email: "sender@example.com" }, false))).status, 401);
  assert.equal(saved, false);
  assert.equal((await PATCH(request({ name: "Suryaprakash", email: "other@example.com" }))).status, 400);
  assert.equal(saved, false);
  assert.equal((await PATCH(request({ name: "Name\r\nBcc: injected", email: "sender@example.com" }))).status, 400);
  assert.equal((await PATCH(request({ name: "Suryaprakash", email: "sender@example.com" }))).status, 200);
  assert.equal(saved, true);

  mock.method(prisma.emailDraft, "findUnique", async () => ({ id: "draft", userId: "user_a", reviewStatus: "APPROVED" }));
  let status = "";
  mock.method(prisma.emailDraft, "update", async ({ data }: { data: { reviewStatus: string } }) => { status = data.reviewStatus; return data; });
  const context = { params: Promise.resolve({ id: "draft" }) };
  assert.equal((await updateDraft(request({ reviewStatus: "APPROVED" }), context)).status, 200);
  assert.equal(status, "APPROVED");
  assert.equal((await updateDraft(request({ body: "Updated application", reviewStatus: "APPROVED" }), context)).status, 200);
  assert.equal(status, "NEEDS_REVIEW");

  mock.method(prisma.sendAttempt, "findFirst", async () => null);
  mock.method(prisma.user, "findUnique", async () => ({ email: "sender@example.com", name: "Suryaprakash" }));
  await assert.rejects(sendEmailDraft({ draftId: "draft", userId: "user_a", senderEmail: "wrong@example.com" }), /Sender changed/);
  await assert.rejects(sendEmailDraft({ draftId: "draft", userId: "user_a" }), /Sender changed/);
  mock.restoreAll();
  console.log("PASS: profile authentication, connected sender enforcement, name validation, approval updates, review reset, and sender mismatch rejection. No emails sent or database records changed.");
}

main().catch(error => { mock.restoreAll(); console.error(error); process.exitCode = 1; });
