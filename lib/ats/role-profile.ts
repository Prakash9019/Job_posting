/**
 * Shared JD-driven role positioning.
 *
 * Single source of truth used by the resume summary / ordering (lib/ats/tailor.ts) and the application email
 * (lib/ai/resume.ts, lib/ai/gemini.ts) so that both present the candidate as the role the JD actually hires for.
 *
 * Pure and dependency-free (only structural types) so it can be imported from anywhere without cycles.
 * It never invents content: it only classifies the JD, ranks/reorders what the resume already contains, and
 * names skills/domains that are verifiably present in the resume text.
 */

export type RoleFamily =
  | "fullstack"
  | "ai"
  | "backend"
  | "frontend"
  | "forward-deployed"
  | "hardware-software"
  | "devops"
  | "data"
  | "generic";

interface RoleProfile {
  family: RoleFamily;
  /** Canonical noun phrase used when the JD title is missing or too generic. */
  label: string;
  /** "specializing in ..." phrase for the summary hook. */
  domain: string;
  /** Resume-evidence terms: text that mentions these demonstrates this role. */
  evidence: RegExp;
  /** Technical-skills row order (first match wins, earlier = more prominent). */
  categoryOrder: RegExp[];
  /** Email hook describing what the candidate does in this role (followed by "...across <skills>"). */
  pitch: string;
  /** Closing line of the proof paragraph. */
  proofClose: string;
}

const CAT = {
  lang: /lang/i,
  front: /front/i,
  back: /back/i,
  ai: /\bai\b|ai\/ml|\bml\b|machine|artificial|intelligen|llm|vision/i,
  cloud: /database|cloud|devops|infra/i,
  systems: /system|embedded|hardware|robot|tool|concept|platform|other/i,
};

export const ROLE_PROFILES: Record<RoleFamily, RoleProfile> = {
  fullstack: {
    family: "fullstack",
    label: "Full Stack Engineer",
    domain: "end-to-end web applications, scalable APIs, and data-driven product features",
    evidence: /\b(?:react|next\.?js|node\.?js|express|front-?end|full-?stack|rest(?:ful)?|apis?|mongodb|postgres(?:ql)?|typescript|javascript|ui|web|dashboards?|fastapi|database)\b/i,
    categoryOrder: [CAT.front, CAT.back, CAT.lang, CAT.cloud, CAT.ai, CAT.systems],
    pitch: "I build and ship full-stack products end to end, from React interfaces to Node.js and FastAPI services and the databases behind them",
    proofClose: "Across these projects I work end to end, from interface and API design through deployment.",
  },
  ai: {
    family: "ai",
    label: "AI Engineer",
    domain: "production AI systems, LLM workflows, and intelligent automation",
    evidence: /\b(?:ai|llms?|rag|yolo|sahi|ocr|computer vision|machine learning|deep learning|langchain|langgraph|agents?|agentic|embeddings?|nlp|models?|inference|prompt|vlm|opencv|pytorch|tensorflow)\b/i,
    categoryOrder: [CAT.ai, CAT.lang, CAT.back, CAT.cloud, CAT.front, CAT.systems],
    pitch: "I design and deploy production AI systems, taking models from experimentation to reliable services",
    proofClose: "These put AI components into production with measurable results.",
  },
  backend: {
    family: "backend",
    label: "Backend Engineer",
    domain: "scalable backend services, APIs, and distributed systems",
    evidence: /\b(?:fastapi|apis?|rest(?:ful)?|microservices?|distributed|databases?|queues?|zeromq|node\.?js|express|latency|uptime|sql|mongodb|postgres(?:ql)?|websockets?|throughput|records)\b/i,
    categoryOrder: [CAT.back, CAT.lang, CAT.cloud, CAT.systems, CAT.ai, CAT.front],
    pitch: "I build scalable, high-availability backend services and APIs that hold up in production",
    proofClose: "These demanded high availability, low latency, and dependable data handling.",
  },
  frontend: {
    family: "frontend",
    label: "Frontend Engineer",
    domain: "responsive, high-performance user interfaces",
    evidence: /\b(?:react|next\.?js|front-?end|ui|ux|css|tailwind|html|components?|responsive|dashboards?|redux|typescript|javascript|web)\b/i,
    categoryOrder: [CAT.front, CAT.lang, CAT.back, CAT.cloud, CAT.ai, CAT.systems],
    pitch: "I build responsive, production-grade user interfaces in React and TypeScript backed by solid APIs",
    proofClose: "These shipped interfaces that real users depend on daily.",
  },
  "forward-deployed": {
    family: "forward-deployed",
    label: "Forward Deployed Engineer",
    domain: "customer-facing solution delivery and end-to-end system integration",
    evidence: /\b(?:customers?|clients?|integrations?|integration hub|pms|deploy(?:ed|ment)?|stakeholders?|workflows?|production|adapters?|apis?|automation|end-to-end|fastapi|node\.?js)\b/i,
    categoryOrder: [CAT.back, CAT.lang, CAT.ai, CAT.cloud, CAT.front, CAT.systems],
    pitch: "I embed with real problems and deliver working integrations, from requirements through deployment",
    proofClose: "These meant turning ambiguous needs into dependable production solutions.",
  },
  "hardware-software": {
    family: "hardware-software",
    label: "Hardware/Software Integration Engineer",
    domain: "hardware/software integration, real-time telemetry, and systems engineering",
    evidence: /\b(?:drones?|ardupilot|mavlink|telemetry|hardware|sensors?|embedded|firmware|ground control|gcs|zeromq|real-?time|uav|fleet|integration|iot|serial|protocols?)\b/i,
    categoryOrder: [CAT.systems, CAT.back, CAT.lang, CAT.ai, CAT.cloud, CAT.front],
    pitch: "I integrate hardware and software into dependable real-time systems, from device telemetry to operator-facing control software",
    proofClose: "My real-time systems work carries strict reliability requirements.",
  },
  devops: {
    family: "devops",
    label: "DevOps Engineer",
    domain: "cloud infrastructure, containerized deployments, and reliable delivery pipelines",
    evidence: /\b(?:docker|kubernetes|k8s|ci\/cd|aws|azure|gcp|terraform|containers?|containerized|deploy(?:ed|ment)?|uptime|pipelines?|monitoring|cloud)\b/i,
    categoryOrder: [CAT.cloud, CAT.back, CAT.lang, CAT.systems, CAT.ai, CAT.front],
    pitch: "I containerize, deploy, and operate production services with a focus on reliability",
    proofClose: "These depended on dependable deployment and uptime.",
  },
  data: {
    family: "data",
    label: "Data Engineer",
    domain: "data pipelines, large-scale processing, and analytics platforms",
    evidence: /\b(?:pipelines?|etl|sql|queries|records|analytics|kafka|spark|warehouse|data|databases?|mongodb|postgres(?:ql)?)\b/i,
    categoryOrder: [CAT.cloud, CAT.lang, CAT.back, CAT.ai, CAT.systems, CAT.front],
    pitch: "I build reliable data pipelines and query layers that operate at scale",
    proofClose: "These required dependable data handling at volume.",
  },
  generic: {
    family: "generic",
    label: "Software Engineer",
    domain: "scalable, production-grade software systems",
    evidence: /\b(?:apis?|services?|systems?|react|node\.?js|python|fastapi|microservices?|distributed|ai)\b/i,
    categoryOrder: [CAT.lang, CAT.back, CAT.front, CAT.cloud, CAT.ai, CAT.systems],
    pitch: "I build and ship production software across the stack",
    proofClose: "These were production systems with measurable impact.",
  },
};

/** Ordered: the first family whose pattern hits the TITLE wins (title is the strongest signal). */
const TITLE_RULES: Array<[RoleFamily, RegExp]> = [
  ["forward-deployed", /forward[- ]?deployed|solutions? engineer|implementation engineer|customer engineer|field engineer|deployment engineer/i],
  ["hardware-software", /hardware|embedded|firmware|robotic|avionics|integration engineer|systems? integration|iot|mechatronic|drone|uav/i],
  ["fullstack", /full[- ]?stack/i],
  ["ai", /\bai\b|\bml\b|machine learning|deep learning|\bllm|genai|generative|computer vision|\bnlp\b|data scientist|agentic|prompt/i],
  ["frontend", /front[- ]?end|\bui\b|\bux\b|web developer/i],
  ["backend", /back[- ]?end|api engineer|platform engineer|server[- ]side/i],
  ["devops", /devops|\bsre\b|site reliability|cloud engineer|infrastructure/i],
  ["data", /data engineer|analytics engineer|\betl\b/i],
];

/** Weighted JD-body signals used only when the title is generic (e.g. "Software Engineer"). */
const BODY_SIGNALS: Array<[RoleFamily, RegExp]> = [
  ["forward-deployed", /forward[- ]?deployed|customer[- ]facing|on-?site with customers?|embedded with customers?/gi],
  ["hardware-software", /hardware|firmware|embedded|sensors?|robotic|drones?|telemetry|avionics|\buav\b/gi],
  ["fullstack", /full[- ]?stack|front[- ]?end and back[- ]?end|end[- ]to[- ]end web/gi],
  ["ai", /\bllms?\b|machine learning|deep learning|computer vision|\brag\b|generative ai|agentic|\bnlp\b|neural|pytorch|tensorflow/gi],
  ["frontend", /\breact\b|\bangular\b|\bvue\b|front[- ]?end|\bcss\b|user interfaces?/gi],
  ["backend", /back[- ]?end|microservices?|rest apis?|distributed systems?|server[- ]side/gi],
  ["devops", /kubernetes|terraform|ci\/cd|\bsre\b|infrastructure as code/gi],
  ["data", /data pipelines?|\betl\b|data warehouse|\bspark\b|\bkafka\b/gi],
];

const GENERIC_TITLE = /^(?:software|engineer|developer|software engineer|software developer|sde|swe|member of technical staff|programmer|technical staff)(?:\s+(?:i|ii|iii|iv|\d))?$/i;

export function isGenericRoleTitle(title: string): boolean {
  return !title.trim() || GENERIC_TITLE.test(title.trim());
}

/** Detects the role family the JD is hiring for: title first, then weighted JD-body signals. */
export function detectRoleFamily(title: string | undefined | null, jobText?: string | null): RoleFamily {
  const t = (title || "").trim();
  if (t) {
    for (const [family, re] of TITLE_RULES) if (re.test(t)) return family;
  }
  const body = (jobText || "").slice(0, 8000);
  // The first lines of a JD usually restate the title; give them extra weight.
  const head = body.split("\n").slice(0, 4).join(" ");
  for (const [family, re] of TITLE_RULES) if (re.test(head)) return family;

  let best: RoleFamily = "generic";
  let bestScore = 0;
  const counts = new Map<RoleFamily, number>();
  for (const [family, re] of BODY_SIGNALS) {
    const hits = (body.match(re) || []).length;
    counts.set(family, hits);
    if (hits > bestScore) {
      bestScore = hits;
      best = family;
    }
  }
  // A JD that substantially covers both the UI and the service side is a full-stack role
  if ((best === "frontend" || best === "backend") && (counts.get("frontend") || 0) >= 2 && (counts.get("backend") || 0) >= 2) {
    return "fullstack";
  }
  return bestScore >= 3 ? best : "generic";
}

/** Role noun for the summary/email: the JD's own title unless it is blank/generic and a family was detected. */
export function resolvePositioningTitle(title: string, family: RoleFamily): string {
  const t = (title || "").trim();
  if (t && !isGenericRoleTitle(t)) return t;
  return family === "generic" ? t || ROLE_PROFILES.generic.label : ROLE_PROFILES[family].label;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Relevance of a piece of resume text to the target role: family evidence hits + JD keyword hits (JD weighs more). */
export function scoreTextForRole(text: string, family: RoleFamily, jdKeywords: string[] = []): number {
  if (!text) return 0;
  const ev = ROLE_PROFILES[family].evidence;
  const global = new RegExp(ev.source, "gi");
  let score = (text.match(global) || []).length;
  for (const kw of jdKeywords) {
    const k = kw.trim();
    if (k.length < 2) continue;
    if (new RegExp(`(?:^|[^a-z0-9+#.])${escapeRe(k)}(?=$|[^a-z0-9+#.])`, "i").test(text)) score += 3;
  }
  return score;
}

/** Stable sort (descending score) that leaves equal-scoring items in their original order. */
function stableByScore<T>(items: T[], score: (x: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}

interface PrioritizableResume {
  technicalSkills?: unknown;
  experience: any[];
  projects: any[];
}

/**
 * Reorders (never adds, removes, or rewrites) the resume so the target role leads: Technical Skills rows and the
 * skills inside them, bullets within each role/project, and projects. Because the single-page trimmer removes from
 * the tail, the most role-relevant content also becomes the last to be dropped.
 */
export function prioritizeResumeForRole(resume: PrioritizableResume, family: RoleFamily, jdKeywords: string[] = []): void {
  const profile = ROLE_PROFILES[family];

  const ts = resume.technicalSkills;
  if (ts && typeof ts === "object" && !Array.isArray(ts)) {
    const record = ts as Record<string, string[] | string>;
    const keys = Object.keys(record);
    const rank = (k: string) => {
      const i = profile.categoryOrder.findIndex((re) => re.test(k));
      return i === -1 ? profile.categoryOrder.length : i;
    };
    const orderedKeys = keys
      .map((k, i) => ({ k, i, r: rank(k) }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.k);
    const rebuilt: Record<string, string[] | string> = {};
    for (const k of orderedKeys) {
      const v = record[k];
      rebuilt[k] = Array.isArray(v)
        ? stableByScore(v, (s) => scoreTextForRole(String(s), family, jdKeywords))
        : v;
    }
    for (const k of keys) delete record[k];
    Object.assign(record, rebuilt);
  }

  for (const exp of resume.experience || []) {
    if (Array.isArray(exp?.bullets)) {
      exp.bullets = stableByScore<string>(exp.bullets, (b) => scoreTextForRole(b, family, jdKeywords));
    }
    if (Array.isArray(exp?.subheadings)) {
      for (const sub of exp.subheadings) {
        if (Array.isArray(sub?.bullets)) {
          sub.bullets = stableByScore<string>(sub.bullets, (b) => scoreTextForRole(b, family, jdKeywords));
        }
      }
    }
  }
  for (const proj of resume.projects || []) {
    if (Array.isArray(proj?.bullets)) {
      proj.bullets = stableByScore<string>(proj.bullets, (b) => scoreTextForRole(b, family, jdKeywords));
    }
  }
  if (Array.isArray(resume.projects) && resume.projects.length > 1) {
    const projText = (p: any) => `${p?.title || ""} ${p?.techStack || ""} ${(p?.bullets || []).join(" ")}`;
    resume.projects = stableByScore(resume.projects, (p) => scoreTextForRole(projText(p), family, jdKeywords));
  }
}

/** Supporting domains that can be named as complementary strengths, each gated on real resume evidence. */
const SUPPORT_DOMAINS: Array<{ family: RoleFamily; evidence: RegExp; phrase: string }> = [
  { family: "ai", evidence: /\b(?:yolo|computer vision|ocr|llms?|rag|machine learning|agentic|langchain|ai-powered|artificial intelligence)\b/i, phrase: "AI/RAG/computer vision" },
  { family: "hardware-software", evidence: /\b(?:drones?|ardupilot|mavlink|telemetry|ground control|zeromq|uav)\b/i, phrase: "real-time drone telemetry" },
  { family: "backend", evidence: /\b(?:distributed systems?|microservices?|fastapi|zeromq)\b/i, phrase: "distributed backend systems" },
  { family: "fullstack", evidence: /\b(?:react|next\.?js)\b/i, phrase: "full-stack web development" },
];

/** Strengths the resume really demonstrates outside the primary role, for "complemented by ..." phrasing. */
export function supportingStrengths(evidenceText: string, primary: RoleFamily): string[] {
  return SUPPORT_DOMAINS.filter((d) => d.family !== primary && d.evidence.test(evidenceText)).map((d) => d.phrase);
}

/** Family-specific lead-in for the summary's second sentence (followed by "using <verified skills>"). */
export const SUMMARY_LEAD: Record<RoleFamily, string> = {
  fullstack: "Delivered production web platforms spanning front-end interfaces, APIs, and data layers",
  ai: "Delivered production AI pipelines and LLM-powered workflows",
  backend: "Engineered high-reliability backend services and APIs",
  frontend: "Built responsive, production-grade user interfaces",
  "forward-deployed": "Delivered customer-ready integrations and production services",
  "hardware-software": "Delivered real-time systems that connect hardware to software",
  devops: "Operated containerized, production-grade services",
  data: "Built production data pipelines and query layers",
  generic: "Demonstrated expertise in engineering high-reliability systems and production services",
};

export function joinNatural(items: string[]): string {
  return items.length <= 1
    ? items.join("")
    : items.length === 2
      ? `${items[0]} and ${items[1]}`
      : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export interface RankedAchievement {
  company: string;
  /** Project/subheading the bullet belongs to ("" when the bullet sits directly under the role). */
  project: string;
  /** The candidate's title at that company ("" for standalone projects). */
  role: string;
  /** Technologies that appear in THIS project's own text only. */
  techs: string[];
  /** First-person clause that continues "At <company>, I ...", already trimmed to a clean length. */
  clause: string;
  hasMetric: boolean;
  /** True for a standalone project (no employer), whose "company" field holds the project title. */
  standalone?: boolean;
  score: number;
}

const METRIC = /\d+(?:\.\d+)?\s*(?:%|x\b|[KMB]\+|ms\b)|\b\d{1,3}(?:,\d{3})+\+?|\$\s?\d/i;
const PAST_VERB = /^(?:[A-Z][a-z]+(?:ed|t)|Built|Led|Cut|Ran|Wrote|Made|Drove|Grew|Won|Sped|Shipped|Spun|Taught|Began)\b/;

/** Technology vocabulary used to record which technologies each project's own text really mentions. */
const TECH_VOCAB: Array<[string, RegExp]> = [
  ["React", /\breact(?:\.js)?\b/i], ["Next.js", /\bnext\.?js\b/i], ["Node.js", /\bnode\.?js\b/i], ["Express.js", /\bexpress(?:\.js)?\b/i],
  ["MongoDB", /\bmongodb\b/i], ["PostgreSQL", /\bpostgres(?:ql)?\b/i], ["Redis", /\bredis\b/i], ["AWS", /\baws\b/i], ["GCP", /\bgcp\b/i],
  ["Python", /\bpython\b/i], ["FastAPI", /\bfastapi\b/i], ["Flask", /\bflask\b/i], ["TypeScript", /\btypescript\b/i], ["JavaScript", /\bjavascript\b/i],
  ["Docker", /\bdocker\b/i], ["ZeroMQ", /\bzeromq\b/i], ["WebSockets", /\bwebsockets?\b/i], ["MAVLink", /\bmavlink\b/i], ["GStreamer", /\bgstreamer\b/i],
  ["WebRTC", /\bwebrtc\b/i], ["YOLO", /\byolo\b/i], ["SAHI", /\bsahi\b/i], ["OCR", /\bocr\b/i], ["OpenCV", /\bopencv\b/i], ["Gemini", /\bgemini\b/i],
  ["RAG", /\brag\b|retrieval-augmented/i], ["LLMs", /\bllms?\b|llm orchestration/i], ["Computer Vision", /\bcomputer vision\b|\byolo\b|\bopencv\b|\bocr\b/i],
  ["Agentic AI", /\bagentic\b/i], ["CI/CD", /\bci\/cd\b/i], ["REST APIs", /\brest(?:ful)?\b/i], ["C++", /c\+\+/i], ["SQL", /\bsql\b/i],
];

function techsIn(text: string): string[] {
  return TECH_VOCAB.filter(([, re]) => re.test(text)).map(([name]) => name);
}

function trimClause(text: string, maxWords: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  // Metric-backed bullets keep extra room so the quantified result and what it applied to stay intact
  const limit = METRIC.test(clean) ? maxWords + 16 : maxWords;
  const words = clean.split(" ");
  if (words.length <= limit) return clean.replace(/[.;,]+$/, "");
  const cut = words.slice(0, limit).join(" ");
  const lastBreak = Math.max(cut.search(/,(?=\s)(?![^,;]*[,;]\s)/), cut.lastIndexOf(";"));
  const out = lastBreak > cut.length * 0.55 ? cut.slice(0, lastBreak) : cut;
  // Never end on a dangling connector ("... and standardized", "... with the")
  return out.replace(/(?:[\s,;:]+|\b(?:and|or|the|a|an|to|of|with|for|by|in|on|which|that|while|using|as)\b)+$/gi, "").trim();
}

/** One project (or role-level bullet group): the unit in which a technology/metric/achievement may be attributed. */
export interface EvidenceUnit {
  company: string;
  role: string;
  project: string;
  /** Short label for prose, e.g. "Vertx Startin" / "Drone GCS & Fleet Management Platform". */
  label: string;
  bullets: string[];
  techs: string[];
  score: number;
}

const LOCATION_ONLY = /^(?:india|remote|hybrid|on-?site|usa|united states|uk|united kingdom|[a-z ]+,\s*[a-z ]+)$/i;
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const DATE_TAIL = new RegExp(`\\s*(?:${MONTH}\\s+)?\\d{4}\\s*[-–—]\\s*(?:(?:${MONTH}\\s+)?\\d{4}|present|current)\\s*$`, "i");

/** Strips glued-on dates and trailing location words ("Vertx Remote Aug 2024 - Feb 2026" -> "Vertx"). */
function cleanCompanyName(raw: string): string {
  return raw
    .replace(DATE_TAIL, "")
    .replace(/\s+(?:india|remote|hybrid|on-?site|usa|united states|uk)\s*$/i, "")
    .trim();
}

const plainBullet = (b: string) => String(b || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();

/**
 * Splits the resume into project-scoped evidence units (experience subheadings, role-level bullets, standalone
 * projects), each carrying only the technologies its own text mentions, ranked for the target role. A role whose
 * title matches the family (e.g. "Founding Full-Stack Engineer" for a Full Stack JD) gets a ranking bonus.
 */
export function buildEvidenceUnits(resume: PrioritizableResume, family: RoleFamily, jdKeywords: string[] = []): EvidenceUnit[] {
  const units: EvidenceUnit[] = [];
  const titleRe = TITLE_RULES.find(([f]) => f === family)?.[1];
  const add = (company: string, role: string, project: string, bullets: unknown) => {
    const list = (Array.isArray(bullets) ? bullets : []).map(plainBullet).filter(Boolean);
    if (list.length === 0) return;
    const text = `${project} ${list.join(" ")}`;
    const roleBonus = titleRe && role && titleRe.test(role) ? 6 : 0;
    units.push({
      company,
      role,
      project,
      label: project || company,
      bullets: list,
      techs: techsIn(text),
      score: scoreTextForRole(text, family, jdKeywords) + roleBonus,
    });
  };
  // Parsers can mislabel this layout: dates/location glued onto the company, and project headings
  // ("Vertx Flow | AI Fundraising Platform") emitted as separate top-level entries. Normalize here so every
  // bullet stays tied to its real company, title, and project.
  let parent: { company: string; role: string } | null = null;
  for (const exp of resume.experience || []) {
    const rawCompany = String(exp?.company || "").trim();
    const rawRole = String(exp?.role || "").trim();
    const looksLikeProjectHeading =
      parent !== null && !exp?.dateRange && (!rawRole || rawRole === rawCompany || rawCompany.includes("|")) && (exp?.subheadings || []).length === 0;
    if (looksLikeProjectHeading && parent) {
      add(parent.company, parent.role, rawCompany.split("|")[0].trim(), exp?.bullets);
      continue;
    }
    const company = cleanCompanyName(rawCompany);
    const role = LOCATION_ONLY.test(rawRole) ? "" : rawRole;
    parent = { company, role };
    add(company, role, "", exp?.bullets);
    for (const sub of exp?.subheadings || []) {
      add(company, role, String(sub?.title || "").trim(), sub?.bullets);
    }
  }
  for (const p of resume.projects || []) {
    // Project headings often carry link labels/markup ("Invoice Extractor [Code](url) | Python"): keep only the name.
    const projectName = String(p?.title || "").replace(/\[[^\]]*\]\([^)]*\)/g, " ").split("|")[0].replace(/\s+/g, " ").trim();
    add("", "", projectName, [...(p?.bullets || []), p?.techStack ? `Tech: ${p.techStack}` : ""]);
  }
  return units.sort((a, b) => b.score - a.score);
}

/**
 * Every real bullet (metric-backed ones rank higher but are not required) from every project, ranked for the
 * target role, each tagged with its own project/role/technologies so nothing is attributed to the wrong project.
 */
export function rankAchievementsForRole(resume: PrioritizableResume, family: RoleFamily, jdKeywords: string[] = [], maxWords = 30): RankedAchievement[] {
  const out: RankedAchievement[] = [];
  for (const unit of buildEvidenceUnits(resume, family, jdKeywords)) {
    for (const plain of unit.bullets) {
      if (!PAST_VERB.test(plain)) continue;
      const hasMetric = METRIC.test(plain);
      out.push({
        company: unit.company || unit.project || "my previous role",
        project: unit.company ? unit.project : "",
        role: unit.role,
        techs: unit.techs,
        clause: trimClause(plain.charAt(0).toLowerCase() + plain.slice(1), maxWords),
        hasMetric,
        standalone: !unit.company,
        score: scoreTextForRole(plain, family, jdKeywords) + (hasMetric ? 4 : 0) + Math.min(unit.score, 12) / 2,
      });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export interface JDThemeMatch {
  id: string;
  label: string;
  supported: boolean;
  /** Labels of the projects/roles whose own text supports this theme. */
  where: string[];
  /** Prose fragment for a supported theme, e.g. "owned products end to end (Vertx Startin)". */
  phrase: string;
}

const JD_THEMES: Array<{ id: string; label: string; jd: RegExp; evidence: RegExp; phrase: string }> = [
  { id: "agentic", label: "Agentic AI systems", jd: /agentic(?!\s+cod)|ai agents?|multi-agent/i, evidence: /agentic|llm orchestration|multi-agent|model routing|ai workflows?/i, phrase: "built agentic AI and LLM workflows" },
  { id: "ai-assisted", label: "AI-assisted coding productivity (coding tools such as Cursor/Copilot/Claude Code)", jd: /agentic[- ]cod|ai[- ]assisted|copilot|cursor|claude code|vibe cod|coding assistants?|ai tools?|productivity/i, evidence: /ai[- ]assisted|copilot|cursor|claude code|coding assistants?|agentic coding/i, phrase: "used AI-assisted development to ship faster" },
  { id: "independent", label: "Independent execution / ownership", jd: /independent|self[- ]starter|self[- ]directed|ownership|\bown(?:ing)?\b|autonom|without (?:close )?supervision|end[- ]to[- ]end/i, evidence: /founding|spearheaded|launched|end-to-end|architected|from scratch/i, phrase: "owned products end to end" },
  { id: "debugging", label: "Debugging / problem solving", jd: /debug|troubleshoot|root cause|problem[- ]solving|production issues?/i, evidence: /debug|troubleshoot|root cause|reconnect|failure detection|zero-downtime|diagnos/i, phrase: "diagnosed and fixed production failures" },
  { id: "startup", label: "Startup adaptability", jd: /start-?ups?|fast[- ]paced|early[- ]stage|ambigu|wear many hats|adaptab|scrappy|0[- ]to[- ]1/i, evidence: /founding|start-?up|launched|from scratch|0 to 1/i, phrase: "worked as a founding engineer in a fast-moving startup" },
];

/**
 * Detects the soft requirements the JD calls out and checks each against the project-scoped evidence. Only
 * themes whose evidence exists in the candidate's own text are marked supported (and given a phrase).
 */
export function detectJDThemes(jobText: string, units: EvidenceUnit[]): JDThemeMatch[] {
  const out: JDThemeMatch[] = [];
  for (const t of JD_THEMES) {
    if (!t.jd.test(jobText || "")) continue;
    const hits = units.filter((u) => t.evidence.test(`${u.role} ${u.project} ${u.bullets.join(" ")}`));
    const where = Array.from(new Set(hits.map((u) => u.label))).slice(0, 1);
    out.push({
      id: t.id,
      label: t.label,
      supported: hits.length > 0,
      where,
      phrase: hits.length > 0 ? `${t.phrase}${where.length ? ` (${where.join(", ")})` : ""}` : "",
    });
  }
  return out;
}

/** Evidence-block text for LLM prompts: every project with ONLY its own technologies and bullets. */
export function formatEvidenceUnitsForPrompt(units: EvidenceUnit[]): string {
  return units
    .map(
      (u, i) =>
        `[${i + 1}] ${u.company ? `${u.company} - ` : ""}${u.role ? `${u.role} - ` : ""}${u.label}\n` +
        `    Technologies used in THIS project only: ${u.techs.join(", ") || "not stated"}\n` +
        u.bullets.map((b) => `    - ${b}`).join("\n")
    )
    .join("\n");
}

/** Technologies specific enough that attaching one to the wrong project is a factual error. */
const ATTRIBUTION_SENSITIVE = new Set([
  "Computer Vision", "YOLO", "SAHI", "OCR", "OpenCV", "RAG", "Agentic AI", "Gemini",
  "MAVLink", "ZeroMQ", "GStreamer", "WebRTC", "FastAPI", "Express.js", "MongoDB", "React", "Next.js", "Redis",
]);

/**
 * Checks a generated email against the project-scoped evidence and returns human-readable violations.
 * Every sentence that names a project (or, failing that, a company) may only use sensitive technologies that
 * appear together in ONE matching project; sentences naming nothing may not combine technologies that no single
 * project uses together.
 */
/** Names a sentence may use to refer to a project: its title plus adjacent word pairs ("integration hub"). */
function projectAliases(u: EvidenceUnit): string[] {
  const title = u.project.split("|")[0].trim();
  if (!title) return [];
  const words = title.split(/[^A-Za-z0-9.+#]+/).filter((w) => w.length >= 3);
  const pairs = words.slice(1).map((w, i) => `${words[i]} ${w}`).filter((p) => !/^ai powered\b/i.test(p));
  return [title, ...pairs];
}

/** True when the text names the company, tolerating legal suffixes and spacing ("JulleyOnline" = "Julley Online Private Limited"). */
function mentionsCompany(text: string, company: string): boolean {
  const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const core = company.replace(/(?:private|pvt|limited|ltd|inc|llc)\.?/gi, "").trim();
  const t = squash(text);
  return [company, core].some((c) => squash(c).length >= 3 && t.includes(squash(c)));
}

export function findAttributionViolations(text: string, units: EvidenceUnit[]): string[] {
  const violations: string[] = [];
  const sentences = String(text || "").split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const mentions = (sentence: string, needle: string) => {
    const n = needle.trim();
    return n.length >= 3 && sentence.toLowerCase().includes(n.toLowerCase());
  };
  for (const sentence of sentences) {
    const used = TECH_VOCAB.filter(([name, re]) => ATTRIBUTION_SENSITIVE.has(name) && re.test(sentence)).map(([name]) => name);
    if (used.length === 0) continue;
    const byProject = units.filter((u) => projectAliases(u).some((alias) => mentions(sentence, alias)));
    const byCompany = units.filter((u) => u.company && mentionsCompany(sentence, u.company));
    // Sentences naming no project/company are general skill statements (already gated by the verified-skills
    // rule), so only project- or company-scoped claims are checked.
    if (byProject.length === 0 && byCompany.length === 0) continue;
    const scope = byProject.length > 0 ? byProject : byCompany;
    const ok = scope.some((u) => used.every((t) => u.techs.includes(t)));
    if (!ok) {
      const where = byProject.length > 0 ? byProject.map((u) => u.label).join(" / ") : byCompany[0].company;
      violations.push(`"${sentence.slice(0, 140)}" combines ${used.join(", ")} but no single project of ${where} uses all of them`);
    }
  }
  return violations;
}

export interface EmailCandidateIdentity {
  fullName?: string;
  emails?: string[];
  urls?: string[];
}

const METRIC_TOKEN = /\d{1,3}(?:,\d{3})+\+?|\d+(?:\.\d+)?\s*(?:%|x\b|[KMB]\+)/gi;
const normMetric = (m: string) => m.replace(/\s+/g, "").toLowerCase();

/**
 * Full pre-send validation of a generated email against ONE candidate's own evidence. Returns human-readable
 * violations (empty = safe): project->technology attribution, employer->project association, metric->project
 * attribution, technologies/metrics the resume never states, foreign identity/contact details, and missing
 * role/company relevance. `evidenceText` is the final resume text (skills + bullets) the email must agree with.
 */
export function validateEmailAgainstCandidate(params: {
  subject: string;
  body: string;
  units: EvidenceUnit[];
  evidenceText: string;
  identity: EmailCandidateIdentity;
  companyName?: string;
  roleTitle?: string;
  family?: RoleFamily;
  /** The only recruiter name the greeting may use ("" = must be "Hi Hiring Team,"). */
  allowedGreetingName?: string;
}): string[] {
  const { subject, body, units, evidenceText, identity } = params;
  const full = `${subject}\n${body}`;
  const violations = findAttributionViolations(full, units);
  const evidence = plainBullet(evidenceText).toLowerCase();
  const mentions = (s: string, n: string) => n.trim().length >= 3 && s.toLowerCase().includes(n.trim().toLowerCase());
  const sentences = full.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);

  // Unsupported technologies / metrics: anything claimed must exist in the candidate's own resume.
  if (evidence) {
    for (const [name, re] of TECH_VOCAB) {
      if (name !== "REST APIs" && re.test(full) && !re.test(evidenceText)) violations.push(`technology "${name}" is not on the candidate's resume`);
    }
    const evidenceMetrics = new Set((evidenceText.match(METRIC_TOKEN) || []).map(normMetric));
    for (const m of full.match(METRIC_TOKEN) || []) {
      if (!evidenceMetrics.has(normMetric(m))) violations.push(`metric "${m}" is not on the candidate's resume`);
    }
  }

  for (const sentence of sentences) {
    const byProject = units.filter((u) => projectAliases(u).some((a) => mentions(sentence, a)));
    const byCompany = units.filter((u) => u.company && mentionsCompany(sentence, u.company));
    // Employer-to-project: a sentence naming a project and an employer must name that project's own employer.
    if (byProject.length > 0 && byCompany.length > 0 && !byProject.some((p) => byCompany.some((c) => c.company === p.company))) {
      violations.push(`"${sentence.slice(0, 120)}" pairs project ${byProject[0].label} with the wrong employer`);
    }
    // Metric-to-project: metrics in a project/company-scoped sentence must come from that scope's own bullets.
    const scope = byProject.length > 0 ? byProject : byCompany;
    const metrics = sentence.match(METRIC_TOKEN) || [];
    if (scope.length > 0 && metrics.length > 0) {
      // All metrics in one sentence must come from a single project; never merge metrics of sibling projects.
      const fits = scope.some((u) => {
        const own = new Set((u.bullets.join(" ").match(METRIC_TOKEN) || []).map(normMetric));
        return metrics.every((m) => own.has(normMetric(m)));
      });
      if (!fits) violations.push(`"${sentence.slice(0, 120)}" merges metrics that no single ${scope[0].project || scope[0].company} project contains together`);
    }
  }

  // Identity: only this candidate's contact details and name may appear.
  const knownEmails = new Set((identity.emails || []).map((e) => e.toLowerCase()));
  for (const e of full.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || []) {
    if (!knownEmails.has(e.toLowerCase())) violations.push(`email ${e} does not belong to this candidate`);
  }
  const knownUrls = (identity.urls || []).map((u) => u.toLowerCase().replace(/^https?:\/\/(?:www\.)?/, "").replace(/\/$/, ""));
  for (const u of full.match(/(?:https?:\/\/|www\.)[^\s)]+|(?:linkedin|github)\.com\/[^\s)]+/gi) || []) {
    const n = u.toLowerCase().replace(/^https?:\/\/(?:www\.)?/, "").replace(/[.,;]+$/, "").replace(/\/$/, "");
    if (!knownUrls.some((k) => k === n || n.startsWith(k) || k.startsWith(n))) violations.push(`link ${u} does not belong to this candidate`);
  }
  const nameTokens = (identity.fullName || "").toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (nameTokens.length > 0) {
    const signoff = body.match(/(?:best regards|regards|sincerely|thanks|thank you),?\s*\n+\s*([^\n]+)\s*$/i)?.[1]?.trim();
    if (signoff && !signoff.toLowerCase().split(/\s+/).some((t) => nameTokens.includes(t))) {
      violations.push(`sign-off name "${signoff}" does not match the candidate "${identity.fullName}"`);
    }
  }

  // Greeting: only the verified recruiter name for THIS application, otherwise the generic team greeting.
  if (params.allowedGreetingName !== undefined) {
    const greeted = body.trim().match(/^(?:hi|hello|dear)\s+([^,\r\n]+),/i)?.[1]?.trim();
    const want = params.allowedGreetingName.trim().toLowerCase();
    if (greeted && greeted.toLowerCase() !== want && !(want === "" && /^hiring team$/i.test(greeted))) {
      violations.push(`greeting "${greeted}" is not the verified recruiter for this application`);
    }
  }

  // Role focus: AI/CV may only be a complementary mention for non-AI roles.
  if (params.family && params.family !== "ai") {
    const cv = sentences.filter((x) => /(?:computer vision|yolo|sahi|opencv|ocr)/i.test(x)).length;
    if (cv > 1) violations.push(`computer vision is mentioned in ${cv} sentences; for a ${params.family} role it may be only one complementary mention`);
  }

  // Target-role relevance.
  const company = (params.companyName || "").trim();
  if (company && !/^the hiring team$/i.test(company) && !mentions(body, company)) violations.push(`body never names the target company ${company}`);
  return Array.from(new Set(violations));
}

const STOP_WORDS = new Set(["with", "that", "from", "this", "into", "over", "using", "their", "which", "while", "have", "been", "your", "were", "than", "such", "each", "also", "more"]);
const contentWords = (t: string) => new Set((String(t).toLowerCase().match(/[a-z][a-z0-9+#.]{3,}/g) || []).filter((w) => !STOP_WORDS.has(w)));

/**
 * Maps each email bullet ("- ...") to the evidence unit (project/role) whose own bullets it overlaps most and
 * reports bullets that resolve to the SAME unit: a recruiter should see distinct projects, not one project three times.
 */
export function findRepeatedProjectBullets(body: string, units: EvidenceUnit[]): string[] {
  const bullets = String(body || "").split(/\r?\n/).filter((l) => /^\s*[-•*]\s+\S/.test(l)).map((l) => l.replace(/^\s*[-•*]\s+/, ""));
  const unitWords = units.map((u) => contentWords(u.bullets.join(" ")));
  const byUnit = new Map<number, string[]>();
  for (const b of bullets) {
    const words = contentWords(b);
    let best = -1;
    let bestScore = 0;
    unitWords.forEach((uw, i) => {
      let overlap = 0;
      words.forEach((w) => { if (uw.has(w)) overlap++; });
      if (overlap > bestScore) { bestScore = overlap; best = i; }
    });
    if (best >= 0 && bestScore >= 5) byUnit.set(best, [...(byUnit.get(best) || []), b]);
  }
  const out: string[] = [];
  byUnit.forEach((list, i) => {
    if (list.length > 1) out.push(`${list.length} bullets describe the same project (${units[i].label}); use one bullet per project and pick other relevant projects`);
  });
  return out;
}
