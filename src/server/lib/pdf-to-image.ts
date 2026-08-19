import { PDFParse } from "pdf-parse";

/**
 * Extract text content from a PDF buffer.
 * Returns the full text (concatenated from all pages) and page count.
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<{ text: string; numPages: number }> {
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  try {
    const result = await parser.getText();
    return {
      text: result.text,
      numPages: result.total,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
