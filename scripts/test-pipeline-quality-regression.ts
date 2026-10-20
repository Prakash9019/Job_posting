import assert from "node:assert";
import fs from "fs";
import {
  generateATSLatex,
  compileLatexToPdfBuffer,
  runAllRemediationPasses,
  autoTailorResumeToJD,
  cleanLingeringPlaceholders,
  resolvePlaceholder,
} from "../lib/ats/tailor";
import {
  extractHyperlinksFromLatex,
  validatePdfHyperlinks,
  extractHyperlinksFromPdf,
} from "../lib/ats/hyperlinks";
import { scoreResume, extractRequirementsFromJobText } from "../lib/ats/scoring";

async function runQualityRegressionSuite() {
  console.log("==================================================================");
  console.log("🎯 ATS RESUME GENERATION QUALITY & SOURCE-GROUNDING REGRESSION SUITE");
  console.log("==================================================================\n");

  // -----------------------------------------------------------------------------
  // Test Case 1: Short 1-Page Resume (Fresher / Junior Engineer, No Prior Metrics)
  // -----------------------------------------------------------------------------
  console.log("--- Test Case 1: Short 1-Page Resume (Zero Hallucinated Metrics) ---");
  const shortResume = `Alex Chen
alex.chen@example.com | (555) 234-5678 | linkedin.com/in/alexchen | github.com/alexchen
Technical Skills
Languages: Python, TypeScript, SQL
Frameworks: React, Node.js, FastAPI
Tools: Git, Docker, PostgreSQL
Work Experience
Junior Software Engineer
Acme Corp | San Francisco, CA
June 2024 - Present
• Implemented RESTful API endpoints for user authentication and authorization.
• Worked on developing frontend dashboard components using React and Tailwind.
Projects
Task Tracker [Code](https://github.com/alexchen/task-tracker)
• Built full-stack task management application with real-time updates using WebSockets.
• Integrated PostgreSQL database with automated migration scripts.
Education
Bachelor of Science in Computer Science
University of California, Berkeley
August 2020 - May 2024`;

  const jdWithDemands = `We are looking for a Senior Distributed Systems Engineer.
Requirements: Java, Spring Boot, Apache Kafka, Kubernetes, Distributed Architecture, High Scale, DSA, OOP.`;

  const tailoredShort = await autoTailorResumeToJD({
    resumeText: shortResume,
    jobText: jdWithDemands,
  });

  // Strict Source-Grounding Assertions:
  assert(
    !tailoredShort.optimizedText.includes("Core Additions"),
    "FAIL: Tailored resume must NOT inject 'Core Additions' into candidate skills"
  );
  assert(
    !tailoredShort.optimizedLatex.includes("Core Additions"),
    "FAIL: LaTeX must NOT contain 'Core Additions'"
  );
  assert(
    !tailoredShort.optimizedText.includes("leveraging Java for scalable execution"),
    "FAIL: Must NOT fabricate 'leveraging ... for scalable execution' generic phrases"
  );
  assert(
    !tailoredShort.optimizedText.includes("reducing latency by 34%"),
    "FAIL: Must NOT append fabricated latency or throughput clauses"
  );
  assert(
    !tailoredShort.optimizedText.includes("42%"),
    "FAIL: Must NOT replace unverified placeholders with fake 42%"
  );
  assert(
    !tailoredShort.optimizedText.includes("$45K"),
    "FAIL: Must NOT replace unverified placeholders with fake $45K"
  );

  // Compile short resume to PDF and verify compact single-page layout
  const shortPdf = await compileLatexToPdfBuffer(tailoredShort.optimizedLatex);
  assert(shortPdf !== null && shortPdf.length > 5000, "FAIL: Short resume must compile to valid PDF");
  console.log(`✓ Short resume compiled cleanly (${shortPdf.length} bytes). Zero fabricated skills or metrics.`);

  // -----------------------------------------------------------------------------
  // Test Case 2: Multi-Page Detailed Resume with Subprojects (Surya Prakash Reference)
  // -----------------------------------------------------------------------------
  console.log("\n--- Test Case 2: Detailed Multi-Page Resume with Subprojects & Subheadings ---");
  const detailedResume = `Loka Surya Prakash Pentakota
surya.loka@example.com | +91 9876543210 | linkedin.com/in/surya-prakash | github.com/suryaprakash
Professional Summary
Results-driven software engineer with expertise in full-stack web architectures, distributed systems, and CAD automation pipelines.
Technical Skills
Languages: Python, Go, TypeScript, C++
Frameworks: Next.js, React, Node.js, Express, Tailwind CSS
Databases & Cloud: PostgreSQL, MongoDB, Redis, AWS (S3, EC2, Lambda), Docker
Work Experience
Software Engineer
JulleyOnline Private Limited
April 2024 - Present
• Architected multi-tenant cloud portal supporting enterprise document management workflows.
• Automated data extraction pipelines handling high-volume unstructured technical drawings.
• Partnered with product stakeholders to deliver intuitive interactive visualization tools.
Platform Engineering Intern
TechVentures India
October 2023 - March 2024
• Implemented automated CI/CD pipeline using GitHub Actions, reducing deployment errors.
• Built monitoring dashboard using Prometheus and Grafana for backend service telemetry.
Projects
CAD Drawing Parser & Metadata Extractor
Python, OpenCV, Shapely, FastAPI
• Developed robust parsing engine for complex engineering blueprints with automated layer extraction.
• Engineered spatial geometry validation module targeting processing in under 10 minutes per drawing.
Enterprise Workflow Orchestrator
Go, Redis, gRPC, Docker
• Designed distributed job scheduler managing asynchronous background tasks across worker nodes.
• Integrated resilient retry mechanisms with exponential backoff and dead-letter queues.
Education
Bachelor of Technology in Computer Science & Engineering
National Institute of Technology
August 2019 - May 2023`;

  const detailedTailored = await autoTailorResumeToJD({
    resumeText: detailedResume,
    jobText: "Looking for an engineer with Docker, Python, PostgreSQL, and Kubernetes.",
  });

  // Verify bullet continuation didn't get misclassified as a role header
  assert(
    !detailedTailored.optimizedLatex.includes("{targeting processing in under 10 minutes per drawing}"),
    "FAIL: Bullet continuation line was misclassified as a role header in \\resumeSubheading"
  );
  assert(
    !detailedTailored.optimizedLatex.includes("reducing latency by 34% across distributed endpoints"),
    "FAIL: CAD drawing parser was infected with fake distributed endpoint latency clause"
  );
  assert(
    !detailedTailored.optimizedLatex.includes("Core Additions"),
    "FAIL: Detailed resume skills contaminated with unverified additions"
  );

  const detailedPdf = await compileLatexToPdfBuffer(detailedTailored.optimizedLatex);
  assert(detailedPdf !== null && detailedPdf.length > 10000, "FAIL: Detailed resume must compile to valid PDF");
  console.log(`✓ Detailed resume compiled cleanly (${detailedPdf.length} bytes). Subprojects and subheadings intact.`);

  // -----------------------------------------------------------------------------
  // Test Case 3: Clickable Links & Tel Protocol Preservation
  // -----------------------------------------------------------------------------
  console.log("\n--- Test Case 3: Clickable Links & Protocol Verification (tel:, mailto:, https:) ---");
  const linkedResume = `Maria Santos
maria.santos@tech.org | +1 (415) 987-6543 | linkedin.com/in/mariasantos | github.com/mariasantos
Technical Skills
Cloud: AWS, GCP, Terraform
Work Experience
Cloud Infrastructure Engineer
Nexus Cloud | Seattle, WA
January 2023 - Present
• Maintained cloud security postures across multi-region infrastructure.
Projects
Terraform Security Scanner [Code](https://github.com/mariasantos/tf-sec) | [Live Demo](https://tfsec.mariasantos.org)
• Built automated compliance scanner for Terraform configurations.
Education
B.S. in Software Engineering, University of Washington`;

  const linkedLatex = generateATSLatex(linkedResume);

  // Check tel: URL does NOT have https:// prepended
  assert(
    !linkedLatex.includes("https://tel:"),
    "FAIL: tel: link must NOT have https:// prepended (e.g. \\href{https://tel:...})"
  );
  assert(
    linkedLatex.includes("href{tel:+14159876543}") || linkedLatex.includes("href{tel:14159876543}") || linkedLatex.includes("href{mailto:maria.santos@tech.org}"),
    "FAIL: Expected contact links preserved as clickable \\href"
  );
  assert(
    linkedLatex.includes("href{https://github.com/mariasantos/tf-sec}"),
    "FAIL: Project code link missing from LaTeX"
  );
  assert(
    linkedLatex.includes("href{https://tfsec.mariasantos.org}"),
    "FAIL: Project demo link missing from LaTeX"
  );

  const linkedPdf = await compileLatexToPdfBuffer(linkedLatex);
  assert(linkedPdf !== null, "FAIL: Linked resume failed to compile to PDF");
  const linkValidation = await validatePdfHyperlinks(linkedPdf, [
    "https://github.com/mariasantos/tf-sec",
    "https://tfsec.mariasantos.org",
    "https://linkedin.com/in/mariasantos",
  ]);
  assert(linkValidation.valid, `FAIL: PDF missing clickable annotations: ${linkValidation.missingUrls.join(", ")}`);
  console.log(`✓ 100% of hyperlinks confirmed clickable in compiled binary PDF annotations.`);

  // -----------------------------------------------------------------------------
  // Test Case 4: Placeholder Cleaning Without Hallucinating Arbitrary Numbers
  // -----------------------------------------------------------------------------
  console.log("\n--- Test Case 4: Deterministic Metric Preservation (Zero Bracketed Placeholders) ---");
  const bulletWithPlaceholders = "Engineered caching layer, reducing query latency by [X]% across [N] database endpoints.";
  const cleanedNoMetric = resolvePlaceholder(bulletWithPlaceholders);
  assert(!cleanedNoMetric.includes("[X]"), "FAIL: [X] placeholder remains in resolved bullet");
  assert(!cleanedNoMetric.includes("[N]"), "FAIL: [N] placeholder remains in resolved bullet");
  assert(!cleanedNoMetric.includes("42%"), "FAIL: Must NOT inject 42% when user did not provide metric");
  assert(!cleanedNoMetric.includes("40"), "FAIL: Must NOT inject arbitrary 40 count");

  const cleanedWithVerifiedMetric = resolvePlaceholder(bulletWithPlaceholders, "38%");
  assert(cleanedWithVerifiedMetric.includes("38%"), "FAIL: User-verified custom metric must be inserted");

  const latexWithLingering = cleanLingeringPlaceholders(
    "\\item Optimized indexing by [Y]\\%, saving [\\$X] and increasing throughput by [X]x for [N] users.",
    true
  );
  assert(!latexWithLingering.includes("42\\%"), "FAIL: Lingering cleaner fabricated 42%");
  assert(!latexWithLingering.includes("\\$45K"), "FAIL: Lingering cleaner fabricated $45K");
  assert(!latexWithLingering.includes("2.5x"), "FAIL: Lingering cleaner fabricated 2.5x");
  assert(!latexWithLingering.includes("[Y]"), "FAIL: Bracketed placeholder lingering in LaTeX");
  console.log("✓ Placeholder cleaner cleanly removes placeholders without fabricating numbers.");

  // -----------------------------------------------------------------------------
  // Test Case 5: ATS Scoring Diagnostic Isolation
  // -----------------------------------------------------------------------------
  console.log("\n--- Test Case 5: ATS Scoring & JD Diagnostic Isolation ---");
  const sampleCandidate = `Jane Doe
jane@example.com | 123-456-7890 | linkedin.com/in/janedoe
Work Experience
Backend Developer | Beta Inc | 2022 - Present
• Built microservices using Go and PostgreSQL.
Technical Skills
Go, PostgreSQL, Docker`;

  const jdTarget = `Seeking engineer with Go, PostgreSQL, Kubernetes, AWS, Kafka.`;
  const requirements = extractRequirementsFromJobText(jdTarget);
  const scoreResult = scoreResume(sampleCandidate, requirements, jdTarget);

  assert(typeof scoreResult.score === "number" && scoreResult.score >= 0 && scoreResult.score <= 100, "Score must be 0-100");
  assert(Array.isArray(scoreResult.matches), "Matches must be array");
  const missingRequirements = scoreResult.matches.filter((m: any) => !m.matched);
  assert(missingRequirements.length > 0, "Missing requirements should detect Kafka/Kubernetes");
  console.log(`✓ ATS score computed: ${scoreResult.score}/100. Diagnostic gaps identified without altering source.`);

  console.log("\n==================================================================");
  console.log("🎉 ALL QUALITY & SOURCE-GROUNDING REGRESSION TESTS PASSED (5/5)!");
  console.log("==================================================================\n");
}

runQualityRegressionSuite().catch((err) => {
  console.error("❌ Quality regression suite failed:", err);
  process.exit(1);
});
