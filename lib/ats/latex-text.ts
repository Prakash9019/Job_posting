/**
 * Parses balanced curly braces counting depth, properly handling escaped braces (\\{ and \\}).
 * Returns the inner content and the index immediately following the closing brace.
 */
export function parseBalancedBraces(str: string, openBraceIndex: number): { content: string; endIndex: number } | null {
  if (openBraceIndex < 0 || openBraceIndex >= str.length || str[openBraceIndex] !== "{") return null;
  let depth = 1;
  let i = openBraceIndex + 1;
  while (i < str.length) {
    const ch = str[i];
    if (ch === "\\") {
      // Skip escaped characters like \{, \}, \%, etc.
      i += 2;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return {
          content: str.slice(openBraceIndex + 1, i),
          endIndex: i + 1,
        };
      }
    }
    i++;
  }
  return null;
}

/**
 * Replaces macro calls with balanced curly braces (e.g. \resumeItem{...}) without
 * truncating prematurely on inner \textbf{...} or \href{...}{...}.
 */
export function extractBalancedBraces(str: string, macroNames: string[]): string {
  if (!str || !macroNames || macroNames.length === 0) return str;
  const macroPattern = new RegExp(`\\\\(${macroNames.join("|")})\\s*\\{`, "g");
  let result = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = macroPattern.exec(str)) !== null) {
    const macroStart = match.index;
    const openBraceIdx = macroStart + match[0].length - 1;
    const parsed = parseBalancedBraces(str, openBraceIdx);
    if (!parsed) {
      continue;
    }
    result += str.slice(lastIndex, macroStart);
    result += `\n• ${parsed.content.trim()}`;
    lastIndex = parsed.endIndex;
    macroPattern.lastIndex = parsed.endIndex;
  }
  result += str.slice(lastIndex);
  return result;
}

export function latexToPlainText(latex: string): string {
  if (!latex) return "";
  let body = latex;
  const docStart = body.indexOf("\\begin{document}");
  if (docStart !== -1) {
    body = body.slice(docStart + "\\begin{document}".length);
  }
  const docEnd = body.indexOf("\\end{document}");
  if (docEnd !== -1) {
    body = body.slice(0, docEnd);
  }

  // Remove comments
  body = body.replace(/(^|[^\\])%.*$/gm, "$1");

  // Convert \resumeItem{...} and \resumeSubItem{...} using true balanced-brace parsing
  // so nested \textbf{...} or \href{...}{...} never truncate the bullet!
  body = extractBalancedBraces(body, ["resumeItem", "resumeSubItem"]);

  // Convert \href{url}{label} to [label](url) using balanced brace extraction
  const hrefPattern = /\\href\s*\{/g;
  let hrefMatch: RegExpExecArray | null;
  let hrefTransformed = "";
  let lastHrefIdx = 0;

  while ((hrefMatch = hrefPattern.exec(body)) !== null) {
    const urlOpen = hrefMatch.index + hrefMatch[0].length - 1;
    const urlParsed = parseBalancedBraces(body, urlOpen);
    if (!urlParsed) continue;

    const after = body.slice(urlParsed.endIndex);
    const labelOpenMatch = after.match(/^\s*\{/);
    if (!labelOpenMatch) continue;

    const labelOpen = urlParsed.endIndex + (labelOpenMatch.index || 0) + labelOpenMatch[0].length - 1;
    const labelParsed = parseBalancedBraces(body, labelOpen);
    if (!labelParsed) continue;

    const url = urlParsed.content.trim();
    const cleanLabel = labelParsed.content
      .replace(/\\(?:underline|textbf|textit|emph|textsc)\{([^}]*)\}/g, "$1")
      .trim();

    hrefTransformed += body.slice(lastHrefIdx, hrefMatch.index);
    hrefTransformed += `[${cleanLabel || url}](${url})`;

    lastHrefIdx = labelParsed.endIndex;
    hrefPattern.lastIndex = labelParsed.endIndex;
  }
  hrefTransformed += body.slice(lastHrefIdx);
  body = hrefTransformed;

  return body
    // Convert \url{url} to [url](url)
    .replace(/\\url\{([^}]+)\}/g, "[$1]($1)")
    // Convert \section*{...} or \section{...} to \n... \n
    .replace(/\\(?:sub)*section\*?\{([^}]+)\}/gi, "\n\n$1\n")
    // Convert \resumeSubheading or similar macro headings if present
    .replace(/\\resumeSubheading\s*\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}/g, "\n$1 | $2\n$3 | $4\n")
    // Convert \resumeProjectHeading if present
    .replace(/\\resumeProjectHeading\s*\{([^}]+)\}\{([^}]+)\}/g, "\n$1 | $2\n")
    // Normalize dividers
    .replace(/\\(?:resumeDivider|enspace\\textbar\\enspace|textbar)/g, " | ")
    .replace(/\$?\s*\|\s*\$?/g, " | ")
    .replace(/\\hfill\s*/g, " | ")
    // Convert standard \item to bullet •
    .replace(/\\item\s+/g, "\n• ")
    // Un-escape common LaTeX escapes
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/\\textbackslash\{\}/g, "\\")
    .replace(/\\textasciitilde\{\}/g, "~")
    .replace(/\\textasciicircum\{\}/g, "^")
    .replace(/\\textbf\{([^}]+)\}/g, "$1")
    .replace(/\\textit\{([^}]+)\}/g, "$1")
    .replace(/\\emph\{([^}]+)\}/g, "$1")
    .replace(/\\underline\{([^}]+)\}/g, "$1")
    // Strip other common environments and remaining single-argument macros
    .replace(/\\(?:begin|end)\{[^}]+\}/g, "")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/[{}\\]/g, "")
    // Normalize extra linebreaks and spaces
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
