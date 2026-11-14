import * as fs from "fs";
import * as path from "path";
import { generateATSLatex, compileLatexToPdfBuffer } from "../lib/ats/tailor";
import { PDFParse } from "pdf-parse";

const FIX = path.join(__dirname, "..", "tests", "fixtures", "lakshmi");

async function main() {
  const text = fs.readFileSync(path.join(FIX, "reference_text.txt"), "utf8");
  let latex = generateATSLatex(text);

  latex = latex.replace(/\\documentclass\[[^\]]*\]\{extarticle\}/, "\\documentclass[a4paper,9pt]{extarticle}");
  latex = latex.replace(/\\usepackage\[[^\]]*\]\{geometry\}/, "\\usepackage[left=0.34in, right=0.34in, top=0.22in, bottom=0.22in]{geometry}");
  latex = latex.replace(/\\setlist\[itemize\]\{[^}]*\}/, "\\setlist[itemize]{leftmargin=1.2em, itemsep=0pt, parsep=0pt, topsep=0.5pt, partopsep=0pt, label=\\textbullet}");
  latex = latex.replace(/\\linespread\{[^}]*\}/, "\\linespread{0.95}");
  latex = latex.replace(/\\titlespacing\*?\{\\section\}\{[^}]*\}\{[^}]*\}\{[^}]*\}/, "\\titlespacing*{\\section}{0pt}{2pt}{1pt}");
  latex = latex.replace(/\\vspace\{(?:0\.5|1\.8|2\.5|3\.0|3\.5)pt\}\s*\\nopagebreak\[3\]/g, "\\vspace{0.5pt}\\nopagebreak[3]");

  const buf = await compileLatexToPdfBuffer(latex);
  if (buf) {
    const p = new PDFParse({ data: buf });
    await p.load();
    console.log("Lakshmi original ultra-dense Pages:", p.doc.numPages);
  }
}
main().catch(console.error);
