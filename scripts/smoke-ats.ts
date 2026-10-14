import { NextRequest } from "next/server";
import { POST } from "../app/api/ats/route";
import { createSessionToken, SESSION_COOKIE_NAME } from "../lib/auth/session";
async function main() {
  const form = new FormData();
  form.set("resumeText", ["Priya Sharma", "priya@example.com | +91 9876543210", "Professional Summary", "Frontend engineer building accessible dashboards.", "Skills", "React.js, JavaScript, PostgreSQL", "Work Experience", "Frontend Engineer at Example Labs", "- Built a React dashboard serving 1,000 users.", "- Worked on JavaScript features and PostgreSQL queries.", "Education", "BTech Computer Science, 2025"].join("\n"));
  form.set("jobText", "Junior Frontend Engineer. Required: React and JavaScript. Build accessible dashboards and collaborate with backend engineers. Preferred: Python.");
  const res = await POST(new NextRequest("http://localhost/api/ats", {method:"POST", body:form, headers:{cookie:SESSION_COOKIE_NAME+"="+createSessionToken("user_a")}}));
  const result = await res.json();
  if(!result.success) throw new Error(result.error);
  console.log(JSON.stringify({score:result.analysis.score,matchScore:result.analysis.matchScore,requirements:result.analysis.matches.map((r:{keyword:string;placement:string})=>({keyword:r.keyword,placement:r.placement})), issues:result.analysis.advice.issues.length, rewrites:result.analysis.advice.rewrites, model:result.analysis.model},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
