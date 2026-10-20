import { normalizeWrappedBullets } from "../lib/ats/scoring";

const text = `∗ Developed AI workflows for investor matching, ranking, pitch generation, pitch-deck analysis, and
founder evaluation.`;

console.log(JSON.stringify(normalizeWrappedBullets(text)));
