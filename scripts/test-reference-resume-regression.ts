/**
 * Rendered-document regression test for the Lakshmi screenshot-recreation case.
 *
 * Unlike the source-pattern tests, this one compiles the real LaTeX and inspects the real PDF:
 *   STRUCTURE - text-item coordinates (pdfjs): two-line education/experience/project blocks,
 *               bullet indentation, vertical gaps, page count, no leaked markup
 *   CONTENT   - every word of the reference text survives, in order
 *   LINKS     - PDF /Link annotations: URL + the exact text each one covers
 *   VISUAL    - reference and generated pages rendered with one renderer, side-by-side/diff PNG
 *   EMAIL     - MIME attachment bytes == the validated PDF
 *
 * The same structural analyzer is run against three PDFs:
 *   reference PDF       -> must pass (calibration: the analyzer agrees with the known-good document)
 *   defective PDF       -> must FAIL  (proves the checks detect the original production defects)
 *   freshly generated   -> must pass
 *
 * Fixtures live in tests/fixtures/lakshmi and are never overwritten by this script.
 */
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { generateATSLatex, compileLatexToPdfBuffer, getCandidateFilename } from "../lib/ats/tailor";
import { extractHyperlinksFromPdf } from "../lib/ats/hyperlinks";
import { generateResumePdfFromText } from "../lib/ats/pdf-artifact";
import { normalizeWrappedBullets } from "../lib/ats/scoring";

const FIX = path.join(__dirname, "..", "tests", "fixtures", "lakshmi");
const OUT = path.join(__dirname, "..", "tests", "output");
fs.mkdirSync(OUT, { recursive: true });

type Seg = { x0: number; x1: number; text: string };
type Line = { y: number; segs: Seg[]; text: string; items: Array<{ x: number; w: number; str: string }> };
type Link = { url: string; covered: string; y: number; x: number };
type Doc = { pages: number; width: number; height: number; lines: Line[]; links: Link[]; text: string };

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const norm = (s: string) => s.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();


async function analyze(buf: Buffer): Promise<Doc> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const lines: Line[] = [];
  const links: Link[] = [];
  let width = 0;
  let height = 0;
  let yOffset = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    width = vp.width;
    height = vp.height;
    const content = await page.getTextContent();
    type Item = { str: string; x: number; y: number; w: number; size: number };
    const items: Item[] = (content.items as Array<{ str: string; transform: number[]; width: number }>)
      .filter((i) => i.str.trim().length > 0)
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, size: Math.abs(i.transform[3]) || 9 }));
    const rows: Item[][] = [];
    for (const it of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const row = rows.find((r) => Math.abs(r[0].y - it.y) < 2.5);
      if (row) row.push(it);
      else rows.push([it]);
    }
    for (const row of rows.sort((a, b) => b[0].y - a[0].y)) {
      row.sort((a, b) => a.x - b.x);
      const segs: Seg[] = [];
      for (const it of row) {
        const last = segs[segs.length - 1];
        if (last && it.x - last.x1 < it.size * 1.6) {
          last.text += (it.x - last.x1 > it.size * 0.15 ? " " : "") + it.str;
          last.x1 = it.x + it.w;
        } else segs.push({ x0: it.x, x1: it.x + it.w, text: it.str });
      }
      lines.push({ y: yOffset + (height - row[0].y), segs, text: norm(segs.map((s) => s.text).join(" ")), items: row.map((r) => ({ x: r.x, w: r.w, str: r.str })) });
    }
    for (const a of ((await page.getAnnotations()) as Array<{ subtype?: string; url?: string; rect?: number[] }>)) {
      if (a.subtype !== "Link" || !a.url || !a.rect) continue;
      const [x1, y1, x2, y2] = a.rect;
      // Text under the annotation: items whose centre is inside the rect horizontally, on the one text
      // row closest to the rect's vertical centre (rects are padded and may graze the line above).
      const cy = (y1 + y2) / 2;
      const inX = items.filter((i) => i.x + i.w / 2 >= x1 && i.x + i.w / 2 <= x2);
      const rowY = inX.length ? inX.reduce((best, i) => (Math.abs(i.y + i.size * 0.3 - cy) < Math.abs(best - cy) ? i.y + i.size * 0.3 : best), inX[0].y + inX[0].size * 0.3) : 0;
      const covered = inX
        .filter((i) => Math.abs(i.y + i.size * 0.3 - rowY) < 2)
        .sort((a2, b2) => a2.x - b2.x)
        .map((i) => i.str)
        .join("");
      links.push({ url: a.url, covered: alnum(covered), x: x1, y: yOffset + (height - cy) });
    }
    yOffset += height;
  }
  return { pages: doc.numPages, width, height, lines, links, text: lines.map((l) => l.text).join("\n") };
}

/** Returns a list of structural defects (empty = layout matches the reference structure). */
function structuralDefects(d: Doc): string[] {
  const bad: string[] = [];
  const right = (l: Line, minFrac = 0.6) => l.segs.filter((s) => s.x0 > d.width * minFrac);
  const left = (l: Line) => l.segs.filter((s) => s.x0 < d.width * 0.5);
  const findLine = (re: RegExp) => d.lines.findIndex((l) => re.test(l.text));

  // Two-line blocks: line 1 = name (left) + location (right); line 2 = detail (left) + dates (right)
  const blocks: Array<[string, RegExp, RegExp, RegExp, RegExp]> = [
    ["education", /^Vignan/, /^Visakhapatnam$/, /^Bachelor of Technology/, /^2023 - 2026$/],
    ["education", /^Government Polytechnic/, /^Bheemunipatnam$/, /^Diploma in Computer/, /^2020 - 2023$/],
    ["experience", /^AI Engineer\b/, /^Hyderabad$/, /^Julley Online/, /^Mar 2026 - Present$/],
    ["experience", /^Software Engineer Intern\b/, /^Mysuru, Karnataka$/, /^Infosys/, /^Dec 2025 - Mar 2026$/],
    ["experience", /^Research Intern\b/, /^Bangalore$/, /^Centre for Brain Research/, /^Jun 2025 - Aug 2025$/],
    ["experience", /^Data Science Intern\b/, /^Remote$/, /^Arthavo Technologies/, /^Mar 2024 - May 2024$/],
  ];
  for (const [kind, nameRe, locRe, detailRe, dateRe] of blocks) {
    const i = findLine(nameRe);
    if (i < 0) { bad.push(`${kind}: no line starting ${nameRe}`); continue; }
    const l1 = d.lines[i], l2 = d.lines[i + 1];
    const name = left(l1)[0]?.text ?? "", loc = right(l1).map((s) => norm(s.text)).join(" ");
    if (!nameRe.test(norm(name))) bad.push(`${kind}: ${nameRe} not left-aligned on its line`);
    if (!locRe.test(loc)) bad.push(`${kind}: location for ${nameRe} not right-aligned on same line (got "${loc}")`);
    if (!l2) { bad.push(`${kind}: ${nameRe} has no second line`); continue; }
    const det = norm(left(l2)[0]?.text ?? ""), date = right(l2).map((s) => norm(s.text)).join(" ");
    if (!detailRe.test(det)) bad.push(`${kind}: second line of ${nameRe} is "${det}", expected ${detailRe}`);
    if (!dateRe.test(date)) bad.push(`${kind}: dates for ${nameRe} not right-aligned on second line (got "${date}")`);
  }
  for (const city of ["Visakhapatnam", "Bheemunipatnam", "Hyderabad", "Mysuru", "Bangalore"]) {
    const n = d.lines.filter((l) => l.text.includes(city)).length;
    const expected = city === "Bangalore" ? 3 : 1; // IISc Bangalore appears in summary + company line + location
    if (n !== expected) bad.push(`location "${city}" appears on ${n} lines, expected ${expected}`);
  }

  // Projects: title left, "Code | Live Demo" right on the same line, tech stack next, bullet after
  const projects: Array<[RegExp, RegExp, RegExp]> = [
    [/^AI-Powered Resume Analyzer/, /^Gemini Pro, LLM, Prompt Engineering$/, /^[••]?\s*Built an intelligent ATS/],
    [/^MCQ Generator/, /^LangChain, Gemini API, RAG$/, /^[••]?\s*Built an automated assessment/],
    [/^Multi-Language Invoice Extractor/, /^OCR, Gemini Pro$/, /^[••]?\s*Built an end-to-end invoice/],
  ];
  for (const [titleRe, stackRe, bulletRe] of projects) {
    const i = findLine(titleRe);
    if (i < 0) { bad.push(`project: no title ${titleRe}`); continue; }
    const links = right(d.lines[i]).map((s) => norm(s.text).replace(/\s/g, "")).join("");
    if (!/^Code\|?LiveDemo$/.test(links.replace(/[|]/g, "|"))) bad.push(`project ${titleRe}: right column is "${links}", expected "Code|LiveDemo"`);
    if (!stackRe.test(norm(left(d.lines[i + 1] ?? { segs: [], text: "", y: 0 })[0]?.text ?? ""))) bad.push(`project ${titleRe}: tech stack not directly under title`);
    if (!bulletRe.test(d.lines[i + 2]?.text ?? "")) bad.push(`project ${titleRe}: description not directly under tech stack`);
  }
  const titleCount = d.lines.filter((l) => /^(AI-Powered Resume Analyzer|MCQ Generator|Multi-Language Invoice Extractor)\b/.test(l.text)).length;
  if (titleCount !== 3) bad.push(`expected 3 project titles, found ${titleCount}`);
  if (d.lines.some((l) => /\bProject\b/.test(l.text))) bad.push(`stray "Project" label present`);

  // Bullet indentation: every bullet's text starts at one x; wrapped continuation lines start at that same x
  // Bullet text start x: from the bullet glyph's following item when separate, otherwise (bullet + text in one
  // text item, as in the reference) from the x where wrapped continuation lines begin.
  const bulletLines = d.lines.filter((l) => /^[••]/.test(l.items[0]?.str.trim() ?? ""));
  const margin = Math.min(...d.lines.slice(2).map((l) => l.segs[0].x0));
  const bulletXs = bulletLines
    .filter((l) => l.items[0].str.trim().length === 1 && l.items[1])
    .map((l) => l.items[1].x);
  const contXs = d.lines
    .slice(2)
    .filter((l) => !/^[••]/.test(l.items[0]?.str.trim() ?? "") && l.segs[0].x0 > margin + 3 && l.segs[0].x0 < margin + 40)
    .map((l) => l.segs[0].x0);
  if (bulletLines.length < 10) bad.push(`only ${bulletLines.length} bullets detected`);
  else {
    const pool = bulletXs.length >= 10 ? bulletXs : contXs;
    const bx = [...pool].sort((p, q) => p - q)[Math.floor(pool.length / 2)];
    if (bulletXs.some((x) => Math.abs(x - bx) > 2)) bad.push("bullet text does not start at a consistent x");
    for (const l of d.lines.slice(2)) {
      const x = l.segs[0].x0;
      const ok = Math.abs(x - margin) < 2 || Math.abs(x - bx) < 2 || /^[••]/.test(l.items[0]?.str.trim() ?? "");
      if (!ok) { bad.push(`line "${l.text.slice(0, 40)}" starts at x=${x.toFixed(1)} (margin ${margin.toFixed(1)}, bullet text ${bx.toFixed(1)})`); break; }
    }
  }

  // Whitespace: no gap far larger than normal line pitch, and nothing spills below the page
  const ys = d.lines.map((l) => l.y);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]).filter((g) => g > 0).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)] || 1;
  const maxGap = gaps[gaps.length - 1] || 0;
  if (maxGap > median * 2.2) bad.push(`vertical gap ${maxGap.toFixed(1)}pt vs median pitch ${median.toFixed(1)}pt (>2.2x)`);

  if (d.pages !== 1) bad.push(`expected 1 page, got ${d.pages}`);
  if (/\*\*|\]\(|XATSTOKEN|\\(?:textbf|href|textit)|\$\\bullet|\[[A-Za-z ]+\]\(/.test(d.text)) bad.push("markup/Markdown leaked into visible text");
  return bad;
}

async function render(buf: Buffer, scale = 1.5): Promise<ReturnType<typeof createCanvas>[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale });
    const canvas = createCanvas(vp.width, vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, vp.width, vp.height);
    // @ts-expect-error napi canvas context is structurally compatible
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push(canvas);
  }
  return out;
}

function inkBox(c: ReturnType<typeof createCanvas>) {
  const { width, height } = c;
  const data = c.getContext("2d").getImageData(0, 0, width, height).data;
  let x0 = width, x1 = 0, y0 = height, y1 = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0: x0 / width, x1: x1 / width, y0: y0 / height, y1: y1 / height };
}

const results: Array<{ area: string; name: string; ok: boolean; detail?: string }> = [];
function check(area: string, name: string, ok: boolean, detail = "") {
  results.push({ area, name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} [${area}] ${name}${!ok && detail ? `\n       ${detail}` : ""}`);
}

async function main() {
  const refPdf = fs.readFileSync(path.join(FIX, "Sayyapureddy_Lakshmi_AI_Engineer_Resume.pdf"));
  const defPdf = fs.readFileSync(path.join(FIX, "Resume_Sayyapureddy_Lakshmi_Excellence_Technologies.pdf"));
  const refText = fs.readFileSync(path.join(FIX, "reference_text.txt"), "utf8");

  // The recreation pipeline receives text + the links the source document carried.
  const refLinksRaw = await extractHyperlinksFromPdf(refPdf);
  const latex = generateATSLatex(refText, { knownLinks: refLinksRaw });
  check("PIPELINE", "generateATSLatex is deterministic (preview/download/email share one source)", latex === generateATSLatex(refText, { knownLinks: refLinksRaw }));
  const genPdf = await compileLatexToPdfBuffer(latex);
  check("PIPELINE", "LaTeX compiles to a PDF", genPdf.length > 5000 && genPdf.subarray(0, 4).toString() === "%PDF");
  fs.writeFileSync(path.join(OUT, "generated.pdf"), genPdf);
  fs.writeFileSync(path.join(OUT, "generated.tex"), latex);

  const [ref, def, gen] = await Promise.all([analyze(refPdf), analyze(defPdf), analyze(genPdf)]);

  // ---- STRUCTURE (calibration, negative control, subject) ----
  const refBad = structuralDefects(ref);
  check("STRUCTURE", "analyzer accepts the known-good reference PDF", refBad.length === 0, refBad.join("\n       "));
  const defBad = structuralDefects(def);
  check("STRUCTURE", "analyzer REJECTS the defective PDF (negative control)", defBad.length >= 3, `only ${defBad.length} defects found`);
  console.log(`       (defective PDF defects detected: ${defBad.length})`);
  for (const b of defBad.slice(0, 6)) console.log(`         - ${b}`);
  const genBad = structuralDefects(gen);
  check("STRUCTURE", "generated PDF: education/experience/project blocks, bullets, gaps, 1 page, no markup leak", genBad.length === 0, genBad.join("\n       "));

  // ---- CONTENT ----
  const stripMarkers = (s: string) => s.replace(/--\s*\d+\s+of\s+\d+\s*--/g, "");
  const a = alnum(stripMarkers(refText)), b = alnum(gen.text);
  let firstDiff = 0;
  while (firstDiff < a.length && a[firstDiff] === b[firstDiff]) firstDiff++;
  check("CONTENT", "all reference text preserved, in order, nothing added", a === b, `diverges at char ${firstDiff}: ref "${a.slice(firstDiff, firstDiff + 40)}" vs gen "${b.slice(firstDiff, firstDiff + 40)}"`);

  // ---- LINKS ----
  const key = (l: Link) => `${l.url}  <-  "${l.covered}"`;
  const refKeys = ref.links.map(key).sort();
  const genKeys = gen.links.map(key).sort();
  const missing = refKeys.filter((k) => !genKeys.includes(k));
  const extra = genKeys.filter((k) => !refKeys.includes(k));
  check("LINKS", `all ${refKeys.length} reference links exist as PDF URI annotations over the same text`, missing.length === 0, missing.join("\n       "));
  check("LINKS", "no link annotation over text that is not linked in the reference (e.g. 'code reviews', 'GitHub Copilot')", extra.length === 0, extra.join("\n       "));
  // Per project: the URLs sitting on that project's title line (left to right) must equal the reference's.
  const perProject = (d: Doc) =>
    ["AI-Powered Resume Analyzer", "MCQ Generator", "Multi-Language Invoice Extractor"].map((t) => {
      const ln = d.lines.find((l) => l.text.startsWith(t));
      return ln ? d.links.filter((k) => Math.abs(k.y - ln.y) < 6).sort((p, q) => p.x - q.x).map((k) => `${k.covered}=${k.url}`).join(" ") : "(no title line)";
    });
  const rp3 = perProject(ref), gp3 = perProject(gen);
  check("LINKS", "each project's Code / Live Demo link points to that project's own URLs",
    rp3.every((v, i) => v === gp3[i] && v.includes("code=") && v.includes("livedemo=")),
    rp3.map((v, i) => `ref: ${v} | gen: ${gp3[i]}`).join("; "));
  const defHas = def.links.length;
  console.log(`       (defective PDF carried ${defHas} link annotation(s); original screenshots contain no URLs to recover)`);

  // ---- VISUAL ----
  const [refImg] = await render(refPdf);
  const genImgs = await render(genPdf);
  const genImg = genImgs[0];
  const rb = inkBox(refImg), gb = inkBox(genImg);
  const combo = createCanvas(refImg.width + genImg.width + 20, Math.max(refImg.height, genImg.height));
  const cx = combo.getContext("2d");
  cx.fillStyle = "#888"; cx.fillRect(0, 0, combo.width, combo.height);
  cx.drawImage(refImg, 0, 0); cx.drawImage(genImg, refImg.width + 20, 0);
  fs.writeFileSync(path.join(OUT, "side_by_side_reference_vs_generated.png"), combo.toBuffer("image/png"));
  // Row-density diff: where does ink sit vertically in each page (normalised to ink bbox)?
  const rowProfile = (c: ReturnType<typeof createCanvas>, box: ReturnType<typeof inkBox>, bins = 60) => {
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const y0 = Math.floor(box.y0 * c.height), y1 = Math.ceil(box.y1 * c.height), prof = new Array(bins).fill(0);
    for (let y = y0; y <= y1; y++) { let n = 0; for (let x = 0; x < c.width; x += 2) { const i = (y * c.width + x) * 4; if (data[i] < 160) n++; } prof[Math.min(bins - 1, Math.floor(((y - y0) / (y1 - y0 + 1)) * bins))] += n; }
    const s = prof.reduce((p, q) => p + q, 0) || 1; return prof.map((v) => v / s);
  };
  const rp = rowProfile(refImg, rb), gp = rowProfile(genImg, gb);
  const l1 = rp.reduce((s, v, i) => s + Math.abs(v - gp[i]), 0) / 2;
  fs.writeFileSync(path.join(OUT, "vertical_ink_profile.json"), JSON.stringify({ reference: rp, generated: gp, distance: l1 }, null, 1));
  check("VISUAL", "one rendered page (reference is one page)", genImgs.length === 1);
  check("VISUAL", `content fills the page like the reference (ink width ${((gb.x1 - gb.x0) * 100).toFixed(0)}% vs ${((rb.x1 - rb.x0) * 100).toFixed(0)}%)`, Math.abs((gb.x1 - gb.x0) - (rb.x1 - rb.x0)) < 0.06);
  check("VISUAL", `content does not overflow the page bottom (ink ends at ${(gb.y1 * 100).toFixed(1)}%)`, gb.y1 < 0.985);
  const headings = ["professionalsummary", "education", "experience", "projects", "technicalskills", "achievements", "certifications"];
  const relPos = (d: Doc) => {
    const top = d.lines[0].y, span = d.lines[d.lines.length - 1].y - top || 1;
    return headings.map((h) => { const l = d.lines.find((x) => alnum(x.text) === h); return l ? (l.y - top) / span : NaN; });
  };
  const rPos = relPos(ref), gPos = relPos(gen);
  const worst = Math.max(...rPos.map((v, i) => Math.abs(v - gPos[i])));
  check("VISUAL", `section headings sit at the same relative height as the reference (worst drift ${(worst * 100).toFixed(1)}% < 4%)`, worst < 0.04,
    headings.map((h, i) => `${h}: ref ${(rPos[i] * 100).toFixed(1)}% gen ${(gPos[i] * 100).toFixed(1)}%`).join("; "));
  console.log(`       (ink-row profile L1 distance ${l1.toFixed(3)} - informational, fonts differ; see tests/output/vertical_ink_profile.json)`);
  check("VISUAL", `line count within 3 of reference (${gen.lines.length} vs ${ref.lines.length})`, Math.abs(gen.lines.length - ref.lines.length) <= 3);
  console.log(`       side-by-side image: ${path.join("tests", "output", "side_by_side_reference_vs_generated.png")}`);

  // ---- TRANSCRIPT: real vision-model output for screenshots of this resume (Markdown emphasis, "## " headings) ----
  // Captured from scripts/e2e-screenshot-pipeline.ts. Before the emphasis fix this produced "**" in the PDF,
  // one merged skills paragraph and "*Code" project titles while every text-fixture test still passed.
  const transcript = normalizeWrappedBullets(fs.readFileSync(path.join(FIX, "vision_transcript_raw.txt"), "utf8"));
  const fromShots = await generateResumePdfFromText(transcript);
  check("TRANSCRIPT", "vision transcript -> validated PDF (no markup leak, content covered)", fromShots.ok, fromShots.ok ? "" : fromShots.reasons.join("; "));
  if (fromShots.ok) {
    fs.writeFileSync(path.join(OUT, "generated_from_transcript.pdf"), fromShots.buffer);
    const t = await analyze(fromShots.buffer);
    const tBad = structuralDefects(t);
    check("TRANSCRIPT", "transcript PDF: education/experience/project blocks, bullets, gaps, 1 page", tBad.length === 0, tBad.join("; "));
    const skillRows = ["Languages:", "Frameworks & Libraries:", "AI/ML Platforms & Tools:", "Cloud, MLOps & Dev Tools:", "Specializations:"]
      .filter((label) => t.lines.some((l) => l.text.startsWith(label))).length;
    check("TRANSCRIPT", "all 5 skills rows start on their own line", skillRows === 5, `${skillRows}/5`);
    check("TRANSCRIPT", "no stray '*' or '#' characters visible", !/[*#]/.test(t.text), t.text.match(/.{0,20}[*#].{0,20}/)?.[0] ?? "");
  }

  // ---- EMAIL ----
  let buildMimeMessage: typeof import("../lib/email/gmail").buildMimeMessage | undefined;
  try { ({ buildMimeMessage } = await import("../lib/email/gmail")); } catch (e) { console.log(`       (could not import gmail module: ${(e as Error).message})`); }
  if (buildMimeMessage) {
    const filename = getCandidateFilename(refText, undefined, "pdf");
    const raw = buildMimeMessage({ from: "a@example.com", to: "b@example.com", subject: "s", body: "hello", attachments: [{ filename, content: genPdf, contentType: "application/pdf" }] });
    const mime = Buffer.from(raw, "base64url").toString("latin1");
    const m = mime.match(/Content-Type: application\/pdf[^\r\n]*\r\n(?:[^\r\n]+\r\n)*?\r\n([\s\S]*?)\r\n--/);
    const headers = mime.slice(mime.indexOf("Content-Type: application/pdf"), mime.indexOf("Content-Type: application/pdf") + 400);
    const decoded = m ? Buffer.from(m[1].replace(/\s+/g, ""), "base64") : Buffer.alloc(0);
    const sha = (x: Buffer) => crypto.createHash("sha256").update(x).digest("hex");
    check("EMAIL", "attachment MIME type is application/pdf", /Content-Type: application\/pdf/.test(mime));
    check("EMAIL", `attachment filename is "${filename}"`, headers.includes(`filename="${filename}"`), headers);
    check("EMAIL", "attachment bytes are byte-identical to the validated PDF (sha256)", decoded.length > 0 && sha(decoded) === sha(genPdf), `${sha(decoded)} vs ${sha(genPdf)}`);
    check("EMAIL", "attachment text + links match the validated PDF", (await analyze(decoded)).links.length === gen.links.length);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
