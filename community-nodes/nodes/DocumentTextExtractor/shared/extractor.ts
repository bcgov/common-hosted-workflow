import { imageSize } from 'image-size';
import { PdfEngine } from './pdfEngine';
import type { PdfProviderFactory } from './pdfProvider';

export type ExtractionMode = 'auto' | 'text' | 'ocr';
export type PageSegmentationMode = 'auto' | 'singleBlock' | 'singleColumn' | 'sparseText';

export interface ExtractionOptions {
  mode: ExtractionMode;
  language: string;
  pageSegmentationMode: PageSegmentationMode;
  renderScale: number;
  maxPages: number;
  minimumTextLength: number;
  pageSeparator: string;
  maxCharacters: number;
  documentTimeoutMs: number;
  password?: string;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  method: 'pdfText' | 'ocr';
  confidence: number | null;
}

export interface ExtractionResult {
  text: string;
  method: 'pdfText' | 'ocr' | 'mixed';
  pages: ExtractedPage[];
  pageCount: number;
  processedPageCount: number;
  truncated: boolean;
  textTruncated: boolean;
}

export interface OcrProvider {
  recognize(image: Buffer | Uint8Array, timeoutMs?: number): Promise<{ text: string; confidence: number }>;
}

const MAX_PIXELS = 16_000_000;
const SUPPORTED_IMAGE_TYPES = new Set(['bmp', 'jpg', 'png', 'tiff', 'webp']);

function isPdf(buffer: Buffer, mimeType?: string): boolean {
  return mimeType === 'application/pdf' || buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function isImage(mimeType?: string): boolean {
  return mimeType?.startsWith('image/') === true;
}

function getRemainingTime(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Document extraction timed out');
  return remaining;
}

function limitOutput(pages: ExtractedPage[], maxCharacters: number): boolean {
  let remaining = maxCharacters;
  let truncated = false;

  for (const page of pages) {
    if (page.text.length > remaining) {
      page.text = page.text.slice(0, Math.max(remaining, 0));
      truncated = true;
    }
    remaining -= page.text.length;
  }
  return truncated;
}

function summarizeMethod(pages: ExtractedPage[]): ExtractionResult['method'] {
  const methods = new Set(pages.map((page) => page.method));
  if (methods.size > 1) return 'mixed';
  return methods.has('ocr') ? 'ocr' : 'pdfText';
}

async function extractPdf(
  buffer: Buffer,
  options: ExtractionOptions,
  ocrProvider: OcrProvider,
  pdfProviderFactory: PdfProviderFactory,
): Promise<ExtractionResult> {
  const deadline = Date.now() + options.documentTimeoutMs;
  const parser = pdfProviderFactory(buffer, options.password || undefined, options.documentTimeoutMs);

  try {
    let totalPages = 0;
    let pages: ExtractedPage[] = [];

    if (options.mode !== 'ocr') {
      const textResult = await parser.getText(options.maxPages, getRemainingTime(deadline));
      totalPages = textResult.total;
      pages = textResult.pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text.trim(),
        method: 'pdfText',
        confidence: null,
      }));
    }

    let pagesToOcr: number[];
    let pageDimensions = new Map<number, { width: number; height: number }>();
    if (options.mode === 'ocr') {
      const info = await parser.inspect(undefined, options.maxPages, getRemainingTime(deadline));
      totalPages = info.total;
      pageDimensions = new Map(info.pages.map((page) => [page.pageNumber, page]));
      pagesToOcr = Array.from({ length: Math.min(totalPages, options.maxPages) }, (_, index) => index + 1);
    } else if (options.mode === 'auto') {
      pagesToOcr = pages
        .filter((page) => page.text.replace(/\s/g, '').length < options.minimumTextLength)
        .map((page) => page.pageNumber);
    } else {
      pagesToOcr = [];
    }

    if (pagesToOcr.length > 0) {
      if (pageDimensions.size === 0) {
        const info = await parser.inspect(pagesToOcr, options.maxPages, getRemainingTime(deadline));
        pageDimensions = new Map(info.pages.map((page) => [page.pageNumber, page]));
      }

      const ocrPages: ExtractedPage[] = [];
      for (const pageNumber of pagesToOcr) {
        const dimensions = pageDimensions.get(pageNumber);
        if (!dimensions) throw new Error(`Unable to inspect PDF page ${pageNumber}`);
        const renderedPixels = dimensions.width * dimensions.height * options.renderScale ** 2;
        if (renderedPixels > MAX_PIXELS) {
          throw new Error(`PDF page ${pageNumber} exceeds the ${MAX_PIXELS.toLocaleString()} rendered-pixel limit`);
        }

        const screenshot = await parser.renderPage(pageNumber, options.renderScale, getRemainingTime(deadline));
        const recognized = await ocrProvider.recognize(screenshot, getRemainingTime(deadline));
        ocrPages.push({
          pageNumber,
          text: recognized.text,
          method: 'ocr',
          confidence: recognized.confidence,
        });
      }

      if (options.mode === 'ocr') {
        pages = ocrPages;
      } else {
        const ocrByPage = new Map(ocrPages.map((page) => [page.pageNumber, page]));
        pages = pages.map((page) => ocrByPage.get(page.pageNumber) ?? page);
      }
    }

    pages.sort((left, right) => left.pageNumber - right.pageNumber);
    let textTruncated = limitOutput(pages, options.maxCharacters);
    const combinedText = pages.map((page) => page.text).join(options.pageSeparator);
    if (combinedText.length > options.maxCharacters) textTruncated = true;

    return {
      text: combinedText.slice(0, options.maxCharacters),
      method: summarizeMethod(pages),
      pages,
      pageCount: totalPages,
      processedPageCount: pages.length,
      truncated: totalPages > options.maxPages,
      textTruncated,
    };
  } finally {
    await parser.terminate();
  }
}

export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string | undefined,
  options: ExtractionOptions,
  ocrProvider: OcrProvider,
  pdfProviderFactory: PdfProviderFactory = (data, password, timeoutMs) => new PdfEngine(data, password, timeoutMs),
): Promise<ExtractionResult> {
  if (isPdf(buffer, mimeType)) {
    return await extractPdf(buffer, options, ocrProvider, pdfProviderFactory);
  }

  if (!isImage(mimeType)) {
    throw new Error(`Unsupported file type${mimeType ? `: ${mimeType}` : ''}. Provide a PDF or image file.`);
  }

  const dimensions = imageSize(buffer);
  if (!dimensions.type || !SUPPORTED_IMAGE_TYPES.has(dimensions.type)) {
    throw new Error(`Unsupported image format: ${dimensions.type ?? 'unknown'}`);
  }
  if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > MAX_PIXELS) {
    throw new Error(`The image exceeds the ${MAX_PIXELS.toLocaleString()} pixel limit`);
  }

  const recognized = await ocrProvider.recognize(buffer, options.documentTimeoutMs);
  const textTruncated = recognized.text.length > options.maxCharacters;
  const text = recognized.text.slice(0, options.maxCharacters);
  const pages: ExtractedPage[] = [
    {
      pageNumber: 1,
      text,
      method: 'ocr',
      confidence: recognized.confidence,
    },
  ];

  return {
    text,
    method: 'ocr',
    pages,
    pageCount: 1,
    processedPageCount: 1,
    truncated: false,
    textTruncated,
  };
}
