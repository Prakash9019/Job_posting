import assert from "node:assert/strict";
import { extractResumeText, isReadableResumeText } from "../lib/ai/resume";

async function main() {
  const evidence = "Sample Engineer built a React dashboard and Python API for a task management application.";
  const stream = `BT /F1 12 Tf 50 700 Td (${evidence}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const text = await extractResumeText(Buffer.from(pdf), "application/pdf");
  assert.ok(text.includes(evidence), "PDF parser must return candidate evidence");
  assert.ok(isReadableResumeText(text));
  assert.equal(isReadableResumeText(pdf), false, "Raw PDF internals must never reach the writer");
  await assert.rejects(extractResumeText(Buffer.from("broken pdf"), "application/pdf"), /Could not read/);
  await assert.rejects(extractResumeText(Buffer.from("too short"), "text/plain"), /No readable/);
  await assert.rejects(extractResumeText(Buffer.from(pdf), "text/plain"), /No readable/);
  await assert.rejects(extractResumeText(Buffer.from(evidence), "application/octet-stream"), /Unsupported/);
  assert.equal(await extractResumeText(Buffer.from(evidence), "text/plain"), evidence);
  console.log("PASS: PDF evidence extraction, plain text, corrupt PDF rejection, raw PDF rejection, short input and unsupported format rejection.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
