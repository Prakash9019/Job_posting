import assert from "node:assert/strict";
import { scoreResume, containsSkill } from "../lib/ats/scoring";
import { POST } from "../app/api/ats/route";
import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth/session";
const text = [
  "Priya Sharma", "priya@example.com | +91 9876543210",
  "Skills", "JavaScript, React.js, PostgreSQL",
  "Work Experience", "Frontend Engineer",
  "- Built a React dashboard serving 1,000 users.",
  "- Developed JavaScript features with PostgreSQL queries.",
  "Education", "BTech Computer Science, 2025",
].join("\n");
async function main() {
  assert.ok(containsSkill("React.js components", "React"));
  assert.ok(containsSkill("JavaScript", "JS"));
  assert.ok(!containsSkill("JavaScript", "Java"));
  assert.ok(!containsSkill("C++", "C"));
  const score = scoreResume(text, [
    { keyword: "React", importance: "required", jobEvidence: "React required" },
    { keyword: "Python", importance: "preferred", jobEvidence: "Python preferred" },
  ]);
  assert.equal(score.matchScore, 75);
  assert.equal(score.matches[0].placement, "Skills + experience");
  assert.equal(score.matches[1].evidence.length, 0);
  assert.equal(score.matches[0].evidence[1].number, 7);
  assert.equal(scoreResume(text).matchScore, null);
  assert.deepEqual(scoreResume(text), scoreResume(text), "Scoring must be repeatable");
  assert.ok(scoreResume(text.replace("Skills","Capabilities")).score < scoreResume(text).score);
  assert.equal((await POST(new NextRequest("http://localhost/api/ats", { method: "POST" }))).status, 401);
  const data = new FormData(); data.set("resumeText", text); data.set("action", "parse");
  const response = await POST(new NextRequest("http://localhost/api/ats", { method: "POST", body: data, headers: { cookie: SESSION_COOKIE_NAME + "=" + createSessionToken("user_a") } }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).resumeText, text);
  console.log("PASS: weighted scores, synonyms, exact boundaries, line evidence, repeatability, authentication and parse-only flow.");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
