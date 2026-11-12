import { sanitizeOcrText } from "./hyperlinks";

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
    const cleanContent = parsed.content.trim().replace(/^[\s*•\-–—▪▫◦‣▸▹➢➣→+∗\\]+/, "");
    result += `\n• ${cleanContent}`;
    lastIndex = parsed.endIndex;
    macroPattern.lastIndex = parsed.endIndex;
  }
  result += str.slice(lastIndex);
  return result;
}

/**
 * Unwraps single-argument macros (e.g. \textbf{...}, \textit{...}, \underline{...})
 * using balanced brace matching, replacing the macro call with its inner content.
 * Handles nested formatting cleanly (e.g. \textbf{\textit{foo}} -> foo).
 */
export function unwrapBalancedMacros(str: string, macroNames: string[]): string {
  if (!str || !macroNames || macroNames.length === 0) return str;
  const pattern = new RegExp(`\\\\(${macroNames.join("|")})\\*?\\s*\\{`);
  let current = str;
  let iterations = 0;
  // Maximum loop guard to prevent runaway processing
  while (iterations < 200) {
    iterations++;
    const match = pattern.exec(current);
    if (!match) break;
    const macroStart = match.index;
    const openBraceIdx = macroStart + match[0].length - 1;
    const parsed = parseBalancedBraces(current, openBraceIdx);
    if (!parsed) {
      // Remove broken macro name if braces are unclosed
      current = current.slice(0, macroStart) + current.slice(macroStart + match[0].length);
      continue;
    }
    current = current.slice(0, macroStart) + parsed.content + current.slice(parsed.endIndex);
  }
  return current;
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

  // Convert \url{url} to [url](url)
  body = body.replace(/\\url\{([^}]+)\}/g, "[$1]($1)");

  // Convert multi-argument \resumeSubheading{C1}{C2}{C3}{C4} with balanced braces
  while (true) {
    const m = /\\resumeSubheading\s*\{/.exec(body);
    if (!m) break;
    const p1 = parseBalancedBraces(body, m.index + m[0].length - 1);
    if (!p1) break;
    const after1 = body.slice(p1.endIndex);
    const m2 = /^\s*\{/.exec(after1);
    if (!m2) break;
    const p2 = parseBalancedBraces(body, p1.endIndex + m2.index + m2[0].length - 1);
    if (!p2) break;
    const after2 = body.slice(p2.endIndex);
    const m3 = /^\s*\{/.exec(after2);
    if (!m3) break;
    const p3 = parseBalancedBraces(body, p2.endIndex + m3.index + m3[0].length - 1);
    if (!p3) break;
    const after3 = body.slice(p3.endIndex);
    const m4 = /^\s*\{/.exec(after3);
    if (!m4) break;
    const p4 = parseBalancedBraces(body, p3.endIndex + m4.index + m4[0].length - 1);
    if (!p4) break;
    const subText = `\n${p1.content.trim()} | ${p2.content.trim()}\n${p3.content.trim()} | ${p4.content.trim()}\n`;
    body = body.slice(0, m.index) + subText + body.slice(p4.endIndex);
  }

  // Convert multi-argument \resumeProjectHeading{P1}{P2} with balanced braces
  while (true) {
    const m = /\\resumeProjectHeading\s*\{/.exec(body);
    if (!m) break;
    const p1 = parseBalancedBraces(body, m.index + m[0].length - 1);
    if (!p1) break;
    const after1 = body.slice(p1.endIndex);
    const m2 = /^\s*\{/.exec(after1);
    if (!m2) break;
    const p2 = parseBalancedBraces(body, p1.endIndex + m2.index + m2[0].length - 1);
    if (!p2) break;
    const projText = `\n${p1.content.trim()} | ${p2.content.trim()}\n`;
    body = body.slice(0, m.index) + projText + body.slice(p2.endIndex);
  }

  // Convert \section*{...} or \section{...} to \n... \n
  body = body.replace(/\\(?:sub)*section\*?\{([^}]+)\}/gi, "\n\n$1\n");

  // Normalize dividers
  body = body
    .replace(/\\(?:resumeDivider|enspace\\textbar\\enspace|textbar)/g, " | ")
    .replace(/\$?\s*\|\s*\$?/g, " | ")
    .replace(/\\hfill\s*/g, " | ");

  // Completely strip spacing, sizing, geometry, and layout commands with their arguments
  // (Prevents \vspace{4pt} -> 4pt, \vspace{-12pt} -> -12pt, etc.)
  body = body
    .replace(/\\(?:vspace|hspace)\*?\{[^}]*\}/g, "")
    .replace(/\\(?:setlength|linespread|fontsize|geometry|pagestyle|thispagestyle|input|urlstyle)\*?\{[^}]*\}(?:\{[^}]*\})?/g, "")
    .replace(/\\(?:titlespacing|titleformat)\*?\{[^}]*\}[\s\S]*?(?=\n\n|\\section|\\begin|$)/g, "")
    .replace(/\\setlist\*?(?:\[[^\]]*\])?\{[^}]*\}/g, "")
    .replace(/\\nopagebreak(?:\[[^\]]*\])?/g, "")
    .replace(/\\pagebreak/g, "")
    .replace(/\\(?:raggedbottom|raggedright|centering|noindent|selectfont|par)\b/g, "");

  // Convert standard \item to bullet •, stripping any raw bullet characters following it
  body = body.replace(/\\item\s*(?:[*\-•–—▪▫◦‣▸▹➢➣→+∗\\]+\s*)?/g, "\n• ");

  // Strip environments WITH their optional bracketed parameters and required parameters
  // (Prevents \begin{itemize}[leftmargin=1.2em...] -> [leftmargin=1.2em...])
  body = body.replace(/\\begin\{[^}]+\}(?:\[[^\]]*\])?(?:\{[^}]*\})*/g, "");
  body = body.replace(/\\end\{[^}]+\}/g, "");

  // Strip newline commands with bracketed space e.g. \\[-1pt] or \\[0.5pt]
  body = body.replace(/\\\\(?:\[[^\]]*\])?/g, "\n");

  // Tabular column separator &
  body = body.replace(/\s*&\s*/g, " | ");

  // Unwrap font styling commands cleanly with balanced-brace extraction
  body = unwrapBalancedMacros(body, [
    "textbf", "textit", "emph", "underline", "textsc", "text", "mbox",
    "LARGE", "Large", "huge", "Huge", "normalsize", "small", "footnotesize", "scriptsize", "tiny"
  ]);

  // Strip font weight and shape switches
  body = body.replace(/\\(?:bfseries|itshape|scshape|slshape|mdseries|upshape|small|normalsize|large|Large|LARGE|huge|Huge|footnotesize|scriptsize|tiny)\b/g, "");

  // Un-escape common LaTeX escapes
  body = body
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/\\textbackslash\{\}/g, "\\")
    .replace(/\\textasciitilde\{\}/g, "~")
    .replace(/\\textasciicircum\{\}/g, "^");

  // Strip remaining single-argument macros and bare macro tags
  body = body
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/[{}\\]/g, "");

  // Clean any leftover dimension tokens and bracketed options that leaked
  body = body
    .replace(/\[\s*-?\d+(?:\.\d+)?(?:pt|in|mm|cm|em|ex)\s*\]/g, "")
    .replace(/\[leftmargin=[^\]]*\]/g, "")
    .replace(/(?:^|\s)-?\d+(?:\.\d+)?pt(?=\s|$)/g, "");

  // Normalize extra linebreaks and spaces
  body = body
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();

  return sanitizeOcrText(body);
}
