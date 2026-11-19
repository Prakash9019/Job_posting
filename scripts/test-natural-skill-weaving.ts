import "../lib/ats/pdf-polyfill";
import fs from "fs";
import { PDFParse } from "pdf-parse";
import { runAllRemediationPasses, generateATSLatex, compileLatexToPdfBuffer } from "../lib/ats/tailor";

const src = process.argv[2];
const jd = `Full Stack Software Engineer
Requirements:
- TypeScript
- Next.js
- Tailwind
- HTML
- CSS
- PostgreSQL
- Docker
- REST
`;
(async () => {
  const buf = fs.readFileSync(src);
  const p0 = new PDFParse({ data: buf });
  const text = (await p0.getText()).text;
  await p0.destroy();
  const r = runAllRemediationPasses({ text, jobText: jd });
  console.log("REPORT", JSON.stringify(r.skillReport ?? (r as any).skillReport));
  const pdf = await compileLatexToPdfBuffer(generateATSLatex(r.optimizedText));
  if (!pdf) throw new Error("no pdf");
  fs.writeFileSync("tests/output/natural-weave.pdf", pdf);
  const p = new PDFParse({ data: pdf });
  const out = (await p.getText()).text;
  await p.destroy();
  const lines = out.split("\n");
  console.log("--- PDF lines naming target skills ---");
  for (const l of lines) if (/javascript|typescript|\brest|\bcss|docker|leveraging/i.test(l)) console.log(l);
  console.log("--- EXPERIENCE SECTION ---"); console.log(out.slice(out.indexOf("WORK EXPERIENCE"), out.indexOf("EDUCATION")));
  console.log("leveraging count:", (out.match(/leveraging/gi) || []).length);
})();
