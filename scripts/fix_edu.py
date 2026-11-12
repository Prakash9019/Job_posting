import sys

bs = chr(92)
path = 'output_tailored_surya.tex'
with open(path, 'r', encoding='utf-8', newline='') as f:
    content = f.read()

# Fix Education: clean up the messy fourth argument
old_edu = (bs + "resumeSubheading\r\n"
    "  {Vignan's Institute Of Information Technology}{}\r\n"
    "  {Vignan's Institute Of Information Technology}"
    "{Visakhapatnam, India 2021 -- 2025 Bachelor of Technology in Computer Science and Engineering CGPA: 8.9/10.0}")
new_edu = (bs + "resumeSubheading\r\n"
    "  {Vignan's Institute Of Information Technology}{Visakhapatnam, India}\r\n"
    "  {B.Tech in Computer Science and Engineering -- CGPA: 8.9/10.0}{2021 -- 2025}")

print('edu found:', old_edu in content)
content = content.replace(old_edu, new_edu)
with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print('Done')

