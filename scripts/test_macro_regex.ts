const jakesTemplate = `\\documentclass[10pt,a4paper]{article}
\\usepackage{latexsym}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\input{glyphtounicode}
\\usepackage[left=0.38in, right=0.38in, top=0.30in, bottom=0.30in]{geometry}
\\setlist[itemize]{leftmargin=1.2em, itemsep=0.6pt, parsep=0pt, topsep=1.0pt, partopsep=0pt, label=\\textbullet}
\\linespread{0.99}
\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}
\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}
\\titleformat{\\section}{\\vspace{-4pt}\\scshape\\raggedright\\large}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]
\\titlespacing*{\\section}{0pt}{3.5pt}{1.8pt}
\\pdfgentounicode=1
\\newcommand{\\resumeItem}[1]{\\item\\small{{#1 \\vspace{-2pt}}}}
\\newcommand{\\resumeSubheading}[4]{
  \\vspace{2.5pt}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    \\textbf{#1} & \\textit{\\small #2} \\\\[-1pt]
    {\\small #3} & \\textit{\\small #4}
  \\end{tabular*}\\vspace{1.5pt}\\nopagebreak[4]
}
\\newcommand{\\resumeProjectHeading}[2]{
  \\vspace{2.5pt}\\nopagebreak[3]
  \\begin{tabular*}{1.0\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
    #1 & \\textit{\\small #2}
  \\end{tabular*}\\vspace{1.5pt}\\nopagebreak[4]
}
\\newcommand{\\resumeSubHeadingListStart}{}
\\newcommand{\\resumeSubHeadingListEnd}{}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}[leftmargin=1.2em, itemsep=0.6pt, parsep=0pt, topsep=1.0pt, partopsep=0pt, label=\\textbullet]}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}}
\\begin{document}
\\pagestyle{empty}
\\thispagestyle{empty}
\\begin{center}\\textbf{\\Huge \\scshape Loka Surya Prakash Pentakota} \\\\ \\vspace{1pt}\\small +91-6301750186 $|$ \\href{mailto:plsprakash2003@gmail.com}{\\underline{plsprakash2003@gmail.com}} $|$ \\href{https://linkedin.com/in/surya}{\\underline{LinkedIn}} $|$ \\href{https://github.com/surya}{\\underline{GitHub}}\\end{center}
\\section{WORK EXPERIENCE}
\\resumeSubHeadingListStart
\\resumeSubheading{Platform Engineer}{India}{JulleyOnline Private Limited}{April 2026 -- Sept 2026}
\\resumeItemListStart
\\resumeItem{Architected a centralized integration hub using adapter and registry patterns.}
\\resumeItemListEnd
\\resumeSubHeadingListEnd
\\end{document}`;

async function main() {
  const formData = new FormData();
  formData.append("filecontents[]", jakesTemplate);
  formData.append("filename[]", "document.tex");
  formData.append("engine", "pdflatex");
  formData.append("return", "pdf");

  const res = await fetch("https://texlive.net/cgi-bin/latexcgi", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: formData,
  });

  console.log("Status:", res.status);
  console.log("ContentType:", res.headers.get("content-type"));
}
main();
