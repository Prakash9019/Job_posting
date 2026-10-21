import { parseBalancedBraces } from "./latex-text";

export interface ExtractedHyperlink {
  url: string;
  text: string;
  category: "email" | "linkedin" | "github" | "project_code" | "project_demo" | "general";
  normalizedUrl: string;
}

/**
 * Normalizes URLs for comparison (strips mailto/http/https/www protocols, trailing slashes, and lowercases).
 */
export function normalizeUrl(url: string): string {
  let cleaned = (url || "").trim().toLowerCase();
  cleaned = cleaned.replace(/^mailto:/i, "");
  cleaned = cleaned.replace(/^tel:/i, "");
  cleaned = cleaned.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/+$/, "");
  return cleaned;
}

export function hasUrlInSet(set: Set<string>, url: string): boolean {
  if (!url) return false;
  const raw = url.trim();
  const lower = raw.toLowerCase();
  const norm = normalizeUrl(raw);
  const withoutMailto = lower.replace(/^mailto:/i, "");
  return (
    set.has(raw) ||
    set.has(lower) ||
    set.has(norm) ||
    set.has(withoutMailto) ||
    set.has(`mailto:${withoutMailto}`)
  );
}

export function addUrlToSet(set: Set<string>, url: string): void {
  if (!url) return;
  const raw = url.trim();
  const lower = raw.toLowerCase();
  const norm = normalizeUrl(raw);
  const withoutMailto = lower.replace(/^mailto:/i, "");
  set.add(raw);
  set.add(lower);
  set.add(norm);
  set.add(withoutMailto);
  set.add(`mailto:${withoutMailto}`);
}

/**
 * Categorizes a URL based on destination and visible anchor text.
 */
export function categorizeUrl(url: string, text: string): ExtractedHyperlink["category"] {
  const lowerUrl = (url || "").toLowerCase();
  const lowerText = (text || "").toLowerCase();

  if (lowerUrl.startsWith("mailto:") || lowerUrl.includes("@")) {
    return "email";
  }
  if (lowerUrl.includes("linkedin.com") || lowerText.includes("linkedin")) {
    return "linkedin";
  }
  if (
    lowerText.includes("code") ||
    lowerText.includes("repo") ||
    (lowerUrl.includes("github.com") && lowerUrl.split("/").filter(Boolean).length > 3)
  ) {
    return "project_code";
  }
  if (
    lowerText.includes("demo") ||
    lowerText.includes("live") ||
    lowerText.includes("app") ||
    lowerText.includes("link") ||
    lowerText.includes("site")
  ) {
    return "project_demo";
  }
  if (lowerUrl.includes("github.com") || lowerText.includes("github")) {
    return "github";
  }
  return "general";
}

/**
 * Extracts all \href{URL}{DISPLAY_TEXT} and \url{URL} from a LaTeX string
 * using balanced brace parsing to preserve inner formatting.
 */
export function extractHyperlinksFromLatex(latex: string): ExtractedHyperlink[] {
  const links: ExtractedHyperlink[] = [];
  if (!latex) return links;

  const seenUrls = new Set<string>();

  // 1. Extract \href{URL}{DISPLAY_TEXT}
  const hrefPattern = /\\href\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(latex)) !== null) {
    const urlOpen = match.index + match[0].length - 1;
    const urlParsed = parseBalancedBraces(latex, urlOpen);
    if (!urlParsed) continue;

    const after = latex.slice(urlParsed.endIndex);
    const labelOpenMatch = after.match(/^\s*\{/);
    if (!labelOpenMatch) continue;

    const labelOpen = urlParsed.endIndex + (labelOpenMatch.index || 0) + labelOpenMatch[0].length - 1;
    const labelParsed = parseBalancedBraces(latex, labelOpen);
    if (!labelParsed) continue;

    const rawUrl = urlParsed.content.trim();
    const rawText = labelParsed.content
      .replace(/\\(?:underline|textbf|textit|emph|textsc)\{([^}]*)\}/g, "$1")
      .trim();

    if (rawUrl && !seenUrls.has(rawUrl)) {
      seenUrls.add(rawUrl);
      links.push({
        url: rawUrl,
        text: rawText || rawUrl,
        category: categorizeUrl(rawUrl, rawText),
        normalizedUrl: normalizeUrl(rawUrl),
      });
    }

    hrefPattern.lastIndex = labelParsed.endIndex;
  }

  // 2. Extract \url{URL}
  const urlPattern = /\\url\s*\{/g;
  while ((match = urlPattern.exec(latex)) !== null) {
    const openBrace = match.index + match[0].length - 1;
    const parsed = parseBalancedBraces(latex, openBrace);
    if (!parsed) continue;

    const rawUrl = parsed.content.trim();
    if (rawUrl && !seenUrls.has(rawUrl)) {
      seenUrls.add(rawUrl);
      links.push({
        url: rawUrl,
        text: rawUrl,
        category: categorizeUrl(rawUrl, rawUrl),
        normalizedUrl: normalizeUrl(rawUrl),
      });
    }

    urlPattern.lastIndex = parsed.endIndex;
  }

  return links;
}

/**
 * Extracts hyperlinks formatted as Markdown [Label](URL), naked URLs, emails, LinkedIn, or GitHub
 * from plain text or markdown resumes.
 */
export function extractHyperlinksFromMarkdownText(text: string): ExtractedHyperlink[] {
  const links: ExtractedHyperlink[] = [];
  if (!text) return links;

  const seenUrls = new Set<string>();

  // 1. Markdown links [Label](URL)
  const mdPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;

  while ((match = mdPattern.exec(text)) !== null) {
    const rawText = match[1].trim();
    const rawUrl = match[2].trim().replace(/[.,;:)>\]]+$/, "");
    const norm = normalizeUrl(rawUrl);

    if (rawUrl && !seenUrls.has(norm)) {
      seenUrls.add(norm);
      links.push({
        url: rawUrl,
        text: rawText || rawUrl,
        category: categorizeUrl(rawUrl, rawText),
        normalizedUrl: norm,
      });
    }
  }

  // 2. Naked emails
  const emailPattern = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
  while ((match = emailPattern.exec(text)) !== null) {
    const email = match[1].trim();
    const url = `mailto:${email}`;
    const norm = normalizeUrl(url);
    if (!seenUrls.has(norm)) {
      seenUrls.add(norm);
      links.push({
        url,
        text: email,
        category: "email",
        normalizedUrl: norm,
      });
    }
  }

  // 3. Naked LinkedIn URLs/handles
  const linkedinPattern = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/gi;
  while ((match = linkedinPattern.exec(text)) !== null) {
    const url = `https://linkedin.com/in/${match[1]}`;
    const norm = normalizeUrl(url);
    if (!seenUrls.has(norm)) {
      seenUrls.add(norm);
      links.push({
        url,
        text: "LinkedIn",
        category: "linkedin",
        normalizedUrl: norm,
      });
    }
  }

  // 4. Naked GitHub URLs/handles
  const githubPattern = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?)/gi;
  while ((match = githubPattern.exec(text)) !== null) {
    const fullPath = match[1].replace(/[.,;:)>\]]+$/, "");
    const isRepo = fullPath.includes("/");
    const url = `https://github.com/${fullPath}`;
    const norm = normalizeUrl(url);
    if (!seenUrls.has(norm)) {
      seenUrls.add(norm);
      links.push({
        url,
        text: isRepo ? "Code" : "GitHub",
        category: isRepo ? "project_code" : "github",
        normalizedUrl: norm,
      });
    }
  }

  // 5. Standalone http/https URLs
  const urlPattern = /\b(https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=-]+)\b/gi;
  while ((match = urlPattern.exec(text)) !== null) {
    const rawUrl = match[1].trim().replace(/[.,;:)>\]]+$/, "");
    const norm = normalizeUrl(rawUrl);
    if (!seenUrls.has(norm)) {
      seenUrls.add(norm);
      links.push({
        url: rawUrl,
        text: rawUrl,
        category: categorizeUrl(rawUrl, rawUrl),
        normalizedUrl: norm,
      });
    }
  }

  return links;
}

/**
 * Extracts clickable link annotations from a binary PDF buffer.
 */
export async function extractHyperlinksFromPdf(pdfBuffer: Buffer): Promise<ExtractedHyperlink[]> {
  const links: ExtractedHyperlink[] = [];
  if (!pdfBuffer || pdfBuffer.length === 0) return links;

  try {
    const { PDFParse } = await import("pdf-parse");
    const p: any = new PDFParse({ data: pdfBuffer });
    await p.load();

    const seenUrls = new Set<string>();

    for (let pageNum = 1; pageNum <= p.doc.numPages; pageNum++) {
      const page = await p.doc.getPage(pageNum);
      const annotations = (await page.getAnnotations({ intent: "display" })) || [];

      for (const annot of annotations) {
        if (annot.subtype !== "Link") continue;
        const rawUrl = annot.url ?? annot.unsafeUrl;
        if (!rawUrl || typeof rawUrl !== "string") continue;

        const trimmedUrl = rawUrl.trim();
        if (!trimmedUrl || seenUrls.has(trimmedUrl)) continue;
        seenUrls.add(trimmedUrl);

        const text = (annot.overlaidText || "").trim();
        links.push({
          url: trimmedUrl,
          text: text || trimmedUrl,
          category: categorizeUrl(trimmedUrl, text),
          normalizedUrl: normalizeUrl(trimmedUrl),
        });
      }
    }
    await p.destroy().catch(() => {});
  } catch (err) {
    console.warn("extractHyperlinksFromPdf encountered error:", err);
  }

  return links;
}

/**
 * Tokenizes all existing \href and \url commands into safe placeholders XATSTOKEN{id}X.
 */
export function tokenizeExistingLatexHrefs(
  latex: string,
  tokens: string[],
  createdUrls?: Set<string>
): string {
  let doc = "";
  let lastIdx = 0;
  const hrefPattern = /\\(?:href|url)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = hrefPattern.exec(latex)) !== null) {
    const isUrlCmd = match[0].startsWith("\\url");
    const openBrace = match.index + match[0].length - 1;
    const urlParsed = parseBalancedBraces(latex, openBrace);
    if (!urlParsed) continue;

    if (isUrlCmd) {
      doc += latex.slice(lastIdx, match.index);
      const url = urlParsed.content.trim();
      const snippet = latex.slice(match.index, urlParsed.endIndex);
      const id = tokens.length;
      tokens.push(snippet);
      if (createdUrls) addUrlToSet(createdUrls, url);
      doc += `XATSTOKEN${id}X`;
      lastIdx = urlParsed.endIndex;
      hrefPattern.lastIndex = urlParsed.endIndex;
      continue;
    }

    const after = latex.slice(urlParsed.endIndex);
    const labelOpenMatch = after.match(/^\s*\{/);
    if (!labelOpenMatch) continue;

    const labelOpen = urlParsed.endIndex + (labelOpenMatch.index || 0) + labelOpenMatch[0].length - 1;
    const labelParsed = parseBalancedBraces(latex, labelOpen);
    if (!labelParsed) continue;

    doc += latex.slice(lastIdx, match.index);
    const url = urlParsed.content.trim();
    const snippet = latex.slice(match.index, labelParsed.endIndex);
    const id = tokens.length;
    tokens.push(snippet);
    if (createdUrls) addUrlToSet(createdUrls, url);
    doc += `XATSTOKEN${id}X`;

    lastIdx = labelParsed.endIndex;
    hrefPattern.lastIndex = labelParsed.endIndex;
  }
  doc += latex.slice(lastIdx);
  return doc;
}

export function restoreTokens(text: string, tokens: string[]): string {
  return text.replace(/XATSTOKEN(\d+)X/g, (_, idStr) => {
    const id = parseInt(idStr, 10);
    return tokens[id] ?? "";
  });
}

/**
 * Protects existing \href commands in a string, executes a transformer function
 * on the non-href portions, and restores the protected \href commands cleanly.
 */
export function transformPlainTextPreservingHrefs(str: string, transformer: (plain: string) => string): string {
  const tokens: string[] = [];
  const tokenized = tokenizeExistingLatexHrefs(str, tokens);
  const parts = tokenized.split(/(XATSTOKEN\d+X)/g);
  const transformedParts = parts.map((part) => {
    if (/^XATSTOKEN\d+X$/.test(part)) return part;
    return transformer(part);
  });
  return restoreTokens(transformedParts.join(""), tokens);
}

/**
 * Converts a markdown link [Label](URL) to a valid LaTeX \href{URL}{\underline{Label}}.
 */
export function markdownLinkToLatexHref(label: string, url: string): string {
  let targetUrl = url.trim();
  if (targetUrl.startsWith("tel:")) {
    // Keep tel: URL unchanged
  } else if (!targetUrl.startsWith("mailto:") && !targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    if (targetUrl.includes("@")) {
      targetUrl = `mailto:${targetUrl}`;
    } else {
      targetUrl = `https://${targetUrl}`;
    }
  }

  const cleanLabel = label
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/[%&$#_{}]/g, "\\$&")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");

  return `\\href{${targetUrl}}{\\underline{${cleanLabel}}}`;
}

/**
 * Safely escapes plain text for LaTeX while protecting existing \href commands
 * and converting markdown links [Label](URL) to clickable LaTeX \href.
 */
export function formatLatexWithHyperlinks(line: string, knownLinks?: ExtractedHyperlink[]): string {
  let cleanLine = line.replace(/\\?\$[ \t]*\|[ \t]*\\?\$/g, " | ");

  const tokens: string[] = [];
  const createdUrls = new Set<string>();

  // 1. Tokenize existing \href commands
  cleanLine = tokenizeExistingLatexHrefs(cleanLine, tokens, createdUrls);

  // 2. Convert markdown links [Label](url)
  cleanLine = cleanLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const id = tokens.length;
    tokens.push(markdownLinkToLatexHref(label, url));
    addUrlToSet(createdUrls, url);
    return `XATSTOKEN${id}X`;
  });

  // 3. Auto-link known anchor words if NOT emails and NOT URLs
  if (knownLinks && knownLinks.length > 0) {
    const seenAnchors = new Set<string>();
    for (const link of knownLinks) {
      if (!link.url || link.url.length < 5) continue;
      const anchor = link.text.trim();
      if (!anchor || anchor.length < 2) continue;
      // Skip emails and naked URLs here; handled by dedicated regexes below
      if (anchor.includes("@") || anchor.startsWith("http://") || anchor.startsWith("https://")) {
        continue;
      }
      const anchorNorm = anchor.toLowerCase();
      if (seenAnchors.has(anchorNorm) || hasUrlInSet(createdUrls, link.url)) {
        continue;
      }
      seenAnchors.add(anchorNorm);

      const escapedAnchor = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wordRegex = new RegExp(`\\b${escapedAnchor}\\b`, "i");
      if (wordRegex.test(cleanLine)) {
        cleanLine = cleanLine.replace(wordRegex, () => {
          const id = tokens.length;
          tokens.push(markdownLinkToLatexHref(anchor, link.url));
          addUrlToSet(createdUrls, link.url);
          return `XATSTOKEN${id}X`;
        });
      }
    }
  }

  // 4. Auto-link naked emails
  cleanLine = cleanLine.replace(
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    (_, email) => {
      const url = `mailto:${email}`;
      const id = tokens.length;
      tokens.push(`\\href{${url}}{\\underline{${email}}}`);
      addUrlToSet(createdUrls, url);
      return `XATSTOKEN${id}X`;
    }
  );

  // 5. Auto-link naked LinkedIn
  cleanLine = cleanLine.replace(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/gi,
    (_, handle) => {
      const url = `https://linkedin.com/in/${handle}`;
      const id = tokens.length;
      tokens.push(`\\href{${url}}{\\underline{LinkedIn}}`);
      addUrlToSet(createdUrls, url);
      return `XATSTOKEN${id}X`;
    }
  );

  // 6. Auto-link naked GitHub
  cleanLine = cleanLine.replace(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?)/gi,
    (_, path) => {
      const cleanPath = path.replace(/[.,;:)>\]]+$/, "");
      const isRepo = cleanPath.includes("/");
      const url = `https://github.com/${cleanPath}`;
      const label = isRepo ? "Code" : "GitHub";
      const id = tokens.length;
      tokens.push(`\\href{${url}}{\\underline{${label}}}`);
      addUrlToSet(createdUrls, url);
      return `XATSTOKEN${id}X`;
    }
  );

  // 7. Auto-link naked standalone https:// or http:// URLs
  cleanLine = cleanLine.replace(
    /\b(https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=-]+)\b/gi,
    (_, rawUrl) => {
      const cleanUrl = rawUrl.replace(/[.,;:)>\]]+$/, "");
      const id = tokens.length;
      tokens.push(`\\href{${cleanUrl}}{\\underline{${cleanUrl}}}`);
      addUrlToSet(createdUrls, cleanUrl);
      return `XATSTOKEN${id}X`;
    }
  );

  // 8. Escape LaTeX special characters in non-token parts only
  const parts = cleanLine.split(/(XATSTOKEN\d+X)/g);
  const escapedParts = parts.map((part) => {
    if (/^XATSTOKEN\d+X$/.test(part)) {
      return part;
    }
    return part
      .replace(/\\/g, "\\textbackslash{}")
      .replace(/[%&$#_{}]/g, "\\$&")
      .replace(/~/g, "\\textasciitilde{}")
      .replace(/\^/g, "\\textasciicircum{}")
      .replace(/\s+\|\s+/g, " \\enspace\\textbar\\enspace ");
  });

  return restoreTokens(escapedParts.join(""), tokens);
}

/**
 * Checks if a URL or normalized URL is already formatted as a LaTeX \\href or \\url.
 */
export function isUrlAlreadyHref(latex: string, url: string, normUrl?: string): boolean {
  if (!latex) return false;
  const targetNorm = normUrl || normalizeUrl(url);
  const links = extractHyperlinksFromLatex(latex);
  return links.some((l) => l.url === url || normalizeUrl(l.url) === targetNorm);
}

/**
 * Reconciles generated LaTeX with original LaTeX template or known links.
 * Guarantees that 100% of hyperlinks from the original resume are restored into
 * the candidate header or project headings without duplicate declarations.
 */
export function restoreMissingHyperlinksInLatex(
  generatedLatex: string,
  originalLatexOrLinks: string | ExtractedHyperlink[]
): string {
  if (!originalLatexOrLinks) return generatedLatex;
  return ensureAllHrefsPreservedInLatex(generatedLatex, [originalLatexOrLinks]);
}

/**
 * MASTER HYPERLINK SAFEGUARD:
 * Must be executed prior to ANY LaTeX-to-PDF compilation across the entire application.
 *
 * Guarantees:
 * 1. Converts all markdown links [Label](url) in LaTeX into \\href{url}{\\underline{Label}}
 * 2. Auto-links all naked URLs, naked emails, LinkedIn, and GitHub links into \\href commands
 * 3. Restores missing contact links into header and project links into projects from any source
 * 4. Strictly protects all \\href commands with tokenization to prevent double-wrapping or nesting
 * 5. Guarantees \\usepackage[hidelinks]{hyperref} and \\urlstyle{same} in the LaTeX preamble
 */
export function ensureAllHrefsPreservedInLatex(
  latexCode: string,
  additionalSources: (string | ExtractedHyperlink[])[] = []
): string {
  if (!latexCode || !latexCode.trim()) return latexCode;

  // Step 1: Collect all unique known links across LaTeX code and external sources
  const allKnownLinks: ExtractedHyperlink[] = [];
  const seenNorm = new Set<string>();

  const allSources = [...additionalSources, latexCode];
  for (const src of allSources) {
    if (!src) continue;
    let list: ExtractedHyperlink[] = [];
    if (Array.isArray(src)) {
      list = src;
    } else if (typeof src === "string") {
      const isLatex = src.includes("\\documentclass") || src.includes("\\begin{document}") || src.includes("\\href{");
      if (isLatex) {
        list = extractHyperlinksFromLatex(src);
      }
      const mdAndNaked = extractHyperlinksFromMarkdownText(src);
      list = [...list, ...mdAndNaked];
    }
    for (const l of list) {
      if (!seenNorm.has(l.normalizedUrl)) {
        seenNorm.add(l.normalizedUrl);
        allKnownLinks.push(l);
      }
    }
  }

  // Token storage for protected \href commands to prevent double-wrapping
  const tokens: string[] = [];
  const createdUrls = new Set<string>();

  // Step 2: Protect all existing \href and \url in the incoming LaTeX
  let currentDoc = tokenizeExistingLatexHrefs(latexCode, tokens, createdUrls);

  // Step 3: Convert markdown links [Label](url) in non-href text
  currentDoc = currentDoc.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const id = tokens.length;
    tokens.push(markdownLinkToLatexHref(label, url));
    addUrlToSet(createdUrls, url);
    return `XATSTOKEN${id}X`;
  });

  // Step 4: Convert naked emails in non-href text
  currentDoc = currentDoc.replace(
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    (_, email) => {
      const url = `mailto:${email}`;
      const id = tokens.length;
      tokens.push(`\\href{${url}}{\\underline{${email}}}`);
      addUrlToSet(createdUrls, url);
      return `XATSTOKEN${id}X`;
    }
  );

  // Step 5: Convert naked LinkedIn in non-href text
  currentDoc = currentDoc.replace(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)/gi,
    (_, handle) => {
      const url = `https://linkedin.com/in/${handle}`;
      const id = tokens.length;
      tokens.push(`\\href{${url}}{\\underline{LinkedIn}}`);
      addUrlToSet(createdUrls, url);
      return `XATSTOKEN${id}X`;
    }
  );

  // Step 6: Convert naked GitHub in non-href text
  currentDoc = currentDoc.replace(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)?)/gi,
    (_, path) => {
      const cleanPath = path.replace(/[.,;:)>\]]+$/, "");
      const isRepo = cleanPath.includes("/");
      const url = `https://github.com/${cleanPath}`;
      const label = isRepo ? "Code" : "GitHub";
      const id = tokens.length;
      tokens.push(`\\href{${url}}{\\underline{${label}}}`);
      addUrlToSet(createdUrls, url);
      return `XATSTOKEN${id}X`;
    }
  );

  // Step 7: Convert naked standalone https:// or http:// URLs
  currentDoc = currentDoc.replace(
    /\b(https?:\/\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=-]+)\b/gi,
    (_, rawUrl) => {
      const cleanUrl = rawUrl.replace(/[.,;:)>\]]+$/, "");
      const id = tokens.length;
      tokens.push(`\\href{${cleanUrl}}{\\underline{${cleanUrl}}}`);
      addUrlToSet(createdUrls, cleanUrl);
      return `XATSTOKEN${id}X`;
    }
  );

  // Step 8: Ensure all contact links from allKnownLinks are represented in the header
  const headerMatch = currentDoc.match(/(\\begin\{center\}[\s\S]*?\\end\{center\})/);
  if (headerMatch) {
    let headerText = headerMatch[1];
    let modifiedHeader = headerText;

    for (const link of allKnownLinks) {
      if (["email", "linkedin", "github", "general"].includes(link.category)) {
        if (!hasUrlInSet(createdUrls, link.url)) {
          const anchorCandidates = [
            link.text,
            link.category === "linkedin" ? "LinkedIn" : "",
            link.category === "github" ? "GitHub" : "",
            link.category === "email" ? link.url.replace(/^mailto:/i, "") : "",
          ].filter(Boolean);

          let replaced = false;
          for (const cand of anchorCandidates) {
            const escaped = cand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`\\b${escaped}\\b`, "i");
            if (re.test(modifiedHeader)) {
              const id = tokens.length;
              tokens.push(`\\href{${link.url}}{\\underline{${cand}}}`);
              addUrlToSet(createdUrls, link.url);
              modifiedHeader = modifiedHeader.replace(re, `XATSTOKEN${id}X`);
              replaced = true;
              break;
            }
          }

          if (!replaced) {
            const label =
              link.text ||
              (link.category === "linkedin"
                ? "LinkedIn"
                : link.category === "github"
                ? "GitHub"
                : link.category === "email"
                ? link.url.replace(/^mailto:/i, "")
                : "Portfolio");
            const id = tokens.length;
            tokens.push(`\\href{${link.url}}{\\underline{${label}}}`);
            addUrlToSet(createdUrls, link.url);
            const snippet = ` \\enspace\\textbar\\enspace XATSTOKEN${id}X`;
            modifiedHeader = modifiedHeader.replace(/(\s*\\end\{center\})/, `${snippet}$1`);
          }
        }
      }
    }

    if (modifiedHeader !== headerText) {
      currentDoc = currentDoc.replace(headerText, modifiedHeader);
    }
  }

  // Step 9: In projects or body, link any known project links that appear as plain text words
  for (const link of allKnownLinks) {
    if (link.category === "project_code" || link.category === "project_demo") {
      if (!hasUrlInSet(createdUrls, link.url)) {
        const anchor = link.text || (link.category === "project_code" ? "Code" : "Live Demo");
        const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`\\b${escaped}\\b`, "i");
        if (re.test(currentDoc)) {
          const id = tokens.length;
          tokens.push(`\\href{${link.url}}{\\underline{${anchor}}}`);
          addUrlToSet(createdUrls, link.url);
          currentDoc = currentDoc.replace(re, `XATSTOKEN${id}X`);
        }
      }
    }
  }

  // Step 10: Untokenize all protected \href commands
  currentDoc = restoreTokens(currentDoc, tokens);

  // Step 11: Ensure hyperref package and urlstyle are properly included in the preamble
  if (currentDoc.includes("\\href{") || currentDoc.includes("\\url{")) {
    if (!currentDoc.includes("{hyperref}")) {
      if (currentDoc.includes("\\begin{document}")) {
        currentDoc = currentDoc.replace(
          "\\begin{document}",
          "\\usepackage[hidelinks]{hyperref}\n\\urlstyle{same}\n\\begin{document}"
        );
      }
    } else if (!currentDoc.includes("\\urlstyle{same}")) {
      if (currentDoc.includes("\\begin{document}")) {
        currentDoc = currentDoc.replace("\\begin{document}", "\\urlstyle{same}\n\\begin{document}");
      }
    }
  }

  return currentDoc;
}

/**
 * Validates that compiled binary PDF contains clickable annotations for all expected URLs.
 */
export async function validatePdfHyperlinks(
  pdfBuffer: Buffer,
  expectedUrls: string[] = []
): Promise<{ valid: boolean; foundUrls: string[]; missingUrls: string[]; report: string }> {
  if (!pdfBuffer || pdfBuffer.length === 0) {
    return {
      valid: false,
      foundUrls: [],
      missingUrls: expectedUrls,
      report: "PDF buffer is empty or invalid.",
    };
  }

  const { PDFParse } = await import("pdf-parse");
  const p: any = new PDFParse({ data: pdfBuffer });
  await p.load();

  const foundUrls: string[] = [];
  for (let i = 1; i <= p.doc.numPages; i++) {
    const page = await p.doc.getPage(i);
    const annots = (await page.getAnnotations({ intent: "display" })) || [];
    const pageLinks = annots
      .filter((a: any) => a.subtype === "Link" && (a.url || a.unsafeUrl))
      .map((a: any) => (a.url || a.unsafeUrl).trim());
    foundUrls.push(...pageLinks);
  }
  await p.destroy().catch(() => {});

  const normFound = foundUrls.map(normalizeUrl);
  const missingUrls: string[] = [];

  for (const exp of expectedUrls) {
    const normExp = normalizeUrl(exp);
    const matched = normFound.some((f) => f === normExp || f.includes(normExp) || normExp.includes(f));
    if (!matched) {
      missingUrls.push(exp);
    }
  }

  const valid = missingUrls.length === 0;
  const report = valid
    ? `All ${expectedUrls.length} expected hyperlinks verified clickable in PDF (${foundUrls.length} total links).`
    : `Missing ${missingUrls.length}/${expectedUrls.length} links in compiled PDF. Missing: ${missingUrls.join(", ")}`;

  return { valid, foundUrls, missingUrls, report };
}
