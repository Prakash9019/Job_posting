/**
 * Verify that \resumeSubheading arg order is correct:
 * #1=JobTitle #2=Location #3=Company #4=Date
 * in ALL places that generate or patch LaTeX.
 */
import { readFileSync } from "fs";

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// ─── 1. output_tailored_surya.tex ───────────────────────────────────────────
console.log("\n=== 1. output_tailored_surya.tex: work experience format ===");

const texContent = readFileSync("output_tailored_surya.tex", "utf-8");

// Macro definition: Row 2 should NOT be \textit{\small #3}
assert(
  "Macro Row 2: Company uses {\\small #3} not \\textit{\\small #3}",
  !texContent.includes("\\textit{\\small #3}") && texContent.includes("{\\small #3}"),
  texContent.includes("\\textit{\\small #3}") ? "Still has italic Row 2" : ""
);

// JulleyOnline entry: Job Title must be Row 1 (bold) not Row 2 (small)
assert(
  "Julley: 'Platform Engineer' is Row 1 (first arg)",
  texContent.includes("{Platform Engineer}{India}"),
  "Job title should be first arg, not second"
);
assert(
  "Julley: 'JulleyOnline Private Limited' is Row 2 (third arg)",
  texContent.includes("{JulleyOnline Private Limited}{April 2026 -- September 2026}"),
  "Company should be third arg"
);

// Vertx entry: Job Title must be Row 1
assert(
  "Vertx: 'Founding Full-Stack Engineer' is Row 1 (first arg)",
  texContent.includes("{Founding Full-Stack Engineer}{Remote}"),
  "Job title should be first arg"
);
assert(
  "Vertx: 'Vertx' is Row 2 (third arg, company)",
  texContent.includes("{Vertx}{August 2024 -- February 2026}"),
  "Company should be third arg"
);

// Education entry: Institution is Row 1 (bold) - correct
assert(
  "Education: Vignan's is Row 1 (institution bold)",
  texContent.includes("{Vignan's Institute Of Information Technology}{Visakhapatnam, India}"),
  "Institution should be first arg"
);
assert(
  "Education: Degree is Row 2 third arg",
  texContent.includes("{B.Tech in Computer Science and Engineering -- CGPA: 8.9/10.0}{2021 -- 2025}"),
  "Degree should be third arg"
);

// No Company in Row 1 position (old bug)
assert(
  "No 'JulleyOnline' in Row 1 bold position",
  !texContent.includes("{JulleyOnline Private Limited India}{}"),
  "Company was wrongly in bold Row 1"
);
assert(
  "No 'Vertx Remote' in Row 1 bold position",
  !texContent.includes("{Vertx Remote}{}"),
  "Company was wrongly in bold Row 1"
);

// ─── 2. tailor.ts generateLatexFromCanonical template ───────────────────────
console.log("\n=== 2. tailor.ts: template literal macro definition ===");

const tailorContent = readFileSync("lib/ats/tailor.ts", "utf-8");

// Should have {\\small #3} not \\textit{\\small #3} in template literal
assert(
  "Template literal: Row 2 uses {\\\\small #3}",
  tailorContent.includes("{\\\\small #3} & \\\\textit{\\\\small #4}"),
  tailorContent.includes("\\\\textit{\\\\small #3}") ? "Still has italic Row 2 in template" : "Pattern not found"
);

// Job title arg order in generateLatexFromCanonical call
assert(
  "generateLatexFromCanonical: role is #1 (first arg, left bold)",
  tailorContent.includes("formatLatexLine(role, allKnownLinks)}}{${formatLatexLine(loc"),
  "Role should be first argument"
);
assert(
  "generateLatexFromCanonical: company is #3 (third arg, left row 2)",
  tailorContent.includes("formatLatexLine(company, allKnownLinks)}}{${formatLatexLine(dateRange"),
  "Company should be third argument"
);

// Invariant doc comment present
assert(
  "INVARIANT comment documents arg order",
  tailorContent.includes("#1 = Job Title") && tailorContent.includes("#3 = Company"),
  "Invariant comment missing"
);

// ─── 3. apply-latex.ts: optimizeLatexGeometryForOnePage macro ───────────────
console.log("\n=== 3. apply-latex.ts: geometry optimizer macro ===");

const applyContent = readFileSync("lib/ats/apply-latex.ts", "utf-8");

// Should have {\\small #3} not \\textit{\\small #3}
assert(
  "Geometry optimizer: Row 2 uses {\\\\small #3}",
  applyContent.includes("{\\\\small #3} & \\\\textit{\\\\small #4}"),
  applyContent.includes("\\\\textit{\\\\small #3}") ? "Still has italic Row 2" : "Pattern not found"
);

// Auto-normalisation guard in patchLatexTemplateDeterministically
assert(
  "patchLatexTemplateDeterministically: normalises old italic Row 2",
  applyContent.includes("\\\\textit\\{\\\\small #3\\}") && applyContent.includes("{\\\\small #3} & \\\\textit{\\\\small #4}"),
  "Auto-normalisation regex missing"
);

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log("🎉 ALL TESTS PASSED — Work Experience format is correct everywhere!");
} else {
  console.log(`⚠️  ${failed} test(s) failed.`);
  process.exit(1);
}

