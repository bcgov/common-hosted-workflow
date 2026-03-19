/**
 * Converts a Unix timestamp (ms) or an ISO string into
 * the specific YYYY-MM-DDTHH:mm:ssZ format.
 */
export const formatToIsoTimestamp = (input: number | string): string => {
  const date = new Date(input);

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date input: ${input}`);
  }

  // toISOString() returns YYYY-MM-DDTHH:mm:ss.sssZ
  const isoString = date.toISOString();

  // Split at the dot to remove milliseconds and re-add the 'Z' suffix
  return isoString.split('.')[0] + 'Z';
};
