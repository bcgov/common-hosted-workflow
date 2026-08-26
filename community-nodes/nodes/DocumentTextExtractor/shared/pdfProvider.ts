export interface PdfTextPage {
  pageNumber: number;
  text: string;
}

export interface PdfTextResult {
  total: number;
  pages: PdfTextPage[];
}

export interface PdfPageInfo {
  pageNumber: number;
  width: number;
  height: number;
}

export interface PdfInspectionResult {
  total: number;
  pages: PdfPageInfo[];
}

export interface PdfProvider {
  getText(maxPages: number, timeoutMs: number): Promise<PdfTextResult>;
  inspect(pageNumbers: number[] | undefined, maxPages: number, timeoutMs: number): Promise<PdfInspectionResult>;
  renderPage(pageNumber: number, scale: number, timeoutMs: number): Promise<Uint8Array>;
  terminate(): Promise<void>;
}

export type PdfProviderFactory = (buffer: Buffer, password: string | undefined, timeoutMs: number) => PdfProvider;
