import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconLoader2, IconHandGrab, IconHandOff, IconPlayerPlay, IconUser } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { WilActionItem } from '../../services/backend/wil';
import { postWilClaimAction, postWilUnclaimAction, postWilStartAction } from '../../services/backend/wil';
import { extractErrorMessage } from '../shared/error-utils';

interface ClaimGateProps {
  action: WilActionItem;
  tenantId: string;
  userEmail: string;
  onInteractionSuccess?: () => void;
  children: React.ReactNode;
}

function isSharedActorType(actorType: string | undefined): boolean {
  return actorType === 'role' || actorType === 'group';
}

/**
 * Wraps action handlers and manages claim lifecycle for role/group actions.
 *
 * - pending + shared actor: shows Claim button (blocks execution)
 * - claimed + current user is claimer: shows Start + Unclaim buttons
 * - claimed + current user is NOT claimer: shows claimed-by indicator only
 * - in_progress + current user is claimer: renders children (action handler)
 * - in_progress + current user is NOT claimer: shows in-progress indicator
 * - direct-user actions: renders children immediately (no claim gate)
 */
export function ClaimGate({ action, tenantId, userEmail, onInteractionSuccess, children }: Readonly<ClaimGateProps>) {
  const queryClient = useQueryClient();
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
  });

  const claimMutation = useMutation({
    mutationFn: () => postWilClaimAction({ tenantId, actionId: action.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
      onInteractionSuccessRef.current?.();
    },
  });

  const unclaimMutation = useMutation({
    mutationFn: () => postWilUnclaimAction({ tenantId, actionId: action.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
      onInteractionSuccessRef.current?.();
    },
  });

  const startMutation = useMutation({
    mutationFn: () => postWilStartAction({ tenantId, actionId: action.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
      onInteractionSuccessRef.current?.();
    },
  });

  // Direct-user actions bypass the claim gate entirely
  if (!isSharedActorType(action.actorType)) {
    return <>{children}</>;
  }

  const isClaimingActor = action.claimedBy === userEmail;

  // Pending: show Claim button, block execution
  if (action.status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <IconHandGrab size={32} className="text-[var(--bc-blue)]" aria-hidden="true" />
        <p className="text-sm font-medium text-[var(--bc-text)]">
          This action is assigned to a {action.actorType}. Claim it to begin.
        </p>

        {claimMutation.isError && (
          <p className="text-sm text-red-600" role="alert">
            {extractErrorMessage(claimMutation.error, 'Failed to claim action. Please try again.')}
          </p>
        )}

        <Button onClick={() => claimMutation.mutate()} disabled={claimMutation.isPending}>
          {claimMutation.isPending && <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />}
          <IconHandGrab size={16} aria-hidden="true" />
          Claim
        </Button>
      </div>
    );
  }

  // Claimed: show different UI depending on who the claiming actor is
  if (action.status === 'claimed') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <ClaimedByIndicator claimedBy={action.claimedBy} />

        {isClaimingActor ? (
          <div className="flex flex-col items-center gap-3">
            {startMutation.isError && (
              <p className="text-sm text-red-600" role="alert">
                {extractErrorMessage(startMutation.error, 'Failed to start action. Please try again.')}
              </p>
            )}
            {unclaimMutation.isError && (
              <p className="text-sm text-red-600" role="alert">
                {extractErrorMessage(unclaimMutation.error, 'Failed to unclaim action. Please try again.')}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending || unclaimMutation.isPending}
              >
                {startMutation.isPending && <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />}
                <IconPlayerPlay size={16} aria-hidden="true" />
                Start
              </Button>
              <Button
                variant="outline"
                onClick={() => unclaimMutation.mutate()}
                disabled={unclaimMutation.isPending || startMutation.isPending}
              >
                {unclaimMutation.isPending && <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />}
                <IconHandOff size={16} aria-hidden="true" />
                Unclaim
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--bc-muted)]">Waiting for the claiming actor to start this action.</p>
        )}
      </div>
    );
  }

  // In progress: only the claiming actor sees the action handler
  if (action.status === 'in_progress') {
    if (isClaimingActor) {
      return <>{children}</>;
    }
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <IconPlayerPlay size={32} className="text-[var(--bc-blue)]" aria-hidden="true" />
        <Badge variant="secondary" className="gap-1 bg-blue-50 text-blue-700 border-blue-200">
          <IconUser size={12} aria-hidden="true" />
          In progress by {action.claimedBy}
        </Badge>
        <p className="text-sm text-[var(--bc-muted)]">This action is being handled by another actor.</p>
      </div>
    );
  }

  // Fallback: render children (shouldn't happen in normal flow)
  return <>{children}</>;
}

function ClaimedByIndicator({ claimedBy }: Readonly<{ claimedBy: string | null }>) {
  return (
    <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-700 border-amber-200">
      <IconUser size={12} aria-hidden="true" />
      Claimed by {claimedBy}
    </Badge>
  );
}
