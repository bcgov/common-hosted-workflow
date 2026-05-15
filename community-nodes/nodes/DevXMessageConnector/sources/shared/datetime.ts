/**
 * Converts a Unix timestamp (ms) or an ISO string into
 * the specific YYYY-MM-DDTHH:mm:ssZ format.
 */
export const formatToIsoTimestamp = (input: number | string | null | undefined): string | undefined => {
  if (!input) return undefined;

  const date = new Date(input);

  if (isNaN(date.getTime())) {
    return undefined;
  }

  // toISOString() returns YYYY-MM-DDTHH:mm:ss.sssZ
  const isoString = date.toISOString();

  // Split at the dot to remove milliseconds and re-add the 'Z' suffix
  return isoString.split('.')[0] + 'Z';
};
