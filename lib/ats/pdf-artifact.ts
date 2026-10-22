import * as crypto from "crypto";
import { compileLatexToPdfBuffer, generateATSLatex } from "./tailor";
import { extractHyperlinksFromMarkdownText, validatePdfHyperlinks } from "./hyperlinks";

/**
 * A generated resume PDF is only an "artifact" once it has been validated here. Every path that
 * stores, serves or emails a generated PDF goes through these checks, so a compile failure, a raw
 * image, an empty template or a PDF that lost its content/links can never be treated as success.
 */
export interface PdfValidation {
  ok: boolean;
  reasons: string[];
  pages: number;
  size: number;
  sha256: string;
}

export type PdfArtifactResult =
  | { ok: true; buffer: Buffer; sha256: string; pages: number; latex: string }
  | { ok: false; reasons: string[]; latex: string };

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function sha256Hex(buf: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export async function validatePdfArtifact(
  buf: Buffer | null | undefined,
  opts: { expectedText?: string; expectedUrls?: string[]; minContentCoverage?: number } = {}
): Promise<PdfValidation> {
  const reasons: string[] = [];
  if (!buf || buf.length === 0) {
    return { ok: false, reasons: ["no output was produced"], pages: 0, size: 0, sha256: "" };
  }
  const sha256 = sha256Hex(buf);
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") reasons.push("output is not a PDF (missing %PDF header)");
  if (!buf.subarray(Math.max(0, buf.length - 2048)).toString("latin1").includes("%%EOF")) reasons.push("PDF is truncated (missing %%EOF)");
  if (buf.length < 3000) reasons.push(`PDF is implausibly small (${buf.length} bytes)`);
  if (reasons.length > 0) return { ok: false, reasons, pages: 0, size: buf.length, sha256 };

  let pages = 0;
  try {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    try {
      const parsed = await parser.getText();
      pages = parsed.total ?? parsed.pages?.length ?? 0;
      if (pages < 1) reasons.push("PDF has no pages");
      // Literal Markdown / template tokens must never be visible in a resume
      const leak = (parsed.text || "").match(/\*\*|\*[A-Za-z]|[A-Za-z]\*(?![A-Za-z0-9])|\]\(|XATSTOKEN|\u005c(?:textbf|textit|href)\b/);
      if (leak) reasons.push(`markup leaked into the PDF text ("${leak[0]}")`);
      if (opts.expectedText) {
        const haystack = alnum(parsed.text || "");
        const words = Array.from(new Set((opts.expectedText.toLowerCase().match(/[a-z0-9]{4,}/g) || [])));
        if (words.length > 0) {
          const found = words.filter((w) => haystack.includes(w)).length;
          const coverage = found / words.length;
          const required = opts.minContentCoverage ?? 0.95;
          if (coverage < required) {
            reasons.push(`PDF text covers only ${(coverage * 100).toFixed(0)}% of the resume content (needs ${(required * 100).toFixed(0)}%)`);
          }
        }
      }
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch (err) {
    reasons.push(`PDF could not be parsed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (opts.expectedUrls && opts.expectedUrls.length > 0 && reasons.length === 0) {
    const links = await validatePdfHyperlinks(buf, opts.expectedUrls);
    if (!links.valid) reasons.push(`missing clickable links: ${links.missingUrls.join(", ")}`);
  }

  return { ok: reasons.length === 0, reasons, pages, size: buf.length, sha256 };
}

/** Compile LaTeX and only report success if the resulting PDF passes validatePdfArtifact. */
export async function compileValidatedPdf(
  latex: string,
  opts: {
    expectedText?: string;
    expectedUrls?: string[];
    minContentCoverage?: number;
    linkSource?: Parameters<typeof compileLatexToPdfBuffer>[1];
    compile?: (latex: string, linkSource?: Parameters<typeof compileLatexToPdfBuffer>[1]) => Promise<Buffer | null>;
  } = {}
): Promise<PdfArtifactResult> {
  let buffer: Buffer | null = null;
  try {
    buffer = await (opts.compile ?? compileLatexToPdfBuffer)(latex, opts.linkSource);
  } catch (err) {
    return { ok: false, reasons: [`compiler threw: ${err instanceof Error ? err.message : String(err)}`], latex };
  }
  if (!buffer) return { ok: false, reasons: ["LaTeX compilation failed or the compiler was unavailable"], latex };
  const v = await validatePdfArtifact(buffer, opts);
  return v.ok ? { ok: true, buffer, sha256: v.sha256, pages: v.pages, latex } : { ok: false, reasons: v.reasons, latex };
}

/** Screenshot transcript -> validated ATS PDF. Never returns anything but a validated PDF or a failure. */
export async function generateResumePdfFromText(
  extractedText: string,
  opts: { compile?: (latex: string) => Promise<Buffer | null> } = {}
): Promise<PdfArtifactResult> {
  const text = (extractedText || "").trim();
  if (text.length < 100) {
    return { ok: false, reasons: ["the screenshots did not yield enough readable resume text"], latex: "" };
  }
  const latex = generateATSLatex(text);
  const expectedUrls = extractHyperlinksFromMarkdownText(text).map((l) => l.url);
  return compileValidatedPdf(latex, { expectedText: text, expectedUrls, compile: opts.compile });
}
