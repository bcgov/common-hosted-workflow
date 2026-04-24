/**
 * Strip trailing slash characters from a URL string.
 *
 * Uses a simple loop instead of a regex quantifier to avoid
 * SonarCloud S5852 (super-linear regex backtracking) false positives.
 */
export function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') {
    end--;
  }
  return url.slice(0, end);
}
