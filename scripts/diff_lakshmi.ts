import * as fs from "fs";
import * as path from "path";
import { generateATSLatex } from "../lib/ats/tailor";

const FIX = path.join(__dirname, "..", "tests", "fixtures", "lakshmi");

async function main() {
  const text = fs.readFileSync(path.join(FIX, "reference_text.txt"), "utf8");
  const latexGen = generateATSLatex(text);
  const latexFinal = fs.readFileSync("scripts/lakshmi_final.tex", "utf8");

  console.log("Generated length:", latexGen.length, "Final length:", latexFinal.length);
  // Find where differences are
  const genLines = latexGen.split("\n");
  const finalLines = latexFinal.split("\n");
  console.log("Generated line count:", genLines.length, "Final line count:", finalLines.length);

  fs.writeFileSync("test_lakshmi_gen.tex", latexGen);
}
main().catch(console.error);
