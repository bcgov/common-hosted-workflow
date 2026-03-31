/** Plain string → positive integer or null (query/path parsing). */
export const parsePositiveInteger = (value: string | undefined) => {
  if (!value) return null;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

/** Plain string → Date or null. */
export const parseDate = (value: string | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};
