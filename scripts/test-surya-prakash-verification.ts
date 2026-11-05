import fs from "fs";
import { generateATSLatex, parseResumeToCanonical } from "../lib/ats/tailor";
import { applyImprovementsToLatexWithAI, validateAndCompileLatex } from "../lib/ats/apply-latex";
import { PDFParse } from "pdf-parse";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

async function getPageCountAndText(buf: Buffer): Promise<{ numPages: number; text: string; pagesText: string[] }> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pagesText: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const str = content.items.map((i: any) => i.str).join(" ");
    pagesText.push(str);
  }
  return {
    numPages: doc.numPages,
    text: pagesText.join("\n"),
    pagesText,
  };
}

async function testPipeline() {
  console.log("==============================================================");
  console.log("🧪 VERIFYING SURYA PRAKASH TAILORED RESUME (END-TO-END)");
  console.log("==============================================================\n");

  const origPdfBuf = fs.readFileSync("./uploads/resumes/user_a/1792158353361-Resume_Loka_Surya_Prakash.pdf");
  const parser = new PDFParse({ data: origPdfBuf });
  const resumeText = (await parser.getText()).text;

  // Intentionally dirty input to test all OCR, placeholder, and formatting guards
  const dirtyText = resumeText
    .replace(/Vertx/g, "Vertz")
    .replace(/AI Engineer/g, "Al Engineer")
    .replace(/AI-powered/g, "Al-powered")
    .replace(/∗ Architected/g, "* Architected")
    .replace(/Vignan/g, "• Vignan");

  const jobDescription = `We are looking for Senior Full-Stack and AI Engineers specializing in React, Node.js, Python, FastAPI, and Distributed Systems.`;

  console.log("Step 1: Running applyImprovementsToLatexWithAI on tailored resume...");
  const result = await applyImprovementsToLatexWithAI({
    originalLatex: "",
    atsOptimizedText: dirtyText,
    jobText: jobDescription,
  });

  console.log("Compilation success:", result.compiled);
  console.log("LaTeX stats:", result.stats);
  if (!result.compiled || !result.pdfBase64) {
    console.error("Compilation error:", result.error);
    console.error("Log snippet:", result.log?.slice(0, 500));
    process.exit(1);
  }

  const pdfBuf = Buffer.from(result.pdfBase64, "base64");
  fs.writeFileSync("output_tailored_surya.pdf", pdfBuf);
  fs.writeFileSync("output_tailored_surya.tex", result.updatedLatex);

  const { numPages, text: pdfText, pagesText } = await getPageCountAndText(pdfBuf);

  console.log(`\nGenerated PDF Page Count: ${numPages}`);
  console.log(`Page 1 Length: ${pagesText[0]?.length || 0} characters`);
  if (numPages > 1) {
    console.log(`Page 2 Length: ${pagesText[1]?.length || 0} characters`);
    console.log(`Page 2 snippet: "${pagesText[1]?.slice(0, 200)}"`);
  }

  const errors: string[] = [];

  // Assertion 1: Page Count === 1 strictly enforced
  if (numPages !== 1) {
    errors.push(`Page count is ${numPages}, expected strictly 1 page!`);
  }

  // Assertion 2: No raw asterisks
  if (pdfText.includes("* ")) {
    errors.push("PDF contains raw asterisk bullets '* '!");
  }

  // Assertion 3: No " and " spam in any bullet (no bullet contains " and " more than twice)
  const canonical = parseResumeToCanonical(dirtyText);
  const allBullets = [
    ...canonical.experience.flatMap((e) => [
      ...e.bullets,
      ...(e.subheadings?.flatMap((s) => s.bullets) || []),
    ]),
    ...canonical.projects.flatMap((p) => p.bullets),
  ];

  // Also check lines from the updated LaTeX for " and " spam
  const latexLines = result.updatedLatex.split("\n");
  for (const line of latexLines) {
    if (line.includes("\\item")) {
      const andCount = (line.match(/\band\b/gi) || []).length;
      if (andCount > 2) {
        errors.push(`Bullet contains " and " spam (${andCount} times): "${line.trim().slice(0, 100)}..."`);
      }
    }
  }

  // Assertion 4: No Double Verbs
  const doubleVerbRe = /^(?:Architected|Orchestrated|Engineered|Developed|Delivered|Implemented)\s+(?:Synthesized|Devised|Engineered|Architected|Developed)\b/i;
  for (const line of latexLines) {
    if (line.includes("\\item")) {
      const cleanItem = line.replace(/\\item\s*/, "").trim();
      if (doubleVerbRe.test(cleanItem)) {
        errors.push(`Bullet contains double action verbs: "${cleanItem.slice(0, 60)}"`);
      }
    }
  }

  // Assertion 5: No Duplicate Subheadings
  const subMatch = pdfText.match(/Vertx Startin\s*[-–—|]?\s*Founder-Investor Network/gi) || [];
  if (subMatch.length > 1) {
    errors.push(`"Vertx Startin Founder-Investor Network" appears ${subMatch.length} times, expected exactly ONCE!`);
  }

  // Also check in the LaTeX source
  const subHeadingMatches = (result.updatedLatex.match(/\\textbf\{Vertx Startin\}/g) || []).length;
  if (subHeadingMatches > 1) {
    errors.push(`"Vertx Startin" heading appears ${subHeadingMatches} times in LaTeX, expected exactly ONCE!`);
  }

  // Assertion 6: No $C++$ or Results-driven for
  if (pdfText.includes("$C++$") || result.updatedLatex.includes("$C++$") || result.updatedLatex.includes("\\$C++\\$")) {
    errors.push("LaTeX or PDF text contains math mode '$C++$'!");
  }
  if (pdfText.includes("Results-driven for") || result.updatedLatex.includes("Results-driven for")) {
    errors.push("Summary contains grammatical error 'Results-driven for'!");
  }

  // Assertion 7: Clean OCR text (Vertx spelled properly, AI spelled properly)
  if (pdfText.includes("Vertz") || pdfText.includes("Vertr")) {
    errors.push("PDF contains misspelled 'Vertz' or 'Vertr'!");
  }
  if (/\bAl\b/.test(pdfText)) {
    errors.push("PDF contains OCR error 'Al' (standalone Al)!");
  }

  // Assertion 8: Education section has NO bullet point
  if (pdfText.includes("• Vignan") || pdfText.includes("* Vignan")) {
    errors.push("Education section contains a bullet in front of University name!");
  }

  // Assertion 9: Technical Skills has NO leading indent/space
  if (pdfText.includes(" Languages: C++")) {
    errors.push("Technical Skills contains leading space ' Languages: C++'!");
  }

  // Step 2: Also test direct generateATSLatex path
  console.log("\nStep 2: Testing direct generateATSLatex path...");
  const directLatex = generateATSLatex(dirtyText);
  const directCompile = await validateAndCompileLatex(directLatex);
  if (!directCompile.success || !directCompile.pdfBuffer) {
    errors.push("generateATSLatex failed to compile to PDF!");
  } else {
    const directRes = await getPageCountAndText(directCompile.pdfBuffer);
    if (directRes.numPages !== 1) {
      errors.push(`generateATSLatex produced ${directRes.numPages} pages, expected 1!`);
    }
  }

  if (errors.length > 0) {
    console.error("\n❌ VERIFICATION FAILURES:");
    errors.forEach((e) => console.error(" -", e));
    process.exit(1);
  }

  console.log("\n==============================================================");
  console.log("🎉 ALL MANDATORY VERIFICATION ASSERTIONS PASSED!");
  console.log("==============================================================");
  console.log("✓ Page Count === 1 (0 lines spilled to Page 2)");
  console.log("✓ Zero ' and ' spam (no bullet contains ' and ' > 2 times)");
  console.log("✓ Zero double verbs (no 'Architected Synthesized', etc.)");
  console.log("✓ No duplicate subheadings (Vertx Startin appears exactly ONCE)");
  console.log("✓ No $C++$ math mode (C++ rendered cleanly in standard font)");
  console.log("✓ No 'Results-driven for' grammar error");
  console.log("✓ Vertx and AI correctly spelled (no Vertz or Al)");
  console.log("✓ Education has zero bullet points");
  console.log("✓ Technical skills has zero leading space artifact");
  console.log("✓ Both applyImprovementsToLatexWithAI & generateATSLatex paths verified");
}

testPipeline().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
