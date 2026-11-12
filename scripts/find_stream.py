import zlib, re

with open('resume_generated/Resume_Loka_Surya_Prakash_Concentrix.pdf', 'rb') as f:
    data = f.read()

# find all stream objects with their object id
matches = re.finditer(rb'(\d+ \d+ obj)[\s\S]*?stream[\r\n]+([\s\S]*?)[\r\n]+endstream', data)
for m in matches:
    obj_hdr = m.group(1).decode('ascii', 'ignore')
    s = m.group(2)
    decomp = None
    try:
        decomp = zlib.decompress(s)
    except Exception:
        try:
            decomp = zlib.decompress(s, -15)
        except Exception:
            decomp = s
    if b'CGPA' in decomp or b'Vignan' in decomp:
        print(f"Object {obj_hdr} contains CGPA / Vignan")
        # print snippet
        print(decomp.decode('latin1', 'ignore')[:1500])
        print("--- END OF OBJECT ---")

