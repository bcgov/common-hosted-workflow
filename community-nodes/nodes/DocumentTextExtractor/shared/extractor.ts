import { imageSize } from 'image-size';
import { PdfEngine } from './pdfEngine';
import type { PdfProvider, PdfProviderFactory } from './pdfProvider';

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

async function loadEmbeddedText(
  parser: PdfProvider,
  options: ExtractionOptions,
  deadline: number,
): Promise<{ totalPages: number; pages: ExtractedPage[] }> {
  if (options.mode === 'ocr') {
    return { totalPages: 0, pages: [] };
  }

  const textResult = await parser.getText(options.maxPages, getRemainingTime(deadline));
  const pages: ExtractedPage[] = textResult.pages.map((page) => ({
    pageNumber: page.pageNumber,
    text: page.text.trim(),
    method: 'pdfText',
    confidence: null,
  }));
  return { totalPages: textResult.total, pages };
}

async function determineOcrPlan(
  parser: PdfProvider,
  options: ExtractionOptions,
  textPages: ExtractedPage[],
  textTotal: number,
  deadline: number,
): Promise<{
  totalPages: number;
  pageDimensions: Map<number, { width: number; height: number }>;
  pagesToOcr: number[];
}> {
  if (options.mode === 'ocr') {
    const info = await parser.inspect(undefined, options.maxPages, getRemainingTime(deadline));
    const pageDimensions = new Map(info.pages.map((page) => [page.pageNumber, page]));
    const pagesToOcr = Array.from({ length: Math.min(info.total, options.maxPages) }, (_, index) => index + 1);
    return { totalPages: info.total, pageDimensions, pagesToOcr };
  }

  if (options.mode === 'auto') {
    const pagesToOcr = textPages
      .filter((page) => page.text.replace(/\s/g, '').length < options.minimumTextLength)
      .map((page) => page.pageNumber);
    return { totalPages: textTotal, pageDimensions: new Map(), pagesToOcr };
  }

  return { totalPages: textTotal, pageDimensions: new Map(), pagesToOcr: [] };
}

async function resolvePageDimensions(
  parser: PdfProvider,
  pagesToOcr: number[],
  pageDimensions: Map<number, { width: number; height: number }>,
  options: ExtractionOptions,
  deadline: number,
): Promise<Map<number, { width: number; height: number }>> {
  if (pagesToOcr.length === 0 || pageDimensions.size > 0) {
    return pageDimensions;
  }

  const info = await parser.inspect(pagesToOcr, options.maxPages, getRemainingTime(deadline));
  return new Map(info.pages.map((page) => [page.pageNumber, page]));
}

function assertPageDimensions(
  pageNumber: number,
  pageDimensions: Map<number, { width: number; height: number }>,
  renderScale: number,
): { width: number; height: number } {
  const dimensions = pageDimensions.get(pageNumber);
  if (!dimensions) throw new Error(`Unable to inspect PDF page ${pageNumber}`);
  const renderedPixels = dimensions.width * dimensions.height * renderScale ** 2;
  if (renderedPixels > MAX_PIXELS) {
    throw new Error(`PDF page ${pageNumber} exceeds the ${MAX_PIXELS.toLocaleString()} rendered-pixel limit`);
  }
  return dimensions;
}

async function runOcrForPages(
  parser: PdfProvider,
  ocrProvider: OcrProvider,
  pagesToOcr: number[],
  pageDimensions: Map<number, { width: number; height: number }>,
  options: ExtractionOptions,
  deadline: number,
): Promise<ExtractedPage[]> {
  const ocrPages: ExtractedPage[] = [];
  for (const pageNumber of pagesToOcr) {
    assertPageDimensions(pageNumber, pageDimensions, options.renderScale);
    const screenshot = await parser.renderPage(pageNumber, options.renderScale, getRemainingTime(deadline));
    const recognized = await ocrProvider.recognize(screenshot, getRemainingTime(deadline));
    ocrPages.push({
      pageNumber,
      text: recognized.text,
      method: 'ocr',
      confidence: recognized.confidence,
    });
  }
  return ocrPages;
}

function mergeExtractedPages(pages: ExtractedPage[], ocrPages: ExtractedPage[], mode: ExtractionMode): ExtractedPage[] {
  if (mode === 'ocr') return ocrPages;
  const ocrByPage = new Map(ocrPages.map((page) => [page.pageNumber, page]));
  return pages.map((page) => ocrByPage.get(page.pageNumber) ?? page);
}

function finalizePdfResult(pages: ExtractedPage[], totalPages: number, options: ExtractionOptions): ExtractionResult {
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
    const embedded = await loadEmbeddedText(parser, options, deadline);
    const plan = await determineOcrPlan(parser, options, embedded.pages, embedded.totalPages, deadline);

    let pages = embedded.pages;
    const totalPages = plan.totalPages;

    if (plan.pagesToOcr.length > 0) {
      const pageDimensions = await resolvePageDimensions(
        parser,
        plan.pagesToOcr,
        plan.pageDimensions,
        options,
        deadline,
      );
      const ocrPages = await runOcrForPages(parser, ocrProvider, plan.pagesToOcr, pageDimensions, options, deadline);
      pages = mergeExtractedPages(pages, ocrPages, options.mode);
    }

    return finalizePdfResult(pages, totalPages, options);
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
