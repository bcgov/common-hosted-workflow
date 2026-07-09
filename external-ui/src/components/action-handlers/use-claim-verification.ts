import { useEffect, useState } from 'react';
import { getWilVerifyClaim } from '../../services/backend/wil';

/**
 * Hook that verifies claim ownership on mount for role/group actions.
 *
 * Returns claimError state and a setClaimError setter for pre-submit checks.
 * Skips verification entirely for direct-user actions.
 */
export function useClaimVerification(params: { tenantId: string; actionId: string; actorType?: string }) {
  const { tenantId, actionId, actorType } = params;
  const [claimError, setClaimError] = useState<string | null>(null);

  useEffect(() => {
    if (actorType !== 'role' && actorType !== 'group') return;
    let cancelled = false;
    getWilVerifyClaim({ tenantId, actionId })
      .then((result) => {
        if (!cancelled && !result.valid) {
          setClaimError('This action is no longer assigned to you. Another user may have unclaimed it.');
        }
      })
      .catch(() => {
        // Silently ignore verify errors on mount — the submit check will catch it
      });
    return () => {
      cancelled = true;
    };
  }, [actionId, actorType, tenantId]);

  return { claimError, setClaimError };
}

/**
 * Pre-submit claim verification for role/group actions.
 * Returns true if the claim is still valid, false otherwise (sets error via setClaimError).
 */
export async function verifyClaimBeforeSubmit(params: {
  tenantId: string;
  actionId: string;
  actorType?: string;
  setClaimError: (msg: string) => void;
}): Promise<boolean> {
  const { tenantId, actionId, actorType, setClaimError } = params;
  if (actorType !== 'role' && actorType !== 'group') return true;

  const result = await getWilVerifyClaim({ tenantId, actionId });
  if (!result.valid) {
    setClaimError('This action is no longer assigned to you. Another user may have unclaimed it.');
    return false;
  }
  return true;
}
