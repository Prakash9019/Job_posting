import assert from "node:assert";
import dotenv from "dotenv";
dotenv.config();

import { applyImprovementsToLatexWithAI } from "../lib/ats/apply-latex";

async function runTest() {
  console.log("===============================================================");
  console.log("🧪 TESTING AI-POWERED APPLY TO LATEX PIPELINE & COMPILATION");
  console.log("===============================================================\n");

  // Sample original LaTeX template with custom macros (like Jake's Resume / Overleaf standard)
  const originalLatex = `\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\input{glyphtounicode}

\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

\\addtolength{\\oddsidemargin}{-0.5in}
\\addtolength{\\evensidemargin}{-0.5in}
\\addtolength{\\textwidth}{1in}
\\addtolength{\\topmargin}{-.5in}
\\addtolength{\\textheight}{1.0in}

\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

\\titleformat{\\section}{
  \\vspace{-4pt}\\scshape\\raggedright\\large
}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]

\\pdfgentounicode=1

\\newcommand{\\resumeItem}[1]{
  \\item\\small{
    {#1 \\vspace{-2pt}}
  }
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-2pt}\\item
    \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
    \\item
    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\small#1 & #2 \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-5pt}}

\\begin{document}
\\pagestyle{empty}
\\thispagestyle{empty}

\\begin{center}
    \\textbf{\\Huge \\scshape Loka Surya Prakash} \\\\ \\vspace{1pt}
    \\small +91-6301750186 $|$ \\href{mailto:plsprakash2003@gmail.com}{\\underline{plsprakash2003@gmail.com}} $|$ 
    \\href{https://linkedin.com/in/surya}{\\underline{linkedin.com/in/surya}} $|$
    \\href{https://github.com/surya}{\\underline{github.com/surya}}
\\end{center}

\\section{TECHNICAL SKILLS}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
     \\textbf{Languages}{: C++, Python, JavaScript, TypeScript, SQL} \\\\
     \\textbf{Frameworks}{: React.js, Next.js, Node.js, Express.js, FastAPI} \\\\
     \\textbf{Developer Tools}{: Git, Docker, Google Cloud Platform, VS Code}
    }}
 \\end{itemize}

\\section{WORK EXPERIENCE}
  \\resumeSubHeadingListStart
    \\resumeSubheading
      {Platform Engineer}{April 2026 -- Sept 2026}
      {JulleyOnline Private Limited}{India}
      \\resumeItemListStart
        \\resumeItem{Architected a centralized integration hub using adapter and registry patterns.}
        \\resumeItem{Integrated Gmail, Zoho, Microsoft Outlook, and Naukri with zero data loss.}
      \\resumeItemListEnd
  \\resumeSubHeadingListEnd

\\section{PROJECTS}
    \\resumeSubHeadingListStart
      \\resumeProjectHeading
          {\\textbf{PMS Integration Hub} $|$ \\emph{TypeScript, Node.js, REST}}{April 2026}
          \\resumeItemListStart
            \\resumeItem{Developed a modular integration platform connecting multiple external APIs.}
          \\resumeItemListEnd
      \\resumeProjectHeading
          {\\textbf{Drone GCS Platform} $|$ \\emph{React, FastAPI, WebSockets}}{Jan 2026}
          \\resumeItemListStart
            \\resumeItem{Built real-time telemetry streaming dashboard for ArduPilot drones.}
          \\resumeItemListEnd
    \\resumeSubHeadingListEnd

\\section{EDUCATION}
  \\resumeSubHeadingListStart
    \\resumeSubheading
      {Vignan's Institute of Information Technology}{Visakhapatnam, India}
      {Bachelor of Technology in Computer Science; CGPA: 8.9/10.0}{2021 -- 2025}
  \\resumeSubHeadingListEnd

\\section{ACHIEVEMENTS}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
     \\textbf{National Rank}{: Ranked 37th across India in National Entrepreneurship Challenge.} \\\\
     \\textbf{Hackathons}{: Participated in 50+ hackathons with multiple podium finishes.}
    }}
 \\end{itemize}

\\end{document}
`;

  const atsOptimizedText = `Loka Surya Prakash
+91-6301750186 | plsprakash2003@gmail.com | LinkedIn | GitHub
Technical Skills
Languages: C++, Python, JavaScript, TypeScript, SQL
Frameworks: React.js, Next.js, Node.js, Express.js, FastAPI
Developer Tools: Git, Docker, Google Cloud Platform, VS Code, Redis
Work Experience
Platform Engineer April 2026 – September 2026
JulleyOnline Private Limited India
• Architected a centralized integration hub using adapter and registry patterns, accelerating API ingestion speeds by 42%.
• Engineered unified webhook listeners for Gmail, Zoho, and Outlook, achieving 99.98% payload delivery reliability.
Projects
PMS Integration Hub | TypeScript, Node.js, REST April 2026
• Spearheaded a high-throughput integration platform connecting multiple external recruitment APIs, reducing sync latency by 35%.
Drone GCS Platform | React, FastAPI, WebSockets January 2026
• Engineered a real-time ArduPilot telemetry dashboard streaming 60 FPS live flight metrics with zero packet loss.
Education
Vignan's Institute of Information Technology Visakhapatnam, India 2021 – 2025
Bachelor of Technology in Computer Science; CGPA: 8.9/10.0
Achievements
• National Rank: Ranked 37th across India in National Entrepreneurship Challenge out of 10,000+ teams.
• Hackathons: Participated in 50+ hackathons, securing Top 20 ranking in SusHacks.
`;

  const audit = {
    action_verb_and_par_rewrites: [
      {
        original_bullet: "Architected a centralized integration hub using adapter and registry patterns.",
        optimized_bullet: "Architected a centralized integration hub using adapter and registry patterns, accelerating API ingestion speeds by 42%.",
        impact_metric: "42%",
      },
      {
        original_bullet: "Integrated Gmail, Zoho, Microsoft Outlook, and Naukri with zero data loss.",
        optimized_bullet: "Engineered unified webhook listeners for Gmail, Zoho, and Outlook, achieving 99.98% payload delivery reliability.",
        impact_metric: "99.98%",
      },
      {
        original_bullet: "Developed a modular integration platform connecting multiple external APIs.",
        optimized_bullet: "Spearheaded a high-throughput integration platform connecting multiple external recruitment APIs, reducing sync latency by 35%.",
        impact_metric: "35%",
      },
      {
        original_bullet: "Built real-time telemetry streaming dashboard for ArduPilot drones.",
        optimized_bullet: "Engineered a real-time ArduPilot telemetry dashboard streaming 60 FPS live flight metrics with zero packet loss.",
        impact_metric: "60 FPS",
      },
    ],
    missing_hard_skills: ["Redis"],
  };

  console.log("--- 1. Invoking applyImprovementsToLatexWithAI ---");
  const result = await applyImprovementsToLatexWithAI({
    originalLatex,
    atsOptimizedText,
    jobText: "Looking for a Platform Engineer with TypeScript, Node.js, Redis, and high-throughput API architecture experience.",
    audit,
  });

  console.log("Updated LaTeX length:", result.updatedLatex.length);
  console.log("Stats reported:", result.stats);
  console.log("Compilation success:", result.compiled);

  console.log("\n--- 2. Verifying Section Headings Preservation ---");
  assert(result.updatedLatex.includes("\\section{TECHNICAL SKILLS}"), "Must keep TECHNICAL SKILLS section");
  assert(result.updatedLatex.includes("\\section{WORK EXPERIENCE}"), "Must keep WORK EXPERIENCE section");
  assert(result.updatedLatex.includes("\\section{PROJECTS}"), "Must keep PROJECTS section");
  assert(result.updatedLatex.includes("\\section{EDUCATION}"), "Must keep EDUCATION section");
  assert(result.updatedLatex.includes("\\section{ACHIEVEMENTS}"), "Must keep ACHIEVEMENTS section");
  console.log("✅ [PASS] All 5 section headings preserved!");

  console.log("\n--- 3. Verifying Projects Preservation ---");
  assert(result.updatedLatex.includes("PMS Integration Hub"), "Must keep PMS Integration Hub project");
  assert(result.updatedLatex.includes("Drone GCS Platform"), "Must keep Drone GCS Platform project");
  console.log("✅ [PASS] Both projects preserved without dropping!");

  console.log("\n--- 4. Verifying Template Macro Structure Preservation ---");
  assert(result.updatedLatex.includes("\\resumeSubheading"), "Must keep \\resumeSubheading macro");
  assert(result.updatedLatex.includes("\\resumeProjectHeading"), "Must keep \\resumeProjectHeading macro");
  assert(result.updatedLatex.includes("\\resumeItem"), "Must keep \\resumeItem macro");
  console.log("✅ [PASS] Original LaTeX macros and structure preserved!");

  console.log("\n--- 5. Verifying ATS Enhancements & Metric Injection ---");
  assert(result.updatedLatex.includes("42\\%") || result.updatedLatex.includes("42%"), "Must inject 42% metric");
  assert(result.updatedLatex.includes("35\\%") || result.updatedLatex.includes("35%"), "Must inject 35% metric");
  console.log("✅ [PASS] High-impact metrics injected into bullets!");

  console.log("\n--- 6. Verifying TeXLive Compilation ---");
  assert(result.compiled, "LaTeX must compile cleanly without errors: " + (result.log || result.error));
  console.log("✅ [PASS] TeXLive compiled to PDF successfully!");

  console.log("\n===============================================================");
  console.log("🎉 ALL APPLY-TO-LATEX TESTS PASSED!");
  console.log("===============================================================\n");
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
