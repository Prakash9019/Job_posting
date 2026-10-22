/**
 * A failed generation must never look like a successful PDF, and one validated artifact must be
 * byte-identical wherever it is stored, served or emailed.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { NextRequest } from "next/server";
import { generateResumePdfFromText, validatePdfArtifact, sha256Hex } from "../lib/ats/pdf-artifact";
import { generateATSLatex, compileLatexToPdfBuffer } from "../lib/ats/tailor";
import { LocalStorageProvider } from "../lib/storage/local";

const FIX = path.join(__dirname, "..", "tests", "fixtures", "lakshmi");
let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? `\n       ${detail}` : ""}`);
  if (!ok) failures++;
}

// 1x1 PNG: what the old fallback would have stored as the "resume"
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function main() {
  const text = fs.readFileSync(path.join(FIX, "reference_text.txt"), "utf8");

  // --- validator rejects everything that is not a complete, relevant PDF ---
  check("validator rejects null", !(await validatePdfArtifact(null)).ok);
  check("validator rejects empty buffer", !(await validatePdfArtifact(Buffer.alloc(0))).ok);
  check("validator rejects a PNG screenshot", !(await validatePdfArtifact(PNG)).ok);
  check("validator rejects garbage bytes", !(await validatePdfArtifact(Buffer.alloc(9000, 7))).ok);

  // --- generation failure modes can never yield ok:true ---
  const failing: Array<[string, (l: string) => Promise<Buffer | null>]> = [
    ["compiler unavailable (null)", async () => null],
    ["compiler returns a raw image", async () => PNG],
    ["compiler returns an HTML error page", async () => Buffer.from("<html>texlive error</html>".repeat(300))],
    ["compiler throws", async () => { throw new Error("network down"); }],
  ];
  for (const [name, compile] of failing) {
    const r = await generateResumePdfFromText(text, { compile });
    check(`generation fails safely: ${name}`, !r.ok, r.ok ? "returned ok:true" : "");
  }
  const tooShort = await generateResumePdfFromText("Jane Doe\nEngineer", { compile: async () => PNG });
  check("generation fails when OCR yields almost no text", !tooShort.ok);

  // --- a valid PDF with the WRONG content (e.g. empty "Candidate Name" template) is rejected ---
  const wrongPdf = await compileLatexToPdfBuffer(generateATSLatex("Someone Else\nsomeone@example.com\nEXPERIENCE\nChef\nKitchen Co Jan 2020 - Present\n• Cooked many different delicious meals for lots of hungry customers every single day."));
  check("fixture: unrelated PDF compiled", !!wrongPdf && wrongPdf.length > 3000);
  const wrong = await generateResumePdfFromText(text, { compile: async () => wrongPdf });
  check("generation rejects a valid PDF whose content does not match the resume", !wrong.ok, wrong.ok ? "accepted wrong content" : "");

  // --- real compile succeeds and is validated ---
  const good = await generateResumePdfFromText(text);
  check("real generation succeeds with a validated 1-page PDF", good.ok && good.pages === 1, good.ok ? "" : good.reasons.join("; "));
  if (!good.ok) process.exit(1);
  check("generation is rejected when an expected link is absent from the PDF", !(await validatePdfArtifact(good.buffer, { expectedText: text, expectedUrls: ["https://not-in-pdf.example.com/x"] })).ok);

  // --- one artifact, identical everywhere ---
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-"));
  const storage = new LocalStorageProvider(dir);
  await storage.saveFile("resumes/u1/revision-1.pdf", good.buffer, "application/pdf");
  const stored = await storage.readFile("resumes/u1/revision-1.pdf");
  check("stored bytes == validated bytes (sha256)", sha256Hex(stored) === good.sha256);

  const { buildMimeMessage } = await import("../lib/email/gmail");
  const raw = buildMimeMessage({ from: "a@x.com", to: "b@x.com", subject: "s", body: "b", attachments: [{ filename: "Resume_X.pdf", content: stored, contentType: "application/pdf" }] });
  const mime = Buffer.from(raw, "base64url").toString("latin1");
  const m = mime.match(/Content-Type: application\/pdf[^\r\n]*\r\n(?:[^\r\n]+\r\n)*?\r\n([\s\S]*?)\r\n--/);
  const emailed = m ? Buffer.from(m[1].replace(/\s+/g, ""), "base64") : Buffer.alloc(0);
  check("emailed attachment == validated bytes (sha256)", sha256Hex(emailed) === good.sha256);
  check("emailed attachment has correct filename + MIME", /filename="Resume_X\.pdf"/.test(mime) && /Content-Type: application\/pdf/.test(mime));
  fs.rmSync(dir, { recursive: true, force: true });

  // --- authorization: the compile/download endpoint rejects anonymous callers before doing any work ---
  const { POST } = await import("../app/api/ats/latex-pdf/route");
  const res = await POST(new NextRequest("http://localhost/api/ats/latex-pdf", { method: "POST", body: JSON.stringify({ latexCode: "\\documentclass{article}\\begin{document}x\\end{document}" }) }));
  check("latex-pdf rejects an unauthenticated request with 401", res.status === 401, `status ${res.status}`);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll artifact-integrity checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
