/**
 * Live email-quality comparison (network + GEMINI_API_KEY required; no DB, no sending).
 *
 *   node --env-file=.env --import tsx scripts/compare-email-models.ts generate <label> <model1,model2,...> [caseIds]
 *   node --env-file=.env --import tsx scripts/compare-email-models.ts direct   <label> <model>            [caseIds]
 *   node --env-file=.env --import tsx scripts/compare-email-models.ts judge    <judgeModel> <file1.json,file2.json,...>
 *
 * generate: runs the real generateApplicationEmail() pipeline per model (GEMINI_EMAIL_MODEL override).
 * direct:   "paste the JD + resume into Gemini" baseline (no pipeline, no validation), the user's reference point.
 * judge:    blind senior-recruiter rubric (outputs anonymised + shuffled per case) plus automated checks.
 * Results are written to tests/output/email-compare/.
 */
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { EMAIL_CASES, buildEmailInputs } from "./fixtures/email-quality-fixtures";
import { generateApplicationEmail } from "../lib/ai/gemini";
import { findPlainTextViolations } from "../lib/email/plain-text";
import { buildEvidenceUnits, detectRoleFamily, validateEmailAgainstCandidate } from "../lib/ats/role-profile";
import { canonicalToPlainText } from "../lib/ats/tailor";

const OUT_DIR = "tests/output/email-compare";
fs.mkdirSync(OUT_DIR, { recursive: true });

interface Row { caseId: string; system: string; model: string; subject: string; body: string; ms: number; error?: string; source?: string }

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const pickCases = (ids?: string) => (ids ? EMAIL_CASES.filter((c) => ids.split(",").includes(c.id)) : EMAIL_CASES);

async function generate(label: string, models: string[], ids?: string) {
  // The pipeline reads GEMINI_EMAIL_MODEL from the environment, so run one model per process.
  if (models.length !== 1) throw new Error("generate: pass exactly one model per process");
  const jobs = models.flatMap((m) => pickCases(ids).map((c) => ({ m, c })));
  const rows = await pool(jobs, 4, async ({ m, c }): Promise<Row> => {
    const t = Date.now();
    try {
      // The pipeline reads the model from the environment at call time.
      process.env.GEMINI_EMAIL_MODEL = m;
      const d = await generateApplicationEmail(buildEmailInputs(c));
      const meta = (d as { meta?: { source?: string } }).meta;
      const source = meta?.source || (/maps directly to your requirements/.test(d.body) ? "fallback" : "ai");
      console.log(`[${label}] ${m} ${c.id} ${Date.now() - t}ms ${source}`);
      return { caseId: c.id, system: `${label}:${m}`, model: m, subject: d.subject, body: d.body, ms: Date.now() - t, source };
    } catch (e) {
      return { caseId: c.id, system: `${label}:${m}`, model: m, subject: "", body: "", ms: Date.now() - t, error: String(e) };
    }
  });
  const file = path.join(OUT_DIR, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  console.log(`wrote ${file}`);
}

async function direct(label: string, model: string, ids?: string) {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim() });
  const rows = await pool(pickCases(ids), 4, async (c): Promise<Row> => {
    const t = Date.now();
    const ex = c.extraction;
    const prompt = `Write a job application email for this job using my resume. Make it convincing, personalised and concise, with a few bullet points of my most relevant work. The recruiter contact is: ${ex.contactName || "not named"} (${ex.recipientEmail}). I will attach my resume.\n\nJOB DESCRIPTION:\n${ex.jobDescription}\n\nMY RESUME:\n${canonicalToPlainText(c.resume)}\n\nGitHub: ${c.resume.githubUrl || "none"}\nLinkedIn: ${c.resume.linkedinUrl || "none"}`;
    try {
      const r = await client.models.generateContent({ model, contents: prompt });
      const text = r.text || "";
      const subject = text.match(/^\**subject:?\**\s*(.+)$/im)?.[1]?.trim() || "";
      return { caseId: c.id, system: `${label}:${model}`, model, subject, body: text.trim(), ms: Date.now() - t, source: "direct" };
    } catch (e) {
      return { caseId: c.id, system: `${label}:${model}`, model, subject: "", body: "", ms: Date.now() - t, error: String(e) };
    }
  });
  const file = path.join(OUT_DIR, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  console.log(`wrote ${file}`);
}

const RUBRIC = `You are a senior technical recruiter who screens hundreds of application emails a week for engineering roles.
Score each email below for the given job and candidate resume on these criteria (points):
- Role understanding (15): grasps the exact role, seniority and what the team needs.
- Relevance to the JD (15): content maps to the JD's actual requirements, nothing irrelevant.
- Candidate positioning (15): presents the candidate as a credible fit for THIS role from the first lines.
- Evidence selection (15): picks the strongest, most relevant projects/achievements with real metrics.
- Personalisation (10): specific to this company/role, not a template.
- Natural writing (10): confident, human, free of clichés and keyword stuffing; reads well in plain text.
- Accuracy (15): every claim is supported by the resume; no invented skills, metrics, titles or projects; correct attribution. Any invented fact must cost most of these points.
- Conciseness & scannability (5): easy to scan, roughly 120-180 words of body, no padding.
Ignore subject lines, sign-off formatting and markdown in "direct" outputs only insofar as they would be cleaned before sending; DO penalise invented placeholders like [Your Name] or [Company].
Return JSON: {"scores":[{"id":string,"total":number,"breakdown":{"role":number,"relevance":number,"positioning":number,"evidence":number,"personalisation":number,"natural":number,"accuracy":number,"concise":number},"inaccuracies":string[],"verdict":string}]}`;

async function judge(judgeModel: string, files: string[]) {
  const rows: Row[] = files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")));
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim() });
  const results: Array<Row & { score?: number; breakdown?: unknown; inaccuracies?: string[]; verdict?: string; auto: string[]; words: number }> = [];
  for (const c of EMAIL_CASES) {
    const items = rows.filter((r) => r.caseId === c.id && r.body);
    if (items.length === 0) continue;
    const shuffled = items.map((r, i) => ({ r, id: `E${i + 1}`, k: Math.random() })).sort((a, b) => a.k - b.k);
    const prompt = `${RUBRIC}\n\nJOB DESCRIPTION:\n${c.extraction.jobDescription}\n\nCANDIDATE RESUME (the only source of truth):\n${canonicalToPlainText(c.resume)}\n\n${shuffled.map((s) => `=== ${s.id} ===\nSubject: ${s.r.subject}\n${s.r.body}`).join("\n\n")}`;
    // Network hiccups must not lose the whole run: retry, then skip the case.
    let text = "";
    for (let t = 1; t <= 4 && !text; t++) {
      try {
        text = (await client.models.generateContent({ model: judgeModel, contents: prompt, config: { responseMimeType: "application/json" } })).text || "";
      } catch (e) {
        console.warn(`judge ${c.id} attempt ${t} failed: ${String(e).slice(0, 80)}`);
        await new Promise((res) => setTimeout(res, 5000 * t));
      }
    }
    if (!text) { console.warn(`skipped ${c.id}`); continue; }
    const parsed = JSON.parse(text) as { scores?: Array<{ id: string; total: number; breakdown: unknown; inaccuracies: string[]; verdict: string }> };
    const family = detectRoleFamily(c.extraction.jobTitle, c.extraction.jobDescription);
    const units = buildEvidenceUnits(c.resume, family);
    for (const s of shuffled) {
      const sc = parsed.scores?.find((x) => x.id === s.id);
      const body = s.r.body;
      const auto = [
        ...findPlainTextViolations(body).map((v) => `plain-text: ${v}`),
        ...validateEmailAgainstCandidate({ subject: s.r.subject, body, units, evidenceText: canonicalToPlainText(c.resume), identity: { fullName: c.resume.fullName, emails: [c.resume.email || ""], urls: [c.resume.githubUrl || "", c.resume.linkedinUrl || ""].filter(Boolean) }, companyName: c.expect.company }),
        ...(s.r.source !== "direct" && !body.startsWith(c.expect.greeting) ? [`greeting != ${c.expect.greeting}`] : []),
        ...(s.r.source !== "direct" && s.r.subject !== c.expect.subject ? [`subject "${s.r.subject}" != "${c.expect.subject}"`] : []),
      ];
      const words = body.replace(/\n(?:GitHub|LinkedIn|Portfolio):.*$/gim, "").split(/\s+/).filter(Boolean).length;
      results.push({ ...s.r, score: sc?.total, breakdown: sc?.breakdown, inaccuracies: sc?.inaccuracies, verdict: sc?.verdict, auto, words });
    }
    console.log(`judged ${c.id}`);
  }
  const file = path.join(OUT_DIR, `judged-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  const systems = Array.from(new Set(results.map((r) => r.system)));
  console.log("\nsystem | mean score | per-case | mean latency | auto-check failures | fallback");
  for (const sys of systems) {
    const rs = results.filter((r) => r.system === sys);
    const mean = rs.reduce((a, r) => a + (r.score || 0), 0) / rs.length;
    const lat = rs.reduce((a, r) => a + r.ms, 0) / rs.length / 1000;
    console.log(`${sys} | ${mean.toFixed(1)} | ${rs.map((r) => `${r.caseId}=${r.score}`).join(" ")} | ${lat.toFixed(1)}s | ${rs.reduce((a, r) => a + r.auto.length, 0)} | ${rs.filter((r) => r.source === "fallback").length}`);
  }
  console.log(`wrote ${file}`);
}

const [mode, a, b, c] = process.argv.slice(2);
const run = mode === "generate" ? generate(a, b.split(","), c) : mode === "direct" ? direct(a, b, c) : mode === "judge" ? judge(a, b.split(",")) : Promise.reject(new Error("mode: generate | direct | judge"));
run.catch((e) => { console.error(e); process.exit(1); });
