import { PDFParse } from 'pdf-parse';

export async function extractPdfText(dataBuffer: Buffer | Uint8Array, maxChars: number = 30000): Promise<string> {
  try {
    const PDFParseClass: any = PDFParse;
    if (typeof PDFParseClass === 'function') {
      const uint8 = new Uint8Array(dataBuffer.buffer, dataBuffer.byteOffset, dataBuffer.byteLength);
      const parser = new PDFParseClass(uint8);
      if (typeof parser.load === 'function') {
        await parser.load();
      }
      if (typeof parser.getText === 'function') {
        const result = await parser.getText();
        const rawText = typeof result === 'string' ? result : result?.text || '';
        return rawText.replace(/\s+/g, ' ').trim().substring(0, maxChars);
      }
    }
    return '';
  } catch (err: any) {
    console.warn('[PdfExtractor] Failed to extract text from PDF buffer:', err.message);
    return '';
  }
}
