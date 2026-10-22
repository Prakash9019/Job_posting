/** Minimal typed view of the pdf-parse/pdf.js objects the diagnostic scripts touch. */
export interface PdfPageLike {
  getTextContent(): Promise<{ items: Array<{ str: string }> }>;
  getAnnotations(opt?: { intent: string }): Promise<Array<{ subtype?: string; url?: string; unsafeUrl?: string }>>;
}
export interface PdfParseLike {
  doc: { numPages: number; getPage(n: number): Promise<PdfPageLike> };
  load(): Promise<void>;
  destroy(): Promise<void>;
}
