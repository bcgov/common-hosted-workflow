import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = 768;

/**
 * Returns `true` when the viewport width is below the `md` breakpoint (768px).
 * Uses `matchMedia` for efficient resize detection without layout thrashing.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < MOBILE_BREAKPOINT;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);

    function handleChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }

    setIsMobile(mql.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}
