/**
 * Extracts the submission ID from a `formio:submitDone` event detail.
 * CHEFS/Formio events are inconsistent about the field name and nesting,
 * so this tries every shape that's been observed in practice.
 */
export function extractSubmissionId(detail: unknown): string {
  const detailObj = detail as Record<string, unknown> | null;
  const submission = detailObj?.submission as Record<string, unknown> | undefined;
  return (
    (submission?.id as string) ??
    (submission?._id as string) ??
    (detailObj?.id as string) ??
    (detailObj?._id as string) ??
    ''
  );
}
