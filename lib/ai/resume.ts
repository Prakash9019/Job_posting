import { getStorageProvider } from "@/lib/storage";

// Polyfill browser canvas / DOM primitives required by pdfjs-dist in headless serverless environments (Node.js / Vercel)
if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as unknown as Record<string, unknown>).DOMMatrix = class DOMMatrix {};
}
if (typeof globalThis.Path2D === "undefined") {
  (globalThis as unknown as Record<string, unknown>).Path2D = class Path2D {};
}
if (typeof globalThis.ImageData === "undefined") {
  (globalThis as unknown as Record<string, unknown>).ImageData = class ImageData {};
}

export function isReadableResumeText(text: string): boolean {
  return text.trim().length >= 50 && !/%PDF-|\b\d+\s+\d+\s+obj\b|\/FlateDecode|startxref/.test(text);
}

async function transcribePdfWithGemini(buffer: Buffer): Promise<string> {
  try {
    const { transcribeDocumentWithAI } = await import("@/lib/ats/parse");
    return await transcribeDocumentWithAI(buffer, "application/pdf", false);
  } catch (err) {
    console.warn("Gemini PDF transcription fallback error:", err);
    return "";
  }
}

/** Fail explicitly rather than treating PDF internals as candidate evidence. */
export async function extractResumeText(buffer: Buffer, mimeType?: string): Promise<string> {
  let text = "";
  const safeMime = (
    mimeType ||
    (buffer.slice(0, 5).toString() === "%PDF-" ? "application/pdf" : "text/plain")
  ).toLowerCase();

  const isImage = safeMime.startsWith("image/") || /\.(png|jpe?g|webp|heic)$/i.test(safeMime);

  if (safeMime === "text/plain" || safeMime === "text/markdown" || safeMime.includes("tex") || safeMime === "application/x-tex") {
    text = buffer.toString("utf-8");
  } else if (safeMime === "application/pdf" || safeMime.includes("pdf")) {
    try {
      // Dynamic import ensures pdf-parse is only loaded when actively processing a PDF
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        // Extract text while preserving embedded link annotations as markdown [Text](URL)
        text = (await parser.getText({ parseHyperlinks: true })).text || "";
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch (parseError) {
      console.warn("pdf-parse extraction failed, attempting AI transcription fallback:", parseError);
      // Fallback: Use Gemini AI to extract text from the PDF directly with hyperlink preservation
      text = await transcribePdfWithGemini(buffer);
      if (!text) {
        throw new Error("Could not read this PDF resume. Upload a readable, text-based PDF or plain text resume.", { cause: parseError });
      }
    }
  } else if (isImage) {
    const { transcribeDocumentWithAI } = await import("@/lib/ats/parse");
    text = await transcribeDocumentWithAI(buffer, safeMime, false);
  } else {
    throw new Error("Unsupported resume format. Upload a PDF, LaTeX (.tex), photo/image, or plain text resume.");
  }

  // If text is still empty or unreadable, try Gemini fallback before erroring
  if (!isReadableResumeText(text) && (safeMime === "application/pdf" || safeMime.includes("pdf") || isImage)) {
    const aiText = isImage
      ? await (await import("@/lib/ats/parse")).transcribeDocumentWithAI(buffer, safeMime, false)
      : await transcribePdfWithGemini(buffer);
    if (isReadableResumeText(aiText)) {
      text = aiText;
    }
  }

  if (!isReadableResumeText(text)) {
    throw new Error("No readable resume text found. For scanned PDFs, upload a text-based PDF or plain text resume.");
  }
  return text.trim();
}

/** Re-read old uploads or refresh PDFs to guarantee hyperlinks are captured. */
export async function getReadableResumeText(resume: { extractedText: string; filePath: string; mimeType: string }): Promise<string> {
  if (
    isReadableResumeText(resume.extractedText) &&
    (resume.extractedText.includes("](") || !resume.filePath || !resume.mimeType.toLowerCase().includes("pdf"))
  ) {
    return resume.extractedText;
  }
  if (resume.filePath) {
    try {
      const fileBuf = await getStorageProvider().readFile(resume.filePath);
      const freshText = await extractResumeText(fileBuf, resume.mimeType);
      if (isReadableResumeText(freshText)) {
        return freshText;
      }
    } catch (err) {
      console.warn("getReadableResumeText failed to re-extract from storage, using cached text:", err);
    }
  }
  return resume.extractedText;
}
