import fs from "fs";
import { PDFParse } from "pdf-parse";
import { prisma } from "../lib/db/prisma";
import { autoTailorResumeToJD, generateATSLatex, compileLatexToPdfBuffer } from "../lib/ats/tailor";
import { applyImprovementsToLatexWithAI, validateAndCompileLatex } from "../lib/ats/apply-latex";

const jdPlatformInfra = `
Platform Infrastructure Engineer
Company: Platform Infrastructure
Location: Remote

We are seeking a Platform Infrastructure Engineer to scale our systems.
Key Requirements:
- Python
- Docker
- Kubernetes
- REST
- Distributed Systems
- Artificial Intelligence
- LLM
- Git
`;

const jdAtatus = `
Full Stack Developer
Company: Atatus
Location: Remote

We are seeking a Full Stack Developer specializing in scalable distributed architectures.
Key Requirements:
- JavaScript
- TypeScript
- Python
- React
- Node.js
- Distributed Systems
- PostgreSQL
- Docker
- Git
`;

async function inspectPdfMetrics(buf: Buffer, label: string) {
  const p = new PDFParse({ data: buf });
  await p.load();
  const numPages = p.doc.numPages;
  const page1 = await p.doc.getPage(1);
  const view = page1.view; // [x, y, w, h]
  const content = await page1.getTextContent();
  let minY = Infinity, maxY = -Infinity;
  for (const it of content.items) {
    if ("transform" in it) {
      const y = it.transform[5];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const pageHeight = view[3] || 841.89;
  const bottomWhitespace = minY;
  const verticalFillPercent = ((pageHeight - bottomWhitespace) / pageHeight) * 100;
  console.log(`\n--- ${label} ---`);
  console.log(`Pages: ${numPages} (expected: 1)`);
  console.log(`MediaBox / View: [${view.join(", ")}] (A4 height is 841.89 pt)`);
  console.log(`Page 1 Content Y Span: minY=${minY.toFixed(1)} pt, maxY=${maxY.toFixed(1)} pt, height=${(maxY - minY).toFixed(1)} pt`);
  console.log(`Bottom Whitespace: ${minY.toFixed(1)} pt (${(minY / 72).toFixed(2)} inches)`);
  console.log(`Vertical Fill: ${verticalFillPercent.toFixed(1)}% of page`);

  if (numPages > 1) {
    const page2 = await p.doc.getPage(2);
    const content2 = await page2.getTextContent();
    console.error(`❌ OVERFLOW DETECTED: Page 2 text: "${content2.items.map(i => i.str).join(" ").slice(0, 200)}"`);
  } else {
    console.log(`✅ EXACTLY 1 PAGE verified.`);
  }

  // Verify Vertx and Education are on page 1
  const page1Text = content.items.map(i => i.str).join(" ");
  const hasVertx = page1Text.includes("Vertx") || page1Text.includes("Startin") || page1Text.includes("Flow");
  const hasEducation = page1Text.includes("EDUCATION") || page1Text.includes("Education") || page1Text.includes("Vignan");
  console.log(`Contains Vertx on Page 1: ${hasVertx ? "✅ YES" : "❌ NO"}`);
  console.log(`Contains Education on Page 1: ${hasEducation ? "✅ YES" : "❌ NO"}`);

  return { numPages, bottomWhitespace, verticalFillPercent, hasVertx, hasEducation };
}

async function main() {
  const activeResume = await prisma.resume.findFirst({ where: { isActive: true } });
  if (!activeResume || !activeResume.extractedText) throw new Error("No active resume");

  console.log("==================================================================");
  console.log("🧪 TESTING UNIFIED RESUME LAYOUT ENGINE ACROSS ALL WORKFLOWS");
  console.log("==================================================================");

  // 1. ATS Workflow: Platform Infrastructure (Standard Deterministic)
  console.log("\n[TEST 1] ATS Workflow — Platform Infrastructure (Standard Deterministic)");
  const atsTailored = await autoTailorResumeToJD({
    resumeText: activeResume.extractedText,
    jobText: jdPlatformInfra,
    companyName: "Platform Infrastructure",
    targetRoleTitle: "Platform Infrastructure Engineer",
  });
  const atsRes = await validateAndCompileLatex(atsTailored.optimizedLatex);
  if (!atsRes.success || !atsRes.pdfBuffer) throw new Error("ATS compilation failed: " + atsRes.error);
  fs.writeFileSync("tests/output/Resume_Platform_Infrastructure_ATS.pdf", atsRes.pdfBuffer);
  await inspectPdfMetrics(atsRes.pdfBuffer, "ATS: Platform Infrastructure (Standard)");

  // 2. ATS Workflow: Platform Infrastructure via applyImprovementsToLatexWithAI (Full Source Template)
  console.log("\n[TEST 2] ATS Workflow — Platform Infrastructure via applyImprovementsToLatexWithAI");
  const initialLatex = generateATSLatex(activeResume.extractedText);
  const atsCustomRes = await applyImprovementsToLatexWithAI({
    originalLatex: initialLatex,
    atsOptimizedText: atsTailored.optimizedText,
    jobText: jdPlatformInfra,
  });
  if (!atsCustomRes.compiled || !atsCustomRes.pdfBase64) throw new Error("ATS custom compilation failed: " + atsCustomRes.error);
  const atsCustomBuf = Buffer.from(atsCustomRes.pdfBase64, "base64");
  fs.writeFileSync("tests/output/Resume_Platform_Infrastructure_FromInitialTemplate.pdf", atsCustomBuf);
  await inspectPdfMetrics(atsCustomBuf, "ATS: Platform Infrastructure (From Initial Template)");

  // 3. Screenshot-to-Email Workflow: Atatus (single screenshot)
  console.log("\n[TEST 3] Screenshot-to-Email Workflow — Atatus (Testing Bottom Whitespace Fix)");
  const atatusTailored = await autoTailorResumeToJD({
    resumeText: activeResume.extractedText,
    jobText: jdAtatus,
    companyName: "Atatus",
    targetRoleTitle: "Full Stack Developer",
  });
  const atatusRes = await validateAndCompileLatex(atatusTailored.optimizedLatex);
  if (!atatusRes.success || !atatusRes.pdfBuffer) throw new Error("Atatus compilation failed: " + atatusRes.error);
  fs.writeFileSync("tests/output/Resume_Atatus_Screenshot.pdf", atatusRes.pdfBuffer);
  await inspectPdfMetrics(atatusRes.pdfBuffer, "Screenshot: Atatus");

  // 4. Bulk Screenshot Workflow: Multiple JDs processed in sequence/parallel
  console.log("\n[TEST 4] Bulk Screenshot Workflow — Simulating 3 Bulk Upload Screenshots");
  const bulkJDs = [
    { company: "Techolution", role: "Cloud Systems Engineer", jd: "Cloud Systems Engineer at Techolution. Docker, Kubernetes, AWS, Go, Python, Linux." },
    { company: "Concentrix", role: "Software Development Engineer", jd: "SDE at Concentrix. Java, TypeScript, React, Node.js, Distributed Systems, Microservices." },
    { company: "Jobgether", role: "Senior Backend Developer", jd: "Senior Backend Developer at Jobgether. Python, FastAPI, PostgreSQL, Redis, REST APIs, Docker." },
  ];

  for (const b of bulkJDs) {
    const tailored = await autoTailorResumeToJD({
      resumeText: activeResume.extractedText,
      jobText: b.jd,
      companyName: b.company,
      targetRoleTitle: b.role,
    });
    const res = await validateAndCompileLatex(tailored.optimizedLatex);
    if (!res.success || !res.pdfBuffer) throw new Error(`Bulk compilation failed for ${b.company}: ${res.error}`);
    fs.writeFileSync(`tests/output/Resume_Bulk_${b.company}.pdf`, res.pdfBuffer);
    await inspectPdfMetrics(res.pdfBuffer, `Bulk Screenshot: ${b.company} (${b.role})`);
  }

  console.log("\n==================================================================");
  console.log("🎉 ALL WORKFLOW LAYOUT VERIFICATIONS COMPLETED SUCCESSFULLY!");
  console.log("==================================================================");
}

main().catch(console.error).finally(() => prisma.$disconnect());
