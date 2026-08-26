import { PDFParse } from 'pdf-parse';
import type { PdfInspectionResult, PdfProvider, PdfTextResult } from './pdfProvider';

const MAX_PIXELS = 16_000_000;

export class PdfAdapter implements PdfProvider {
  private readonly parser: PDFParse;

  constructor(buffer: Buffer | Uint8Array, password?: string) {
    this.parser = new PDFParse({
      data: new Uint8Array(buffer),
      password: password || undefined,
      isEvalSupported: false,
      maxImageSize: MAX_PIXELS,
    });
  }

  async getText(maxPages: number): Promise<PdfTextResult> {
    const result = await this.parser.getText({ first: maxPages, pageJoiner: '' });
    return {
      total: result.total,
      pages: result.pages.map((page) => ({ pageNumber: page.num, text: page.text })),
    };
  }

  async inspect(pageNumbers: number[] | undefined, maxPages: number): Promise<PdfInspectionResult> {
    const result = await this.parser.getInfo({
      parsePageInfo: true,
      ...(pageNumbers ? { partial: pageNumbers } : { first: maxPages }),
    });
    return {
      total: result.total,
      pages: result.pages.map((page) => ({
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
      })),
    };
  }

  async renderPage(pageNumber: number, scale: number): Promise<Uint8Array> {
    const result = await this.parser.getScreenshot({
      partial: [pageNumber],
      scale,
      imageBuffer: true,
      imageDataUrl: false,
    });
    const screenshot = result.pages[0];
    if (!screenshot) throw new Error(`PDF page ${pageNumber} did not render`);
    return screenshot.data;
  }

  async terminate(): Promise<void> {
    await this.parser.destroy();
  }
}
