import { describe, expect, it, vi } from 'vitest';
import { imageSize } from 'image-size';
import { PdfAdapter } from '../../nodes/DocumentTextExtractor/shared/pdfAdapter';
import {
  extractDocumentText,
  type ExtractionOptions,
  type OcrProvider,
} from '../../nodes/DocumentTextExtractor/shared/extractor';

function createPdf(text = ''): Buffer {
  const escapedText = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const stream = escapedText ? `BT /F1 24 Tf 72 720 Td (${escapedText}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

const options: ExtractionOptions = {
  mode: 'auto',
  language: 'eng',
  pageSegmentationMode: 'auto',
  renderScale: 1,
  maxPages: 20,
  minimumTextLength: 5,
  pageSeparator: '\n\n',
  maxCharacters: 1000000,
  documentTimeoutMs: 10000,
};

describe('PDF extraction integration', () => {
  it('extracts a real embedded PDF text layer without starting OCR', async () => {
    const ocr: OcrProvider = { recognize: vi.fn() };

    const result = await extractDocumentText(
      createPdf('Hello PDF'),
      'application/pdf',
      options,
      ocr,
      (buffer, password) => new PdfAdapter(buffer, password),
    );

    expect(result.text).toContain('Hello PDF');
    expect(result.method).toBe('pdfText');
    expect(ocr.recognize).not.toHaveBeenCalled();
  });

  it('renders a real blank PDF page to PNG before OCR fallback', async () => {
    const recognize = vi.fn(async (image: Buffer | Uint8Array) => {
      expect(imageSize(image).type).toBe('png');
      return { text: 'Rendered page', confidence: 90 };
    });

    const result = await extractDocumentText(
      createPdf(),
      'application/pdf',
      options,
      { recognize },
      (buffer, password) => new PdfAdapter(buffer, password),
    );

    expect(result.text).toBe('Rendered page');
    expect(result.method).toBe('ocr');
    expect(recognize).toHaveBeenCalledOnce();
  });
});
