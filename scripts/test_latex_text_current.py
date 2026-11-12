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

# Current implementation logic from latex-text.ts
body = latex
docStart = body.find(r"\begin{document}")
if docStart != -1:
    body = body[docStart + len(r"\begin{document}"):]
docEnd = body.find(r"\end{document}")
if docEnd != -1:
    body = body[:docEnd]

body = re.sub(r'(^|[^\\])%.*$', r'\1', body, flags=re.MULTILINE)
body = extractBalancedBraces(body, ["resumeItem", "resumeSubItem"])

# href
# ...
body = re.sub(r'\\(?:sub)*section\*?\{([^}]+)\}', r'\n\n\1\n', body, flags=re.IGNORECASE)
body = re.sub(r'\\resumeSubheading\s*\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}\{([^}]+)\}', r'\n\1 | \2\n\3 | \4\n', body)
body = re.sub(r'\\resumeProjectHeading\s*\{([^}]+)\}\{([^}]+)\}', r'\n\1 | \2\n', body)
body = re.sub(r'\\(?:resumeDivider|enspace\\textbar\\enspace|textbar)', r' | ', body)
body = re.sub(r'\$?\s*\|\s*\$?', r' | ', body)
body = re.sub(r'\\hfill\s*', r' | ', body)
body = re.sub(r'\\item\s*(?:[*\-•–—▪▫◦‣▸▹➢➣→+∗\\]+\s*)?', r'\n• ', body)
body = re.sub(r'\\([&%$#_{}])', r'\1', body)
body = re.sub(r'\\textbf\{([^}]+)\}', r'\1', body)
body = re.sub(r'\\textit\{([^}]+)\}', r'\1', body)
body = re.sub(r'\\emph\{([^}]+)\}', r'\1', body)
body = re.sub(r'\\underline\{([^}]+)\}', r'\1', body)
body = re.sub(r'\\(?:begin|end)\{[^}]+\}', '', body)
body = re.sub(r'\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{([^}]*)\}', r'\1', body)
body = re.sub(r'\\[a-zA-Z]+\*?', ' ', body)
body = re.sub(r'[{}\\]', '', body)
body = re.sub(r'[ \t]+', ' ', body)
body = re.sub(r'\n\s*\n\s*\n+', '\n\n', body).strip()

print("--- CURRENT RESULT ---")
print(body[:1500])

