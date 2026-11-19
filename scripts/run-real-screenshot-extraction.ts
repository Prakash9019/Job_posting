import fs from "fs";
import { extractFromScreenshot } from "../lib/ai/gemini";
(async () => {
  for (const f of process.argv.slice(2)) {
    const mime = /\.png$/i.test(f) ? "image/png" : "image/jpeg";
    const r = await extractFromScreenshot(fs.readFileSync(f), mime);
    console.log(JSON.stringify({ file: f.split("/").pop()!.slice(-32), layout: r.screenLayout, category: r.category, title: r.jobTitle, company: r.companyName, email: r.recipientEmail, incomplete: !!r.incompleteJobPost, conf: r.confidence, titleEvidence: r.jobTitleEvidence, regions: (r.regions||[]).map(x=>x.kind+": "+x.description.slice(0,50)), review: r.manualReviewReason }, null, 1));
  }
})().catch((e) => { console.error(e); process.exit(1); });
