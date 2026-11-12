import zlib, re

with open('resume_generated/Resume_Loka_Surya_Prakash_Concentrix.pdf', 'rb') as f:
    data = f.read()

matches = re.finditer(rb'(\d+ \d+ obj)[\s\S]*?stream[\r\n]+([\s\S]*?)[\r\n]+endstream', data)
for m in matches:
    obj_hdr = m.group(1).decode('ascii', 'ignore')
    s = m.group(2)
    if b'\xe5i' in s or b'\xca#a' in s:
        print(f"Object {obj_hdr} contains font / binary stream, size: {len(s)}")
        # Check dictionary
        dict_part = data[m.start():data.find(b'stream', m.start())].decode('latin1', 'ignore')
        print("Dictionary:", dict_part)

