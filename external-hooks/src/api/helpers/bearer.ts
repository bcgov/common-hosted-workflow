/** Extracts the bearer token from `Authorization: Bearer <token>`. */
export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  return match?.[1]?.trim?.() ?? null;
}
