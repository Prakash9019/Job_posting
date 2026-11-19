import "@/lib/ats/pdf-polyfill";
import dns from "node:dns";
try { dns.setDefaultResultOrder("ipv4first"); } catch {}
try {
  const { setGlobalDispatcher, Agent } = require("undici");
  setGlobalDispatcher(new Agent({ connect: { timeout: 45_000 }, headersTimeout: 45_000, bodyTimeout: 45_000 }));
} catch {}
import { NextRequest, NextResponse } from "next/server";
import { getCandidateFilename, generateATSLatex } from "@/lib/ats/tailor";
import { optimizeLatexGeometryForOnePage } from "@/lib/ats/apply-latex";
import { requireUser, AuthError } from "@/lib/auth/authorization";
import { validatePdfArtifact } from "@/lib/ats/pdf-artifact";
import {
  ensureAllHrefsPreservedInLatex,
  extractHyperlinksFromLatex,
  extractHyperlinksFromMarkdownText,
  validatePdfHyperlinks,
} from "@/lib/ats/hyperlinks";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // Same verified-session requirement as every other route; this endpoint proxies a compile service.
    requireUser(req);
    const body = await req.json();
    const rawLatexCode = body?.latexCode;

    if (!rawLatexCode || typeof rawLatexCode !== "string" || !rawLatexCode.trim()) {
      return NextResponse.json({ error: "Missing or empty latexCode" }, { status: 400 });
    }

    const linkSources = [body?.originalLatex, body?.resumeText, body?.markdownText].filter(Boolean) as string[];
    let latexCode = ensureAllHrefsPreservedInLatex(rawLatexCode, linkSources);
    latexCode = optimizeLatexGeometryForOnePage(latexCode);
    // Ensure pdfgentounicode is safely guarded for engines like XeTeX
    latexCode = latexCode.replace(/\\pdfgentounicode\s*=\s*1/g, "\\ifdefined\\pdfgentounicode \\pdfgentounicode=1 \\fi");

    const downloadFilename =
      body?.filename ||
      (body?.resumeText
        ? getCandidateFilename(body.resumeText, body?.companyName || body?.jobText)
        : getCandidateFilename(latexCode, body?.companyName || body?.jobText));

    async function compile(engine: string, code: string) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const formData = new FormData();
          formData.append("filecontents[]", code);
          formData.append("filename[]", "document.tex");
          formData.append("engine", engine);
          formData.append("return", "pdf");

          return await fetch("https://texlive.net/cgi-bin/latexcgi", {
            method: "POST",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            body: formData,
            signal: AbortSignal.timeout(30000), // 30 sec timeout
          });
        } catch (err) {
          if (attempt === 3) throw err;
          await new Promise((r) => setTimeout(r, 750 * attempt));
        }
      }
      return null;
    }

    // First attempt with pdflatex
    let response = await compile("pdflatex", latexCode).catch(() => null);
    let contentType = response ? (response.headers.get("content-type") || "") : "";

    let firstErrText = "";
    let secondErrText = "";

    // If pdflatex didn't return PDF or failed, attempt secondary fallback with xelatex
    if (!response || !response.ok || !contentType.includes("pdf")) {
      firstErrText = response ? await response.text().catch(() => "") : "pdflatex compilation failed";
      console.warn("pdflatex failed, trying secondary fallback with xelatex...");

      const fallbackResponse = await compile("xelatex", latexCode).catch(() => null);
      if (fallbackResponse && fallbackResponse.ok && (fallbackResponse.headers.get("content-type") || "").includes("pdf")) {
        response = fallbackResponse;
        contentType = fallbackResponse.headers.get("content-type") || "";
      } else {
        secondErrText = fallbackResponse ? await fallbackResponse.text().catch(() => "") : "";

        // Tertiary attempt: Auto-heal missing essential packages or escapes in user's custom LaTeX
        let healedCode = latexCode;
        if (healedCode.includes("\\href") && !healedCode.includes("{hyperref}")) {
          healedCode = healedCode.replace("\\begin{document}", "\\usepackage[hidelinks]{hyperref}\n\\begin{document}");
        }
        if ((healedCode.includes("\\underline") || healedCode.includes("\\uline")) && !healedCode.includes("{ulem}")) {
          healedCode = healedCode.replace("\\begin{document}", "\\usepackage[normalem]{ulem}\n\\begin{document}");
        }
        if (healedCode.includes("\\textbullet") && !healedCode.includes("{textcomp}")) {
          healedCode = healedCode.replace("\\begin{document}", "\\usepackage{textcomp}\n\\begin{document}");
        }
        if (!healedCode.includes("\\raggedbottom") && healedCode.includes("\\begin{document}")) {
          healedCode = healedCode.replace("\\begin{document}", "\\raggedbottom\n\\begin{document}");
        }

        if (healedCode !== latexCode) {
          const healedRes = await compile("pdflatex", healedCode).catch(() => null);
          if (healedRes && healedRes.ok && (healedRes.headers.get("content-type") || "").includes("pdf")) {
            response = healedRes;
            contentType = healedRes.headers.get("content-type") || "";
          }
        }
      }
    }

    if (!response || !response.ok || !contentType.includes("pdf")) {
      const logSnippet = (secondErrText || firstErrText || "LaTeX compilation failed to produce a valid PDF.").slice(0, 3000);
      console.error("[LaTeX PDF Route] Compilation failed or produced invalid response:", {
        hasResponse: !!response,
        responseStatus: response?.status,
        contentType,
        errorSnippet: logSnippet.slice(0, 300),
      });
      return NextResponse.json(
        {
          error: "LaTeX compilation failed",
          log: logSnippet,
          suggestion: "Custom font or package conflict detected. You can inspect the compiler log below, download the .tex source, or open directly in Overleaf.",
        },
        { status: 422 }
      );
    }

    const pdfArrayBuf = await response.arrayBuffer();
    let pdfBuffer = Buffer.from(pdfArrayBuf);

    // Never serve bytes that are not a complete, parseable PDF
    let structure = await validatePdfArtifact(pdfBuffer);
    if (!structure.ok) {
      console.error("[LaTeX PDF Route] Compiler returned an invalid PDF:", structure.reasons);
      return NextResponse.json(
        { error: "LaTeX compilation produced an invalid PDF", log: structure.reasons.join("; ") },
        { status: 422 }
      );
    }

    // Strict 1-Page Guarantee: if compiled PDF produced > 1 page, re-compile with single-page ATS layout
    if (structure.pages > 1) {
      try {
        let textToUse = body?.resumeText;
        if (!textToUse) {
          const { PDFParse } = await import("pdf-parse");
          const parser = new PDFParse({ data: pdfBuffer });
          const parsed = await parser.getText();
          await parser.destroy().catch(() => {});
          textToUse = parsed.text;
        }

        if (textToUse && textToUse.length >= 100) {
          const singleLatex = generateATSLatex(textToUse);
          const safeSingleLatex = ensureAllHrefsPreservedInLatex(singleLatex, linkSources);
          const singleRes = await compile("pdflatex", safeSingleLatex).catch(() => null);
          if (singleRes && singleRes.ok && (singleRes.headers.get("content-type") || "").includes("pdf")) {
            const singleBuf = Buffer.from(await singleRes.arrayBuffer());
            const singleStruct = await validatePdfArtifact(singleBuf);
            if (singleStruct.ok && singleStruct.pages === 1) {
              pdfBuffer = singleBuf;
              structure = singleStruct;
              latexCode = safeSingleLatex;
            }
          }
        }
      } catch (err) {
        console.warn("Single-page fallback failed in latex-pdf route:", err);
      }
    }

    // Validate compiled PDF hyperlink annotations across all source links
    let linkValidationHeader = "unverified";
    const allLinkSources = [body?.originalLatex, body?.resumeText, body?.markdownText, latexCode].filter(Boolean) as string[];
    const allExpectedUrls = new Set<string>();
    for (const src of allLinkSources) {
      const l1 = extractHyperlinksFromLatex(src);
      const l2 = extractHyperlinksFromMarkdownText(src);
      for (const item of [...l1, ...l2]) {
        if (item.url) allExpectedUrls.add(item.url);
      }
    }

    if (allExpectedUrls.size > 0) {
      try {
        const val = await validatePdfHyperlinks(pdfBuffer, Array.from(allExpectedUrls));
        linkValidationHeader = `${val.foundUrls.length}/${allExpectedUrls.size}`;
        if (!val.valid) {
          console.warn(`[PDF Hyperlink Warning] ${val.missingUrls.length} missing link annotations:`, val.missingUrls);
        } else {
          console.log(`[PDF Hyperlink Verified] All ${val.foundUrls.length} links are clickable in compiled PDF.`);
        }
      } catch (valErr) {
        console.warn("Failed to validate PDF hyperlink annotations:", valErr);
      }
    }

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadFilename.replace(/["\r\n]/g, "")}"`,
        "Content-Length": String(pdfBuffer.byteLength),
        "X-Hyperlinks-Validated": linkValidationHeader,
        "X-Content-SHA256": structure.sha256,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("LaTeX PDF route error:", err);
    return NextResponse.json(
      { error: `Compilation service unavailable: ${message}` },
      { status: 500 }
    );
  }
}
