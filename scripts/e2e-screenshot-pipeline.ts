/**
 * LIVE end-to-end run of the real screenshot pipeline (needs GEMINI_API_KEY + network; not part of `npm test`).
 *
 * The original Lakshmi screenshots are not available, so this DERIVES screenshots from the reference PDF:
 * page 1 is rendered to an image and cut into two stacked slices (to exercise multi-image ordering).
 * Slices -> transcribeMultipleDocumentsWithAI (real vision model) -> normalizeWrappedBullets ->
 * generateResumePdfFromText (LaTeX + compile + validation) -> structural comparison with the reference.
 *
 * This is NOT the original-input end-to-end test; it only proves the pipeline against an image of the
 * reference. Results are written to tests/output/e2e/.
 */
import * as fs from "fs";
import * as path from "path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { transcribeMultipleDocumentsWithAI } from "../lib/ats/parse";
import { normalizeWrappedBullets } from "../lib/ats/scoring";
import { generateResumePdfFromText } from "../lib/ats/pdf-artifact";

const OUT = path.join(__dirname, "..", "tests", "output", "e2e");
fs.mkdirSync(OUT, { recursive: true });
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  const ref = fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "lakshmi", "Sayyapureddy_Lakshmi_AI_Engineer_Resume.pdf"));
  const refText = fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "lakshmi", "reference_text.txt"), "utf8");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(ref) }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 2.2 });
  const full = createCanvas(vp.width, vp.height);
  const ctx = full.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, vp.width, vp.height);
  // @ts-expect-error napi canvas context is structurally compatible
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  // Cut at the blank pixel row nearest the middle so no text line is sliced
  const data = ctx.getImageData(0, 0, full.width, full.height).data;
  const rowBlank = (y: number) => { for (let x = 0; x < full.width; x += 2) { if (data[(y * full.width + x) * 4] < 200) return false; } return true; };
  let cut = Math.floor(full.height / 2);
  for (let d = 0; d < 200; d++) { if (rowBlank(cut + d)) { cut += d; break; } if (rowBlank(cut - d)) { cut -= d; break; } }
  const slices = [[0, cut], [cut, full.height]].map(([y0, y1], i) => {
    const c = createCanvas(full.width, y1 - y0);
    c.getContext("2d").drawImage(full, 0, y0, full.width, y1 - y0, 0, 0, full.width, y1 - y0);
    const buf = c.toBuffer("image/png");
    fs.writeFileSync(path.join(OUT, `screenshot_${i + 1}.png`), buf);
    return { buffer: buf, mimeType: "image/png" };
  });

  console.log(`Sliced reference into ${slices.length} screenshots (cut at y=${cut}); calling the real transcriber...`);
  const raw = await transcribeMultipleDocumentsWithAI(slices);
  fs.writeFileSync(path.join(OUT, "transcript_raw.txt"), raw);
  const text = normalizeWrappedBullets(raw);
  fs.writeFileSync(path.join(OUT, "transcript_normalized.txt"), text);

  const result = await generateResumePdfFromText(text);
  fs.writeFileSync(path.join(OUT, "generated.tex"), result.latex);
  if (!result.ok) {
    console.log("RESULT: pipeline REFUSED to produce a PDF:", result.reasons);
    process.exit(2);
  }
  fs.writeFileSync(path.join(OUT, "generated.pdf"), result.buffer);

  // Content comparison on word level (OCR may differ in punctuation / typographic characters)
  const words = (s: string) => alnum(s).length;
  const refWords = new Set(refText.toLowerCase().match(/[a-z0-9]{4,}/g) || []);
  const genAl = alnum(text);
  const missing = [...refWords].filter((w) => !genAl.includes(w));
  console.log(`pages=${result.pages} sha256=${result.sha256.slice(0, 16)}… transcript chars=${words(text)} vs ref ${words(refText)}`);
  console.log(`reference words missing from transcript: ${missing.length}/${refWords.size}${missing.length ? " -> " + missing.slice(0, 25).join(", ") : ""}`);
  console.log(`order check: ${["Vignan", "Julley", "AI-Powered Resume Analyzer", "MCQ Generator", "Languages", "Kaggle", "CCNA"].map((k) => text.indexOf(k)).join(" < ")}`);
  console.log(`markdown links in transcript: ${(text.match(/\]\(/g) || []).length} (reference screenshots carry no URLs, so 0 is expected)`);
  console.log("Outputs: tests/output/e2e/{screenshot_*.png, transcript_*.txt, generated.tex, generated.pdf}");
}

main().catch((e) => { console.error(e); process.exit(1); });
