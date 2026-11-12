import zlib, re, os

def dump_pdf_text(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()
    print(f"*** File: {filepath} Size: {len(data)}")
    streams = re.findall(rb'stream[\r\n]+([\s\S]*?)[\r\n]+endstream', data)
    print(f"Number of streams found: {len(streams)}")
    all_text = []
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
        if texts:
            all_text.extend([t.decode('latin1', 'ignore') for t in texts])
        array_tj = re.findall(rb'\[([\s\S]*?)\]\s*TJ', decomp)
        for at in array_tj:
            sub = re.findall(rb'\(((?:[^()\\]|\\.)*)\)', at)
            all_text.extend([t.decode('latin1', 'ignore') for t in sub])
    
    extracted = ' '.join(all_text)
    print(f"Extracted string count: {len(all_text)}, approx length: {len(extracted)}")
    print("--- SAMPLE TEXT (first 1000 chars) ---")
    print(extracted[:1000])
    print("--- SAMPLE TEXT (last 500 chars) ---")
    print(extracted[-500:])

dir_name = 'resume_generated'
for name in sorted(os.listdir(dir_name)):
    if name.endswith('.pdf'):
        dump_pdf_text(os.path.join(dir_name, name))
        print('=' * 60)

