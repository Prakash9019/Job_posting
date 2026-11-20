/**
 * Plain-text enforcement for application emails (sent as text/plain, so any Markdown/HTML reaches the recruiter
 * literally). Used on AI output AND on the deterministic fallback before a draft is saved.
 *
 * normalizePlainTextEmail() repairs what can be repaired without touching meaning: URLs and e-mail addresses are
 * protected first, so underscores, asterisks or brackets inside them are never altered. findPlainTextViolations()
 * reports anything that still does not look like a clean plain-text email (used as a final gate and in tests).
 */

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()"'`]+[^\s<>()"'`.,;:!?*_]|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gi;

/** Replaces URLs/e-mails with placeholders, applies `fn`, then restores them unchanged. */
function withProtectedUrls(text: string, fn: (t: string) => string): string {
  const saved: string[] = [];
  const masked = text.replace(URL_RE, (m) => `\u0000${saved.push(m) - 1}\u0000`);
  return fn(masked).replace(/\u0000(\d+)\u0000/g, (_, i) => saved[Number(i)]);
}

const HTML_ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&ndash;": "–", "&mdash;": "—", "&rsquo;": "’", "&lsquo;": "‘", "&rdquo;": "”", "&ldquo;": "“" };

/** Unwraps a body that was returned as JSON (or double-encoded JSON string) instead of plain text. */
function unwrapJsonBody(text: string): string {
  const t = text.trim();
  if (/^\{[\s\S]*"body"\s*:/.test(t)) {
    try {
      const parsed = JSON.parse(t) as { body?: unknown };
      if (typeof parsed.body === "string") return parsed.body;
    } catch { /* not JSON after all */ }
  }
  if (/^"[\s\S]*"$/.test(t) && /\\n/.test(t)) {
    try {
      const parsed = JSON.parse(t);
      if (typeof parsed === "string") return parsed;
    } catch { /* keep */ }
  }
  return text;
}

export function normalizePlainTextEmail(input: string): string {
  let text = unwrapJsonBody(String(input || ""));
  text = text.replace(/\r\n?/g, "\n");
  // Literal "\n" sequences from double-encoded output (only when the text has no real line breaks at all).
  if (!text.includes("\n") && /\\n/.test(text)) text = text.replace(/\\n/g, "\n");

  // Code fences: keep the inner text.
  text = text.replace(/^\s*```[a-z]*\s*$/gim, "");

  text = withProtectedUrls(text, (t) => {
    let s = t;
    // Markdown links: [label](url) -> "label (url)", or just the url when the label is the url / a placeholder.
    s = s.replace(/\[([^\]\n]{1,120})\]\((\u0000\d+\u0000)\)/g, (_, label: string, url: string) => (/^\u0000\d+\u0000$/.test(label.trim()) ? url : `${label.trim()}: ${url}`));
    // Links with no real target ("[GitHub](#)") keep only their label.
    s = s.replace(/\[([^\]\n]{1,120})\]\((?:#[^)\s]*|[^)\s\u0000]{0,200})\)/g, "$1");
    // Whitelisted HTML tags only (never "<5 years" or other legitimate angle brackets).
    s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n\n").replace(/<li[^>]*>\s*/gi, "\n- ");
    s = s.replace(/<\/?(?:p|div|span|b|strong|i|em|u|ul|ol|li|h[1-6]|html|body|font)(?:\s[^<>]*)?>/gi, "");
    s = s.replace(/&(?:amp|lt|gt|quot|apos|nbsp|ndash|mdash|rsquo|lsquo|rdquo|ldquo|#39);/g, (e) => HTML_ENTITIES[e] ?? e);
    // Headings: "## Experience" -> "Experience".
    s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "");
    // Horizontal rules.
    s = s.replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "");
    // Bold / italic / inline code markers (content kept).
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, "$1").replace(/__([^_\n]+?)__/g, "$1");
    s = s.replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=[\s).,;:!?]|$)/gm, "$1$2");
    s = s.replace(/(^|[\s(])_([^_\s][^_\n]*?)_(?=[\s).,;:!?]|$)/gm, "$1$2");
    s = s.replace(/`{1,3}([^`\n]*)`{1,3}/g, "$1").replace(/`/g, "");
    // Escaped Markdown punctuation: "C\#" -> "C#", "Next\.js" -> "Next.js".
    s = s.replace(/\\([*_#`[\]().!+\-|>~])/g, "$1");
    // Bullets: "•", "*", "·", "▪", "–", "—" at line start -> "- "; stray bold remnants "**" removed.
    s = s.replace(/^[ \t]*(?:[•*·▪◦●]|[–—](?=\s))[ \t]*/gm, "- ");
    s = s.replace(/^[ \t]*-[ \t]+/gm, "- ");
    s = s.replace(/\*\*/g, "");
    return s;
  });

  const lines = text.split("\n").map((l) => l.trim());
  // Drop a leading "Subject: ..." line (the subject is a separate field) and trailing model commentary.
  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length && /^subject\s*:/i.test(lines[0])) {
    lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
  }
  const COMMENTARY = /^\(?(?:note|word count|explanation|this email|i (?:have|kept|focused|chose)|here(?:'s| is) (?:the|your|a)|key ?points|why this works)\b[^]*$/i;
  while (lines.length && (!lines[lines.length - 1].trim() || COMMENTARY.test(lines[lines.length - 1].trim()))) lines.pop();
  if (lines.length && /^(?:here(?:'s| is) (?:the|your|a) (?:email|draft)|sure[,!])/i.test(lines[0].trim())) {
    lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
  }

  let out = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Quotes wrapping the entire email.
  const q = out.match(/^(["“'])([\s\S]+)(["”'])$/);
  if (q && !q[2].includes(q[1] === "“" ? "”" : q[1])) out = q[2].trim();
  return out;
}

/** Subject lines: same cleanup, single line. */
export function normalizePlainTextSubject(input: string): string {
  const unprefixed = String(input || "").replace(/^\s*(?:\*\*|__)?\s*subject\s*(?::\s*(?:\*\*|__)?|(?:\*\*|__)\s*:)\s*/i, "");
  return normalizePlainTextEmail(unprefixed).replace(/\s*\n+\s*/g, " ").replace(/^["“']|["”']$/g, "").trim();
}

const LEAK_RE = /\b(?:PROJECT_EVIDENCE|VERIFIED_[A-Z_]+|TARGET_ROLE|CANDIDATE_[A-Z_]+|JOB_REQUIREMENTS|GREETING_LINE|SUBJECT_REQUIREMENT|PREVIOUS_ATTEMPT_REJECTED|REJECTED_JD_SKILLS|HIRING_NEEDS|EVIDENCE_MAP|keyPointsMatched)\b|as an ai (?:language )?model|\bword count\b/i;

/** Problems that make a body unfit to send as plain text. Empty array = clean. */
export function findPlainTextViolations(body: string): string[] {
  const v: string[] = [];
  const b = String(body || "");
  const noUrls = b.replace(URL_RE, "");
  if (/\*\*|__\S/.test(noUrls)) v.push("Markdown bold markers");
  if (/`/.test(noUrls)) v.push("backticks / code formatting");
  if (/^[ \t]{0,3}#{1,6}\s/m.test(b)) v.push("Markdown heading");
  if (/\[[^\]\n]+\]\([^)\n]+\)/.test(b)) v.push("Markdown link syntax");
  if (/<\/?(?:p|div|span|b|strong|i|em|u|ul|ol|li|br|h[1-6])\b[^<>]*>/i.test(b)) v.push("HTML tags");
  if (/&(?:amp|lt|gt|quot|nbsp|#39);/.test(b)) v.push("HTML entities");
  if (/^\s*[{[]/.test(b) || /"(?:subject|body)"\s*:/.test(b)) v.push("raw JSON");
  if (/\\[nt*_#]/.test(b)) v.push("escaped characters");
  if (/^\s*["“][\s\S]*["”]\s*$/.test(b)) v.push("quotes wrapping the whole email");
  if (/^[ \t]*(?:[•*·▪◦●])\s/m.test(b)) v.push("non-plain bullet characters");
  if (/\[(?:your|company|candidate|recruiter|hiring manager|role|name|position|x|y)[^\]]*\]/i.test(b)) v.push("unfilled placeholder");
  if (LEAK_RE.test(b)) v.push("internal prompt/validation text");
  return v;
}
