import { formatCount } from '@/lib/rate-limit';

/** Upper bounds shared by the per-project and default-limits dialogs. */
export const MAX_WEEKLY_LIMIT = 1_000_000;
export const MAX_YEARLY_LIMIT = 100_000_000;

export type LimitParseResult = number | null | undefined;
// undefined = not a valid whole number; null = input cleared (limit removed)

/**
 * Parses a limit input: empty string → null (clear the limit); a whole number
 * (commas/spaces tolerated) → the number; anything else → undefined.
 */
export function parseLimitInput(raw: string): LimitParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const normalized = trimmed.replaceAll(',', '').replaceAll(' ', '');
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }
  const value = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(value) ? value : undefined;
}

export type LimitFieldErrors = Partial<Record<'weekly' | 'yearly', string>>;

/**
 * Validates one scope's weekly/annual limit pair: whole numbers within the
 * shared bounds, with the annual limit at least the weekly limit.
 */
export function validateLimitPair(weekly: LimitParseResult, yearly: LimitParseResult): LimitFieldErrors {
  const errors: LimitFieldErrors = {};

  if (weekly === undefined) {
    errors.weekly = 'Enter a whole number';
  } else if (weekly !== null && weekly > MAX_WEEKLY_LIMIT) {
    errors.weekly = `Weekly limit must be ${formatCount(MAX_WEEKLY_LIMIT)} or less`;
  }

  if (yearly === undefined) {
    errors.yearly = 'Enter a whole number';
  } else if (yearly !== null && yearly > MAX_YEARLY_LIMIT) {
    errors.yearly = `Annual limit must be ${formatCount(MAX_YEARLY_LIMIT)} or less`;
  }

  if (typeof weekly === 'number' && typeof yearly === 'number' && yearly < weekly) {
    errors.yearly = 'Annual limit must be at least the weekly limit';
  }

  return errors;
}
