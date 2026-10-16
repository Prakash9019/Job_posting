import { NextRequest, NextResponse } from "next/server";
import { getCandidateFilename } from "@/lib/ats/tailor";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const latexCode = body?.latexCode;

    if (!latexCode || typeof latexCode !== "string" || !latexCode.trim()) {
      return NextResponse.json({ error: "Missing or empty latexCode" }, { status: 400 });
    }

    const downloadFilename =
      body?.filename ||
      (body?.resumeText
        ? getCandidateFilename(body.resumeText, body?.companyName || body?.jobText)
        : getCandidateFilename(latexCode, body?.companyName || body?.jobText));

    async function compile(engine: string, code: string) {
      const formData = new FormData();
      formData.append("filecontents[]", code);
      formData.append("filename[]", "document.tex");
      formData.append("engine", engine);
      formData.append("return", "pdf");

      return fetch("https://texlive.net/cgi-bin/latexcgi", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30000), // 30 sec timeout
      });
    }

    // First attempt with pdflatex
    let response = await compile("pdflatex", latexCode);
    let contentType = response.headers.get("content-type") || "";

    // If pdflatex didn't return PDF or returned an error, attempt secondary fallback with xelatex
    if (!response.ok || !contentType.includes("pdf")) {
      const firstErrText = await response.text().catch(() => "");
      console.warn("pdflatex failed, trying secondary fallback with xelatex...");
      
      const fallbackResponse = await compile("xelatex", latexCode).catch(() => null);
      if (fallbackResponse && fallbackResponse.ok && (fallbackResponse.headers.get("content-type") || "").includes("pdf")) {
        response = fallbackResponse;
        contentType = fallbackResponse.headers.get("content-type") || "";
      } else {
        const secondErrText = fallbackResponse ? await fallbackResponse.text().catch(() => "") : "";
        const logSnippet = (secondErrText || firstErrText || "LaTeX compilation syntax error").slice(0, 1500);
        return NextResponse.json(
          {
            error: "LaTeX compilation syntax warning",
            log: logSnippet,
            suggestion: "Custom font or package conflict detected. You can open and compile directly in Overleaf with full package resolution.",
          },
          { status: 422 }
        );
      }
    }

    const pdfBuffer = await response.arrayBuffer();

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadFilename.replace(/["\r\n]/g, "")}"`,
        "Content-Length": String(pdfBuffer.byteLength),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("LaTeX PDF route error:", err);
    return NextResponse.json(
      { error: `Compilation service unavailable: ${message}` },
      { status: 500 }
    );
  }
}
