export type Requirement = { keyword: string; importance: "required" | "preferred"; jobEvidence: string };
export type ResumeLine = { number: number; text: string; section: string };
export type Finding = { severity: "high" | "medium" | "low"; line: number | null; quote: string; issue: string; suggestion: string };
const headings: [string, RegExp][] = [
  ["skills", /^(technical |core |key |professional )?(skills|technologies|competencies)\s*:?$/i],
  ["experience", /^(work |professional |relevant |employment )?(experience|employment|work history)\s*:?$/i],
  ["projects", /^(personal |selected |technical |academic )?projects\s*:?$/i],
  ["education", /^(education|academic background|qualifications)\s*:?$/i],
  ["summary", /^(professional |career )?(summary|profile|objective)\s*:?$/i],
  ["other", /^(certifications?|awards|publications|interests|languages)\s*:?$/i],
];
const aliases = [
  ["javascript", "js"], ["typescript", "ts"], ["react", "react.js", "reactjs"],
  ["next.js", "nextjs"], ["node.js", "nodejs", "node"], ["postgresql", "postgres"],
  ["aws", "amazon web services"], ["oop", "object-oriented programming", "object oriented programming"],
];
export function resumeLines(text: string): ResumeLine[] {
  let section = "contact";
  return text.replace(/\r\n?/g, "\n").split("\n").map((text, index) => {
    const match = headings.find(([, regex]) => regex.test(text.trim()));
    if (match) section = match[0];
    return { number: index + 1, text, section };
  });
}
export function containsSkill(text: string, keyword: string): boolean {
  const key = keyword.toLowerCase().trim();
  const terms = aliases.find(group => group.includes(key)) || [key];
  return terms.some(term => {
    const escaped = [...term].map(c => /[a-z0-9 ]/i.test(c) ? c : "\\" + c).join("");
    return new RegExp("(^|[^a-z0-9+#])" + escaped + "(?=$|[^a-z0-9+#])", "i").test(text);
  });
}
export function scoreResume(text: string, requirements: Requirement[] = []) {
  const lines = resumeLines(text);
  const findings: Finding[] = [];
  const sections = [...new Set(lines.filter(l => l.text.trim()).map(l => l.section))];
  const missing = ["skills", "experience", "education"].filter(s => !sections.includes(s) && !(s === "experience" && sections.includes("projects")));
  missing.forEach(section => findings.push({ severity: "high", line: null, quote: "", issue: "No clear " + section + " heading detected", suggestion: "Use a standard " + (section === "experience" ? "Experience or Projects" : section) + " heading." }));
  const contactText = lines.filter(l => l.section === "contact").slice(0, 15).map(l => l.text).join("\n");
  const contacts = [
    { label: "Name", present: lines.slice(0, 5).some(l => l.section === "contact" && /^[\p{L}][\p{L} .'-]{3,70}$/u.test(l.text.trim())) },
    { label: "Email", present: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(contactText) },
    { label: "Phone", present: /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3,5}\)?[\s.-]?){2,3}\d{3,5}/.test(contactText) },
  ];
  contacts.filter(c => !c.present).forEach(c => findings.push({ severity: "medium", line: null, quote: "", issue: c.label + " not detected near the top", suggestion: "Check that your " + c.label.toLowerCase() + " appears as readable text in the resume body." }));

  // Check for professional online links (LinkedIn/GitHub/Portfolio)
  const hasProfileLink = /(?:linkedin\.com\/in\/|github\.com\/|gitlab\.com\/|[\w-]+\.(?:dev|me|io)\b)/i.test(contactText);
  if (!hasProfileLink) {
    findings.push({ severity: "low", line: null, quote: "", issue: "No LinkedIn, GitHub or portfolio link found in header", suggestion: "Include your LinkedIn profile URL or portfolio link in the contact section." });
  }

  const bullets = lines.filter(l => ["experience", "projects"].includes(l.section) && /^\s*(?:[-•–*∗]\s*|(?:built|developed|led|created|engineered|implemented|designed|improved|reduced|managed|delivered|worked|responsible|architected)\b)/i.test(l.text));
  const quantified = bullets.filter(l => /\b\d[\d,.]*\s*(?:%|\+?\s*(?:users|clients|customers|requests|seconds|ms|hours|teams|projects|tests|devices|drones|million|thousand)\b)|[$£€]\s*\d|\b\d+(?:\.\d+)?x\b/i.test(l.text));
  
  // Passive phrasing check in bullets
  const passiveBullets = bullets.filter(l => /\b(responsible for|duties included|assisted with|assisted in|worked on|helped with)\b/i.test(l.text));
  for (const line of passiveBullets.slice(0, 4)) {
    findings.push({ severity: "medium", line: line.number, quote: line.text, issue: "Passive duty-oriented language detected", suggestion: "Replace passive phrases like 'responsible for' with assertive action verbs (e.g. 'Architected', 'Spearheaded', 'Optimized')." });
  }

  // Dense bullet points check (> 60 words)
  const denseBullets = bullets.filter(l => l.text.trim().split(/\s+/).length > 60);
  for (const line of denseBullets.slice(0, 3)) {
    findings.push({ severity: "low", line: line.number, quote: line.text, issue: "Dense bullet point (>60 words)", suggestion: "Shorten bullet to 1-3 lines. ATS and hiring managers favor scannable achievements." });
  }

  for (const line of bullets.filter(l => !quantified.includes(l) && !passiveBullets.includes(l)).slice(0, 4)) findings.push({ severity: "low", line: line.number, quote: line.text, issue: "No measurable outcome detected", suggestion: "If you have a verified result, describe its scale or outcome using the Google XYZ formula (Accomplished X measured by Y by doing Z)." });
  
  const badLines = lines.filter(l => /\uFFFD|[\u0000-\u0008\u000b\u000e-\u001f]/.test(l.text));
  badLines.forEach(l => findings.push({ severity: "high", line: l.number, quote: l.text, issue: "Possible extraction or encoding error", suggestion: "Compare this line with the original document and fix unreadable characters." }));

  // Check for table / column formatting artifacts
  const tableArtifacts = lines.filter(l => /(?:\|\s*\w+\s*\||\t{2,})/.test(l.text));
  for (const line of tableArtifacts.slice(0, 2)) {
    findings.push({ severity: "medium", line: line.number, quote: line.text, issue: "Table or multi-column separator detected", suggestion: "Tables and multi-column text boxes frequently cause ATS parsing errors. Use clean standard text formatting." });
  }

  const words = text.trim().split(/\s+/).length;
  const readability = Math.max(0, 100 - Math.min(60, badLines.length * 20) - (tableArtifacts.length ? 10 : 0) - (words < 100 ? 25 : 0) - (words > 1500 ? 15 : 0));
  if (words < 100 || words > 1500) findings.push({ severity: "medium", line: null, quote: "", issue: words < 100 ? "Very little resume text extracted" : "Resume may be difficult to scan quickly", suggestion: words < 100 ? "Check the extraction preview for missing pages or sections." : "Keep the most relevant experience and shorten repeated details." });
  const categories = [
    { label: "Text readability", score: readability, weight: 30, explanation: "Readable text and length checks; visual layout is not measured." },
    { label: "Section structure", score: Math.round((3 - missing.length) / 3 * 100), weight: 25, explanation: "Skills, Education, and Experience or Projects headings." },
    { label: "Contact details", score: Math.round(contacts.filter(c => c.present).length / 3 * 100), weight: 15, explanation: "Name, email, and phone near the top of extracted text." },
    { label: "Evidence of impact", score: bullets.length ? Math.min(100, Math.round(quantified.length / bullets.length * 150)) : 0, weight: 30, explanation: quantified.length + " of " + bullets.length + " detected achievement lines contain measurable outcomes. Not every achievement needs a number." },
  ].map(c => ({ ...c, points: Math.round(c.score * c.weight) / 100 }));
  const matches = requirements.map(requirement => {
    const evidence = lines.filter(l => containsSkill(l.text, requirement.keyword));
    const inSkills = evidence.some(l => l.section === "skills");
    const inExperience = evidence.some(l => ["experience", "projects"].includes(l.section));
    const multiplier = inSkills && inExperience ? 1 : inExperience ? 0.6 : inSkills ? 0.4 : evidence.length ? 0.2 : 0;
    return { ...requirement, evidence, placement: inSkills && inExperience ? "Skills + experience" : inExperience ? "Experience / projects" : inSkills ? "Skills only" : evidence.length ? "Elsewhere" : "Not found", multiplier, weight: requirement.importance === "required" ? 3 : 1 };
  });
  const denominator = matches.reduce((sum, r) => sum + r.weight, 0);
  return { score: Math.round(categories.reduce((sum, c) => sum + c.points, 0)), categories, contacts, sections, lines, wordCount: words, findings,
    matchScore: denominator ? Math.round(100 * matches.reduce((sum, r) => sum + r.multiplier * r.weight, 0) / denominator) : null, matches };
}
