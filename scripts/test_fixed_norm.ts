import fs from "fs";
import { extractResumeText } from "../lib/ai/resume";

function fixedNormalize(rawText: string): string {
  const cleanLines = rawText.split("\n").filter((l) => {
    const trimmed = l.trim();
    if (!trimmed) return true;
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(trimmed)) return false;
    if (/^(?:page\s*)?\d+\s*(?:of|\/)\s*\d+$/i.test(trimmed)) return false;
    return true;
  });

  const BULLET_START_RE = /^\s*(?:[-•–—*∗▪▫◦‣▸▹➢➣→+]|\d+[.)])\s+/;
  const DATE_RE = /\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4})\s*[-–—]\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{4}|Present|Current)\b/i;

  const result: string[] = [];
  for (let i = 0; i < cleanLines.length; i++) {
    const line = cleanLines[i].trim();
    if (!line) continue;

    if (BULLET_START_RE.test(line)) {
      let merged = line;
      while (i + 1 < cleanLines.length) {
        const next = cleanLines[i + 1].trim();
        if (!next) {
          // Check if after empty line there's a lowercase continuation
          let peek = i + 2;
          while (peek < cleanLines.length && !cleanLines[peek].trim()) peek++;
          if (peek < cleanLines.length && /^[a-z]/.test(cleanLines[peek].trim())) {
            i = peek - 1;
            continue;
          }
          break;
        }

        // Stop if next is a bullet
        if (BULLET_START_RE.test(next)) break;
        // Stop if next has a date
        if (DATE_RE.test(next)) break;
        // Stop if next is a subproject heading (starts with dash or en-dash)
        if (/^[-–—]\s+[A-Z]/.test(next)) break;
        // Stop if next is a section heading
        if (/^(?:PROFESSIONAL SUMMARY|WORK EXPERIENCE|PROJECTS|TECHNICAL SKILLS|EDUCATION|CERTIFICATIONS)\b/i.test(next)) break;

        const endsWithPunct = /[.!?]$/.test(merged);
        const nextStartsLower = /^[a-z]/.test(next);

        // If merged line ends with comma or conjunction, or next line starts with lowercase, definitely merge!
        const endsWithOpenClause = /[,;:\-–—\(\[\{]|(?:\band|\bor|\bto|\bfor|\bwith|\bby|\bin|\bat|\bon|\busing|\bwhich|\bthat)\s*$/i.test(merged);

        if (endsWithOpenClause || nextStartsLower || !endsWithPunct) {
          merged = merged + " " + next;
          i++;
        } else {
          break;
        }
      }
      result.push(merged);
      continue;
    }

    result.push(line);
  }
  return result.join("\n");
}

async function main() {
  const buf = fs.readFileSync("E:/Job_posting/uploads/resumes/user_a/1792071906788-SuryaPrakash_Resume_SE.pdf");
  const extracted = await extractResumeText(buf, "application/pdf");
  const norm = fixedNormalize(extracted);
  const lines = norm.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Vertx") || lines[i].includes("targeting") || lines[i].includes("drawing") || lines[i].includes("founder")) {
      console.log(`Fixed Line ${i}: [${lines[i]}]`);
    }
  }
}
main().catch(console.error);
