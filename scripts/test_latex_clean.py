import re

with open('output_tailored_surya.tex', 'r', encoding='utf-8') as f:
    latex = f.read()

def parseBalancedBraces(s, openIdx):
    if openIdx < 0 or openIdx >= len(s) or s[openIdx] != '{': return None
    depth = 1
    i = openIdx + 1
    while i < len(s):
        ch = s[i]
        if ch == '\\':
            i += 2
            continue
        if ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return {'content': s[openIdx+1:i], 'endIndex': i+1}
        i += 1
    return None

def unwrapBalancedMacros(s, macroNames):
    pattern = re.compile(r'\\(' + '|'.join(macroNames) + r')\*?\s*\{')
    while True:
        match = pattern.search(s)
        if not match:
            break
        openIdx = match.start() + len(match.group(0)) - 1
        parsed = parseBalancedBraces(s, openIdx)
        if not parsed:
            s = s[:match.start()] + s[match.end():]
            continue
        s = s[:match.start()] + parsed['content'] + s[parsed['endIndex']:]
    return s

def extractBalancedBraces(s, macroNames):
    pattern = re.compile(r'\\(' + '|'.join(macroNames) + r')\s*\{')
    result = ""
    lastIndex = 0
    for match in pattern.finditer(s):
        macroStart = match.start()
        openBraceIdx = macroStart + len(match.group(0)) - 1
        parsed = parseBalancedBraces(s, openBraceIdx)
        if not parsed: continue
        result += s[lastIndex:macroStart]
        cleanContent = re.sub(r'^[\s*•\-–—▪▫◦‣▸▹➢➣→+∗\\]+', '', parsed['content'].strip())
        result += f"\n• {cleanContent}"
        lastIndex = parsed['endIndex']
    result += s[lastIndex:]
    return result

def cleanLatex(latex):
    body = latex
    docStart = body.find(r"\begin{document}")
    if docStart != -1:
        body = body[docStart + len(r"\begin{document}"):]
    docEnd = body.find(r"\end{document}")
    if docEnd != -1:
        body = body[:docEnd]

    # Remove comments
    body = re.sub(r'(^|[^\\])%.*$', r'\1', body, flags=re.MULTILINE)

    # Convert \resumeItem and \resumeSubItem
    body = extractBalancedBraces(body, ["resumeItem", "resumeSubItem"])

    # Convert \href{url}{label}
    hrefPattern = re.compile(r'\\href\s*\{')
    while True:
        m = hrefPattern.search(body)
        if not m: break
        urlParsed = parseBalancedBraces(body, m.start() + len(m.group(0)) - 1)
        if not urlParsed:
            body = body[:m.start()] + body[m.end():]
            continue
        after = body[urlParsed['endIndex']:]
        labelMatch = re.search(r'^\s*\{', after)
        if not labelMatch:
            body = body[:m.start()] + body[urlParsed['endIndex']:]
            continue
        labelOpen = urlParsed['endIndex'] + labelMatch.start() + len(labelMatch.group(0)) - 1
        labelParsed = parseBalancedBraces(body, labelOpen)
        if not labelParsed:
            body = body[:m.start()] + body[urlParsed['endIndex']:]
            continue
        url = urlParsed['content'].strip()
        label = re.sub(r'\\(?:underline|textbf|textit|emph|textsc)\{([^}]*)\}', r'\1', labelParsed['content']).strip()
        mdLink = f"[{label or url}]({url})"
        body = body[:m.start()] + mdLink + body[labelParsed['endIndex']:]

    # Convert \url{url}
    body = re.sub(r'\\url\{([^}]+)\}', r'[\1](\1)', body)

    # Convert multi-arg \resumeSubheading and \resumeProjectHeading
    while True:
        m = re.search(r'\\resumeSubheading\s*\{', body)
        if not m: break
        p1 = parseBalancedBraces(body, m.start() + len(m.group(0)) - 1)
        if not p1: break
        after1 = body[p1['endIndex']:]
        m2 = re.search(r'^\s*\{', after1)
        if not m2: break
        p2 = parseBalancedBraces(body, p1['endIndex'] + m2.start() + len(m2.group(0)) - 1)
        if not p2: break
        after2 = body[p2['endIndex']:]
        m3 = re.search(r'^\s*\{', after2)
        if not m3: break
        p3 = parseBalancedBraces(body, p2['endIndex'] + m3.start() + len(m3.group(0)) - 1)
        if not p3: break
        after3 = body[p3['endIndex']:]
        m4 = re.search(r'^\s*\{', after3)
        if not m4: break
        p4 = parseBalancedBraces(body, p3['endIndex'] + m4.start() + len(m4.group(0)) - 1)
        if not p4: break
        subheadingText = f"\n{p1['content'].strip()} | {p2['content'].strip()}\n{p3['content'].strip()} | {p4['content'].strip()}\n"
        body = body[:m.start()] + subheadingText + body[p4['endIndex']:]

    while True:
        m = re.search(r'\\resumeProjectHeading\s*\{', body)
        if not m: break
        p1 = parseBalancedBraces(body, m.start() + len(m.group(0)) - 1)
        if not p1: break
        after1 = body[p1['endIndex']:]
        m2 = re.search(r'^\s*\{', after1)
        if not m2: break
        p2 = parseBalancedBraces(body, p1['endIndex'] + m2.start() + len(m2.group(0)) - 1)
        if not p2: break
        projHeadingText = f"\n{p1['content'].strip()} | {p2['content'].strip()}\n"
        body = body[:m.start()] + projHeadingText + body[p2['endIndex']:]

    # Sections
    body = re.sub(r'\\(?:sub)*section\*?\{([^}]+)\}', r'\n\n\1\n', body, flags=re.IGNORECASE)

    # Dividers
    body = re.sub(r'\\(?:resumeDivider|enspace\\textbar\\enspace|textbar)', r' | ', body)
    body = re.sub(r'\$?\s*\|\s*\$?', r' | ', body)
    body = re.sub(r'\\hfill\s*', r' | ', body)

    # Strip layout, spacing, page style, and length commands with their arguments completely
    body = re.sub(r'\\(?:vspace|hspace)\*?\{[^}]*\}', '', body)
    body = re.sub(r'\\(?:setlength|linespread|fontsize|geometry|pagestyle|thispagestyle|input|urlstyle)\*?\{[^}]*\}(?:\{[^}]*\})?', '', body)
    body = re.sub(r'\\(?:titlespacing|titleformat)\*?\{[^}]*\}[\s\S]*?(?=\n\n|\\section|\\begin|$)', '', body)
    body = re.sub(r'\\setlist\*?(?:\[[^\]]*\])?\{[^}]*\}', '', body)
    body = re.sub(r'\\nopagebreak(?:\[[^\]]*\])?', '', body)
    body = re.sub(r'\\pagebreak', '', body)
    body = re.sub(r'\\(?:raggedbottom|raggedright|centering|noindent|selectfont|par)\b', '', body)

    # Convert standard \item to bullet •
    body = re.sub(r'\\item\s*(?:[*\-•–—▪▫◦‣▸▹➢➣→+∗\\]+\s*)?', r'\n• ', body)

    # Strip environments with their optional and required parameters!
    body = re.sub(r'\\begin\{[^}]+\}(?:\[[^\]]*\])?(?:\{[^}]*\})*', '', body)
    body = re.sub(r'\\end\{[^}]+\}', '', body)

    # Strip newline commands with bracketed space e.g. \\[-1pt] or \\[0.5pt]
    body = re.sub(r'\\\\(?:\[[^\]]*\])?', '\n', body)

    # Tabular separator &
    body = re.sub(r'\s*&\s*', ' | ', body)

    # Unwrap font styling
    body = unwrapBalancedMacros(body, ["textbf", "textit", "emph", "underline", "textsc", "text", "mbox", "LARGE", "Large", "huge", "Huge", "normalsize", "small", "footnotesize", "scriptsize", "tiny"])

    # Strip font weight and shape switches
    body = re.sub(r'\\(?:bfseries|itshape|scshape|slshape|mdseries|upshape|small|normalsize|large|Large|LARGE|huge|Huge|footnotesize|scriptsize|tiny)\b', '', body)

    # Un-escape common LaTeX escapes
    body = re.sub(r'\\([&%$#_{}])', r'\1', body)
    body = body.replace(r"\textbackslash{}", "\\")
    body = re.sub(r'\\textasciitilde\{\}', '~', body)
    body = re.sub(r'\\textasciicircum\{\}', '^', body)

    # Strip remaining macros
    body = re.sub(r'\\[a-zA-Z]+\*?', ' ', body)
    body = re.sub(r'[{}\\]', '', body)

    # Clean leftover dimensions like [2pt], 2pt, 0.5pt, -8pt, [leftmargin=...]
    body = re.sub(r'\[\s*-?\d+(?:\.\d+)?(?:pt|in|mm|cm|em|ex)\s*\]', '', body)
    body = re.sub(r'\[leftmargin=[^\]]*\]', '', body)
    body = re.sub(r'(?:^|\s)-?\d+(?:\.\d+)?pt(?=\s|$)', '', body)

    # Normalize extra linebreaks and spaces
    body = re.sub(r'[ \t]+', ' ', body)
    body = re.sub(r'\n\s*\n\s*\n+', '\n\n', body).strip()

    return body

cleaned = cleanLatex(latex)
print("--- CLEANED RESULT ---")
print(cleaned[:1500])
