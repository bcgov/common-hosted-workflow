const STORAGE_KEY = 'sdg_tester_name';

/** Reads the tester name from localStorage, or null if not set. */
export function getTesterName(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

/** Writes the tester name to localStorage. */
export function setTesterName(name: string): void {
  localStorage.setItem(STORAGE_KEY, name);
}

/** Removes the tester name from localStorage. */
export function clearTesterName(): void {
  localStorage.removeItem(STORAGE_KEY);
}
