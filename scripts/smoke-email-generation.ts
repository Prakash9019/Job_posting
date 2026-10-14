import { generateApplicationEmail } from '../lib/ai/gemini';
import { GeminiExtractionSchema } from '../lib/validation/schemas';
async function main() {
 const draft = await generateApplicationEmail({
 senderName: 'Suryaprakash', senderEmail: 'candidate@example.com',
 resumeText: 'Suryaprakash. Frontend developer. Built TaskBoard, a task management application using Next.js, React, TypeScript and PostgreSQL. Implemented server-rendered project pages, reusable React components and responsive layouts. Built an accessible dashboard with filtering and keyboard navigation. No professional work experience listed.',
 jobDetails: GeminiExtractionSchema.parse({category:'JOB_POST',companyName:'Example Labs',jobTitle:'Frontend Developer',recipientEmail:'hiring@example.com',jobDescription:'Build accessible dashboards in Next.js and React. TypeScript required. Apply with subject Frontend Application.',requiredSkills:['Next.js','React','TypeScript','accessibility'],confidence:'HIGH'})
 });
 if (!draft.body.includes('Suryaprakash') || !/Next\.js/i.test(draft.body) || !/React/i.test(draft.body) || !/TaskBoard/i.test(draft.body)) throw new Error('Missing candidate name or concrete matching evidence');
 console.log(JSON.stringify(draft,null,2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
