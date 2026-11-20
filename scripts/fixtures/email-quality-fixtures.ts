/**
 * Shared fixtures for the email-quality checks (offline regression + live model comparison).
 *
 * Candidates A (Surya) and B (Lakshmi) are transcribed from the real resumes in this repository
 * (Resume_Loka_Surya_Prakash_Thryve.pdf, tests/fixtures/lakshmi). Candidate C is synthetic. The three share no data,
 * so any cross-candidate leakage in a generated email is detectable.
 */
import type { CanonicalResume } from "../../lib/ats/tailor";
import { canonicalToPlainText } from "../../lib/ats/tailor";
import type { GeminiExtraction } from "../../lib/validation/schemas";
import type { JobTargetProfile } from "../../lib/ai/resume";
import { extractCompetencyMatrix } from "../../lib/ats/parse";

export const SURYA = {
  fullName: "Loka Surya Prakash Pentakota",
  email: "plsprakash2003@gmail.com",
  phone: "+91-6301750186",
  githubUrl: "https://github.com/Prakash9019",
  linkedinUrl: "https://www.linkedin.com/in/suryaprakashloka/",
  summary: "Results-driven Full-Stack and AI Engineer specializing in scalable distributed architectures.",
  technicalSkills: {
    Languages: ["C++", "Python", "JavaScript", "TypeScript", "SQL"],
    Frontend: ["React.js", "Next.js", "React Native", "Expo", "TailwindCSS"],
    Backend: ["Node.js", "Express.js", "Flask", "FastAPI", "REST APIs", "WebSockets"],
    "AI/ML": ["Retrieval-Augmented Generation (RAG)", "Agentic AI", "LLM Orchestration", "VLMs", "Computer Vision", "OCR", "YOLO", "SAHI"],
    Systems: ["Distributed Systems", "MAVLink", "WebRTC", "GStreamer", "ZeroMQ"],
    "Databases/Cloud": ["MongoDB", "PostgreSQL", "Redis", "AWS", "GCP"],
  },
  experience: [
    {
      company: "Julley Online Private Limited", role: "Platform Engineer", location: "India", dateRange: "April 2026 – September 2026", bullets: [],
      subheadings: [
        { title: "PMS Integration Hub", bullets: [
          "Architected a centralized integration hub using adapter and registry patterns, which cut development time for new third-party integrations by 42% and standardized data synchronization.",
          "Integrated Gmail, Zoho, Microsoft Outlook, Naukri, and ESSL through reusable connector workflows for seamless authentication and data exchange, improving system throughput by 28% under peak production load.",
        ] },
        { title: "Drone GCS & Fleet Management Platform", bullets: [
          "Engineered a distributed ArduPilot Ground Control Station (GCS) using React, Node.js, Python, FastAPI, pymavlink, MAVLink, and ZeroMQ for real-time drone monitoring and control, boosting query execution efficiency by 35% across 500K+ records.",
          "Orchestrated the end-to-end GCS command and control stack, enabling real-time mission planning and robust reconnect handling that maintained a 99.9% operational uptime across drone fleets.",
        ] },
        { title: "AI-Powered Engineering Drawing Tag Extraction", bullets: [
          "Spearheaded an Artificial Intelligence pipeline in Python combining YOLO, SAHI, OCR, OpenCV, and Gemini to extract equipment tags from complex P&ID drawings, increasing tag extraction accuracy by 38% while reducing manual review time.",
          // Real (broken) tailoring artefact kept on purpose: a good email must not quote it.
          "Engineered retrieved engineering context with advanced visual detection and spatial reasoning to accurately associate detected components with their symbols and tags, boosting overall AI pipeline accuracy by an additional and aligning with Agentic AI principles.",
        ] },
      ],
    },
    {
      company: "Vertx", role: "Founding Full-Stack Engineer", location: "Remote", dateRange: "August 2024 – February 2026", bullets: [],
      subheadings: [
        { title: "Vertx Flow", bullets: [
          "Engineered 5+ distinct AI workflows for investor matching and founder evaluation, improving match quality by 42% while reducing manual review time by 10 hours per week.",
          "Architected comprehensive fundraising pipelines, including outbound outreach and shareable pitch links, enhancing investor engagement and streamlining founder-investor interactions.",
        ] },
        { title: "Vertx Startin", bullets: [
          "Spearheaded and launched a full-stack founder-investor platform using React.js, Node.js, Express.js, and MongoDB on AWS, scaling to support 1,000+ daily active users within 6 months of launch.",
          "Launched a semantic search and matching engine that improved founder-investor discovery accuracy by 42%, driving a 42% uplift in user engagement on the platform.",
        ] },
      ],
    },
  ],
  projects: [],
  education: [{ institution: "Vignan's Institute Of Information Technology", degree: "B.Tech in Computer Science and Engineering", dateRange: "2021 - 2025", details: "CGPA: 8.9/10.0" }],
} as unknown as CanonicalResume;

export const LAKSHMI = {
  fullName: "Sayyapureddy Lakshmi",
  email: "lakshmi.charvy1819@gmail.com",
  phone: "+91-8309769388",
  githubUrl: "https://github.com/Lakshmi-Sayyapureddy1819",
  linkedinUrl: "https://www.linkedin.com/in/lakshmi-sayyapureddy-219498259/",
  summary: "Computer Science graduate with hands-on experience building production AI systems and research experience at IISc Bangalore.",
  technicalSkills: {
    Languages: ["Python", "JavaScript", "HTML", "CSS", "SQL"],
    "Frameworks & Libraries": ["LangChain", "LangGraph", "PyTorch", "TensorFlow", "Scikit-learn", "Agno", "Hugging Face"],
    "AI/ML Platforms & Tools": ["Cognee", "Redis", "Gemini API", "OpenAI API", "MCP", "NeMo Guardrails", "RAGAS", "Vector Databases"],
    "Cloud, MLOps & Dev Tools": ["Docker", "Kubernetes", "CI/CD", "FastAPI", "Streamlit", "Git/GitHub", "MySQL"],
    Specializations: ["Agentic AI", "Multi-Agent Systems", "LLMs", "NLP", "RAG", "LLM Evaluation & Guardrails", "Computer Vision", "Machine Learning"],
  },
  experience: [
    { company: "Julley Online Pvt Ltd", role: "AI Engineer", location: "Hyderabad", dateRange: "Mar 2026 – Present", subheadings: [], bullets: [
      "Architecting and building a secure Enterprise Agentic Stack to power production-grade AI assistants, with security and access control as core design constraints.",
      "Implementing multi-agent orchestration using Agno, GraphRAG-based contextual memory with Cognee, semantic caching via Redis, and identity-aware access control using Scalekit to ensure reliable, low-latency, and multi-tenant-safe AI workflows for B2B applications.",
      "Developed and published the iOS and Android mobile applications for the company's Company Secretary (CS) compliance platform to their respective app stores.",
      "Built OCR-based extraction pipelines to process and structure large volumes of financial data for the platform's automated compliance workflows.",
    ] },
    { company: "Infosys", role: "Software Engineer Intern", location: "Mysuru", dateRange: "Dec 2025 – Mar 2026", subheadings: [], bullets: [
      "Contributed to the design, development, and testing of full-stack web application features and backend services using Python, JavaScript, and SQL within an Agile/Scrum team.",
      "Built and integrated REST APIs and worked with MySQL databases, using Git for version control and Jira for sprint tracking, to deliver features on schedule.",
    ] },
    { company: "Centre for Brain Research, IISc Bangalore", role: "Research Intern", location: "Bangalore", dateRange: "Jun 2025 – Aug 2025", subheadings: [], bullets: [
      "Achieved 90% accuracy with Swin Transformer and 92% accuracy with TransNetOCT for Alzheimer's Disease classification using Retinal OCT images.",
      "Engineered optimized data pipelines for preprocessing and training transformer-based architectures using PyTorch and TensorFlow, reducing training time by 20%.",
    ] },
  ],
  projects: [
    { title: "AI-Powered Resume Analyzer", techStack: "Gemini Pro, LLM, Prompt Engineering", bullets: ["Built an intelligent ATS system using Google Gemini Pro with a prompting strategy that extracts keywords from resumes against job descriptions, improving candidate matching rates by 18%."] },
    { title: "MCQ Generator", techStack: "LangChain, Gemini API, RAG", bullets: ["Built an automated assessment tool using LangChain and a RAG pipeline to generate context-aware questions from PDF documents, strictly grounded in source material to eliminate hallucinations."] },
    { title: "Multi-Language Invoice Extractor", techStack: "OCR, Gemini Pro", bullets: ["Built an end-to-end invoice processing system combining OCR with LLM reasoning to extract structured data from multi-lingual documents without manual template configuration."] },
  ],
  education: [{ institution: "Vignan's Institute Of Information Technology", degree: "B.Tech in Computer Science", dateRange: "2023 – 2026", details: "CGPA: 8.84" }],
} as unknown as CanonicalResume;

export const RAVI = {
  fullName: "Ravi Menon",
  email: "ravi.menon@example.dev",
  phone: "+1-555-0100",
  githubUrl: "https://github.com/ravimenon-dev",
  linkedinUrl: "",
  summary: "Solutions engineer who ships customer integrations and full-stack products.",
  technicalSkills: {
    Languages: ["Python", "TypeScript", "SQL"],
    Backend: ["FastAPI", "Node.js", "PostgreSQL", "REST APIs", "Docker"],
    Frontend: ["React"],
    "AI/ML": ["LLMs", "RAG"],
    Domain: ["FHIR", "HL7", "Customer Discovery"],
  },
  experience: [
    { company: "Brightline Health", role: "Solutions Engineer", location: "Remote", dateRange: "2022 – 2025", bullets: [], subheadings: [
      { title: "Hospital EHR Integrations", bullets: [
        "Led on-site deployments of FHIR and HL7 integrations for 14 hospital customers, cutting average go-live time by 40%.",
        "Ran discovery workshops with clinical and IT stakeholders to turn workflow requirements into integration specs and acceptance tests.",
      ] },
      { title: "Records Sync Service", bullets: [
        "Built Python and FastAPI connector services in Docker that synced 3M+ patient records nightly with 99.95% reliability.",
      ] },
    ] },
    { company: "Parcelly", role: "Software Engineer", location: "Austin, TX", dateRange: "2020 – 2022", subheadings: [], bullets: [
      "Developed React and TypeScript dashboards used by 200+ logistics customers to track shipments in real time.",
      "Built Node.js and PostgreSQL APIs that reduced order processing time by 35%.",
    ] },
  ],
  projects: [
    { title: "Support Triage Assistant", techStack: "Python, LLMs, RAG, PostgreSQL", bullets: ["Built a RAG-based support triage assistant with LLMs and PostgreSQL that routed 85% of pilot tickets to the correct queue."] },
  ],
  education: [{ institution: "University of Texas at Austin", degree: "B.S. Computer Science", dateRange: "2016 – 2020" }],
} as unknown as CanonicalResume;

export interface EmailCase {
  id: string;
  label: string;
  resume: CanonicalResume;
  extraction: GeminiExtraction;
  /** Expectations used by the checks. */
  expect: { greeting: string; subject: string; company: string; mustNotMention?: RegExp[] };
}

const JD_FULLSTACK = `Full Stack Developer – Noida (1-3 years)
Capline Services is hiring a Full Stack Developer to build and maintain our healthcare RCM web products.
Responsibilities:
- Build responsive React front ends and Node.js/Express REST APIs.
- Design schemas and queries in PostgreSQL or MongoDB.
- Deploy and monitor services on AWS.
- Work with product to ship features end to end; integrate AI-powered features where they add value.
Requirements: React, Node.js, TypeScript, REST APIs, PostgreSQL/MongoDB, AWS. Exposure to LLM/RAG features is a plus.
Interested candidates can share their resume with Tanushree at tanushree.k@caplineservices.com with the subject line "Full Stack Developer – Noida".`;

const JD_FDE = `Forward Deployed Engineer (Agentic AI)
Fieldwise AI is building agentic automation for operations teams. As a Forward Deployed Engineer you will embed with customers, understand their workflows, and turn ambiguous problems into production integrations.
What you'll do:
- Work directly with customer engineering and ops teams to scope and deliver integrations with their systems (email, CRMs, HR tools, internal APIs).
- Build agentic AI workflows and LLM-powered automations in Python and TypeScript.
- Take proofs of concept to reliable production deployments; debug issues in the field.
- Feed customer insights back to the product team.
What we look for: 2+ years shipping production software, API integrations, Python, TypeScript, LLMs/RAG, ownership in a fast-paced startup.
Apply by emailing talent@fieldwise.ai. Subject: FDE Application - Your Full Name`;

const JD_AI = `AI Engineer – LLM Applications (Job ID: AIE-2041)
NeuralixAI builds AI copilots for finance teams. We're looking for an AI Engineer to design agentic workflows and RAG systems that run reliably in production.
Responsibilities:
- Build multi-agent and RAG pipelines with LangChain/LangGraph.
- Implement evaluation, guardrails and access control for LLM applications.
- Ship Python/FastAPI services and work with document extraction (OCR) pipelines.
Requirements: Python, LLMs, RAG, LangChain, agentic AI, FastAPI, evaluation/guardrails. 0-2 years; strong projects welcome.
Contact: Sarita Iyer, Talent Acquisition – sarita.iyer@neuralix.ai. Please mention the Job ID in the subject line.`;

const JD_FDE_HEALTH = `Forward Deployed Engineer – Healthcare
Carewell is hiring Forward Deployed Engineers to deploy our clinical AI platform inside hospital systems.
You will: lead technical discovery with hospital IT and clinical stakeholders; build and maintain EHR integrations (FHIR, HL7); write Python services that move data reliably; configure LLM-based features for each customer; be the technical owner from kickoff to go-live.
Requirements: 3+ years in a customer-facing engineering role, Python, REST APIs, FHIR/HL7, SQL, comfort with travel.
Questions? Reach out to Daniel Ortiz, Technical Recruiter, at daniel.ortiz@carewell.io.`;

const JD_AI_STARTUP = `AI Engineer (Agentic AI)
Northbeam Labs (seed-stage) is hiring an AI Engineer to build agentic AI products for small businesses.
- Design LLM agents and RAG pipelines that call real business APIs.
- Own features end to end: Python backends, simple React UIs, deployment.
- Move fast with a small team.
Must have: Python, LLMs, RAG, agentic AI, REST APIs. Nice to have: React, Node.js.
Send your resume to jobs@northbeamlabs.com.`;

function extraction(o: Partial<GeminiExtraction> & { companyName: string; jobTitle: string; jobDescription: string; recipientEmail: string }): GeminiExtraction {
  return {
    category: "JOB_POST", linkedInUrls: [], applicationUrls: [], otherUrls: [], requiredSkills: [], experienceRequirements: null,
    location: null, workMode: null, contactName: null, contactRole: null, evidenceText: o.jobDescription, confidence: "HIGH", manualReviewReason: null,
    ...o,
  } as GeminiExtraction;
}

export const EMAIL_CASES: EmailCase[] = [
  {
    id: "fullstack-surya", label: "Full Stack Developer / Surya", resume: SURYA,
    extraction: extraction({ companyName: "Capline Services", jobTitle: "Full Stack Developer", recipientEmail: "tanushree.k@caplineservices.com", contactName: "Tanushree", contactRole: "Recruiter", jobDescription: JD_FULLSTACK, location: "Noida", workMode: "On-site", experienceRequirements: "1-3 years", requiredSkills: ["React", "Node.js", "TypeScript", "REST APIs", "PostgreSQL", "MongoDB", "AWS", "RAG"] }),
    expect: { greeting: "Hi Tanushree,", subject: "Full Stack Developer – Noida", company: "Capline Services" },
  },
  {
    id: "fde-surya", label: "Forward Deployed Engineer / Surya", resume: SURYA,
    extraction: extraction({ companyName: "Fieldwise AI", jobTitle: "Forward Deployed Engineer", recipientEmail: "talent@fieldwise.ai", jobDescription: JD_FDE, experienceRequirements: "2+ years", requiredSkills: ["Python", "TypeScript", "LLMs", "RAG", "Agentic AI", "REST APIs"] }),
    expect: { greeting: "Hi Hiring Team,", subject: "FDE Application - Loka Surya Prakash Pentakota", company: "Fieldwise AI" },
  },
  {
    id: "ai-lakshmi", label: "AI Engineer / Lakshmi", resume: LAKSHMI,
    extraction: extraction({ companyName: "NeuralixAI", jobTitle: "AI Engineer – LLM Applications", recipientEmail: "sarita.iyer@neuralix.ai", contactName: "Sarita Iyer", contactRole: "Talent Acquisition", jobDescription: JD_AI, experienceRequirements: "0-2 years", requiredSkills: ["Python", "LLMs", "RAG", "LangChain", "LangGraph", "Agentic AI", "FastAPI", "OCR"] }),
    expect: { greeting: "Hi Sarita,", subject: "Application for AI Engineer – LLM Applications — Sayyapureddy Lakshmi (AIE-2041)", company: "NeuralixAI" },
  },
  {
    id: "fde-ravi", label: "Forward Deployed Engineer (Healthcare) / Ravi", resume: RAVI,
    extraction: extraction({ companyName: "Carewell", jobTitle: "Forward Deployed Engineer – Healthcare", recipientEmail: "daniel.ortiz@carewell.io", contactName: "Daniel Ortiz", contactRole: "Technical Recruiter", jobDescription: JD_FDE_HEALTH, experienceRequirements: "3+ years", requiredSkills: ["Python", "REST APIs", "FHIR", "HL7", "SQL"] }),
    expect: { greeting: "Hi Daniel,", subject: "Application for Forward Deployed Engineer – Healthcare — Ravi Menon", company: "Carewell", mustNotMention: [/linkedin/i] },
  },
  {
    id: "ai-surya", label: "AI Engineer (startup) / Surya", resume: SURYA,
    extraction: extraction({ companyName: "Northbeam Labs", jobTitle: "AI Engineer", recipientEmail: "jobs@northbeamlabs.com", jobDescription: JD_AI_STARTUP, requiredSkills: ["Python", "LLMs", "RAG", "Agentic AI", "REST APIs", "React", "Node.js"] }),
    expect: { greeting: "Hi Hiring Team,", subject: "Application for AI Engineer — Loka Surya Prakash Pentakota", company: "Northbeam Labs" },
  },
];

/** Builds the exact inputs production passes to generateApplicationEmail (same competency-matrix job profile as batch.ts). */
export function buildEmailInputs(c: EmailCase) {
  const ex = c.extraction;
  const jobText = [ex.jobTitle, ex.companyName, ex.jobDescription, `Required Skills: ${ex.requiredSkills.join(", ")}`].join("\n\n");
  const comp = extractCompetencyMatrix(jobText);
  const primaryTech = comp.primaryTechStack.map((r) => r.keyword);
  const jobProfile: JobTargetProfile = {
    companyName: ex.companyName || "Company",
    targetRoleTitle: ex.jobTitle || undefined,
    recipientEmail: ex.recipientEmail || undefined,
    hiringManagerName: ex.contactName || undefined,
    primaryTechStack: primaryTech.length > 0 ? primaryTech : ex.requiredSkills,
    architectureAndDomainKeywords: comp.architectureAndDomainKeywords.map((r) => r.keyword),
    targetRole: ex.jobTitle || undefined,
    targetStack: primaryTech.length > 0 ? primaryTech : ex.requiredSkills,
  };
  const resumeText = canonicalToPlainText(c.resume);
  return { jobDetails: ex, jobProfile, canonicalResume: c.resume, resumeText, attachmentFilename: `Resume_${String(c.resume.fullName).replace(/\s+/g, "_")}_${String(ex.companyName).replace(/\s+/g, "")}.pdf`, senderName: c.resume.fullName, senderEmail: c.resume.email };
}
