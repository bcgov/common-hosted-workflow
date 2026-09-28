import type { ExtractionOptions } from './extractor';

const NUMERIC_LIMITS = {
  maxPages: [1, 100, true],
  renderScale: [1, 4, false],
  minimumTextLength: [0, 10000, true],
  maxCharacters: [1000, 10000000, true],
  documentTimeoutMs: [1000, 300000, true],
} as const;

/** UI bounds do not validate expressions or imported workflow values. */
export function validateExtractionOptions(options: ExtractionOptions): void {
  for (const name of Object.keys(NUMERIC_LIMITS) as Array<keyof typeof NUMERIC_LIMITS>) {
    const [min, max, integer] = NUMERIC_LIMITS[name];
    const value = options[name];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    ) {
      throw new Error(`${name} must be a finite ${integer ? 'integer' : 'number'} from ${min} through ${max}`);
    }
  }
  if (!['auto', 'text', 'ocr'].includes(options.mode)) {
    throw new Error('mode must be auto, text, or ocr');
  }
  if (!['auto', 'singleBlock', 'singleColumn', 'sparseText'].includes(options.pageSegmentationMode)) {
    throw new Error('pageSegmentationMode must be auto, singleBlock, singleColumn, or sparseText');
  }
}
