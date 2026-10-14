import { PDFParse } from "pdf-parse";
import { getStorageProvider } from "@/lib/storage";

export function isReadableResumeText(text: string): boolean {
  return text.trim().length >= 50 && !/%PDF-|\b\d+\s+\d+\s+obj\b|\/FlateDecode|startxref/.test(text);
}

/** Fail explicitly rather than treating PDF internals as candidate evidence. */
export async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  let text: string;
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    text = buffer.toString("utf-8");
  } else if (mimeType === "application/pdf" || mimeType.includes("pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      text = (await parser.getText()).text;
    } catch (error) {
      console.error("PDF text extraction failed:", error);
      if (error instanceof Error && /worker|Cannot find module|DOMMatrix/i.test(error.message)) {
        throw new Error("The server's PDF reader could not start. Please restart the app and retry your PDF upload.", { cause: error });
      }
      throw new Error("Could not read this PDF resume. Upload a readable, text-based PDF or a plain text resume.", { cause: error });
    } finally {
      await parser.destroy();
    }
  } else {
    throw new Error("Unsupported resume format. Upload a PDF or plain text resume.");
  }
  if (!isReadableResumeText(text)) {
    throw new Error("No readable resume text found. For scanned PDFs, upload a text-based PDF or plain text resume.");
  }
  return text.trim();
}

/** Re-read old uploads affected by the former raw-PDF fallback. */
export async function getReadableResumeText(resume: { extractedText: string; filePath: string; mimeType: string }): Promise<string> {
  if (isReadableResumeText(resume.extractedText)) return resume.extractedText;
  return extractResumeText(await getStorageProvider().readFile(resume.filePath), resume.mimeType);
}
