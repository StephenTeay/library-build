import { PDFDocument, rgb, degrees } from 'pdf-lib';

export interface WatermarkOptions {
  studentName?: string;
  matricNo?: string;
  ipAddress?: string;
  timestamp?: string;
}

export async function watermarkPdf(
  pdfBuffer: Buffer | Uint8Array,
  options: WatermarkOptions
): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    const dateStr = options.timestamp || new Date().toISOString().split('T')[0];
    const identifier = options.matricNo ? `(${options.matricNo})` : options.ipAddress || '';
    const watermarkText = `FSS-IB E-Library • Licensed to: ${options.studentName || 'Student'} ${identifier} • ${dateStr}`;

    for (const page of pages) {
      const { width, height } = page.getSize();

      // Top margin watermark
      page.drawText(watermarkText, {
        x: 30,
        y: height - 18,
        size: 8,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Bottom margin watermark
      page.drawText(watermarkText, {
        x: 30,
        y: 12,
        size: 8,
        color: rgb(0.4, 0.4, 0.4),
      });

      // Subtle diagonal watermark across page center
      page.drawText(`FSS-IB • ${options.matricNo || 'DIGITAL LIBRARY'}`, {
        x: width / 4,
        y: height / 2,
        size: 28,
        color: rgb(0.85, 0.85, 0.85),
        rotate: degrees(45),
        opacity: 0.35,
      });
    }

    return await pdfDoc.save();
  } catch (err: any) {
    console.warn('[Watermarker] Failed to watermark PDF, returning raw bytes:', err.message);
    return pdfBuffer;
  }
}
