import zlib, re, os

def get_text_from_pdf(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()
    streams = re.findall(rb'stream[\r\n]+([\s\S]*?)[\r\n]+endstream', data)
    lines = []
    for s in streams:
        decomp = None
        try:
            decomp = zlib.decompress(s)
        except Exception:
            try:
                decomp = zlib.decompress(s, -15)
            except Exception:
                decomp = s
        texts = re.findall(rb'\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|\'|\")', decomp)
        for t in texts:
            lines.append(t.decode('latin1', 'ignore'))
        array_tj = re.findall(rb'\[([\s\S]*?)\]\s*TJ', decomp)
        for at in array_tj:
            sub = re.findall(rb'\(((?:[^()\\]|\\.)*)\)', at)
            lines.append(''.join(t.decode('latin1', 'ignore') for t in sub))
    return '\n'.join(lines)

dir_name = 'resume_generated'
for name in sorted(os.listdir(dir_name)):
    if name.endswith('.pdf'):
        p = os.path.join(dir_name, name)
        txt = get_text_from_pdf(p)
        print(f"==================== {name} ====================")
        print(txt)

