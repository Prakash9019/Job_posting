import { validateAndCompileLatex } from "../lib/ats/apply-latex";

async function main() {
  const { execSync } = await import("child_process");
  const latex = execSync("node --import tsx scripts/test_new_latex.ts", { encoding: "utf-8" });
  let code = latex.slice(latex.indexOf("%-------------------------"));

  code = code.replace(
    /\\usepackage\[a4paper,[^\]]+\]\{geometry\}/,
    "\\usepackage[a4paper,left=0.6in,right=0.6in,top=0.6in,bottom=0.6in]{geometry}"
  );
  code = code.replace(
    /\\titlespacing\*\{\\section\}\{[^\}]*\}\{[^\}]*\}\{[^\}]*\}/,
    "\\titlespacing*{\\section}{0pt}{8pt}{4pt}"
  );
  code = code.replace(
    /\\setlist\[itemize\]\{[^\}]*\}/,
    "\\setlist[itemize]{leftmargin=0.18in, label=\\raisebox{0.15ex}{\\tiny$\\bullet$}, itemsep=2.5pt, parsep=0pt, topsep=2.5pt, partopsep=0pt}"
  );

  const res = await validateAndCompileLatex(code);
  const lines = (res.log || "").split("\n");
  const errLines = lines.filter(l => l.startsWith("!") || l.includes("Error") || l.includes("error") || l.includes("Undefined"));
  console.log("Error lines:", errLines);
}
main().catch(console.error);
