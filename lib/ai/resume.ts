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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "";
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const model = process.env.GEMINI_EXTRACTION_MODEL || "gemini-2.5-flash";
    const res = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data: buffer.toString("base64"), mimeType: "application/pdf" } },
            { text: "Extract and transcribe all resume text verbatim. Return clean plain text only without commentary or fences." },
          ],
        },
      ],
    });
    return res.text?.trim() || "";
  } catch (err) {
    console.warn("Gemini PDF transcription fallback error:", err);
    return "";
  }
}

/** Fail explicitly rather than treating PDF internals as candidate evidence. */
export async function extractResumeText(buffer: Buffer, mimeType: string): Promise<string> {
  let text = "";
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    text = buffer.toString("utf-8");
  } else if (mimeType === "application/pdf" || mimeType.includes("pdf")) {
    try {
      // Dynamic import ensures pdf-parse is only loaded when actively processing a PDF
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        text = (await parser.getText()).text || "";
      } finally {
        await parser.destroy().catch(() => {});
      }
    } catch (parseError) {
      console.warn("pdf-parse extraction failed, attempting AI transcription fallback:", parseError);
      // Fallback: Use Gemini AI to extract text from the PDF directly
      text = await transcribePdfWithGemini(buffer);
      if (!text) {
        throw new Error("Could not read this PDF resume. Upload a readable, text-based PDF or plain text resume.", { cause: parseError });
      }
    }
  } else {
    throw new Error("Unsupported resume format. Upload a PDF or plain text resume.");
  }

  // If text is still empty or unreadable, try Gemini fallback before erroring
  if (!isReadableResumeText(text) && (mimeType === "application/pdf" || mimeType.includes("pdf"))) {
    const aiText = await transcribePdfWithGemini(buffer);
    if (isReadableResumeText(aiText)) {
      text = aiText;
    }
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
