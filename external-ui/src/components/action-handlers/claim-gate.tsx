import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { IconLoader2, IconInfoCircle } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CopyField } from '@/components/patterns/copy-field';
import type { WilActionItem } from '../../services/backend/wil';
import { postWilClaimAction, postWilUnclaimAction, postWilStartAction } from '../../services/backend/wil';
import { extractErrorMessage } from '../shared/error-utils';

interface ClaimGateProps {
  action: WilActionItem;
  tenantId: string;
  userEmail: string;
  onInteractionSuccess?: () => void;
  onActionUpdated?: (action: WilActionItem | null) => void;
  children: React.ReactNode;
}

function isSharedActorType(actorType: string | undefined): boolean {
  return actorType === 'role' || actorType === 'group';
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

function formatDisplayName(email: string | null): string {
  if (!email) return 'Another user';
  if (!email.includes('@')) return email;
  return email
    .split('@')[0]
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function MetadataRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex gap-4">
      <span className="w-[150px] shrink-0 text-[13px] text-[#64748b]">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-foreground">{value}</span>
    </div>
  );
}

function MutationError({
  error,
  fallback,
  onRefresh,
}: Readonly<{ error: Error | null; fallback: string; onRefresh?: () => void }>) {
  if (!error) return null;
  return (
    <div className="flex items-center gap-2">
      <p className="text-sm text-red-600" role="alert">
        {extractErrorMessage(error, fallback)}
      </p>
      {onRefresh && (
        <button
          type="button"
          className="shrink-0 text-sm font-medium text-[#255a90] hover:underline"
          onClick={onRefresh}
        >
          Refresh
        </button>
      )}
    </div>
  );
}

// ---------- State 1: Pending (unclaimed) ----------

interface PendingClaimViewProps {
  action: WilActionItem;
  actorLabel: string;
  claimMutation: UseMutationResult<WilActionItem, Error, void>;
  onRefresh: () => void;
}

function PendingClaimView({ action, actorLabel, claimMutation, onRefresh }: Readonly<PendingClaimViewProps>) {
  return (
    <div className="flex flex-col gap-4.5">
      <div className="rounded-[10px] border border-[#cfe0f5] bg-[#eff4fb] px-5 py-[18px] space-y-2.5">
        <div className="flex items-center gap-2.5">
          <IconInfoCircle size={22} className="shrink-0 text-[#2563eb]" aria-hidden="true" />
          <p className="text-[15px] font-bold text-foreground">This action is assigned to a {actorLabel}</p>
        </div>
        <p className="text-sm leading-[1.5] text-[#334155]">
          Claiming assigns the action to you and removes it from the {actorLabel} queue. You can unclaim at any time.
        </p>
        <MutationError error={claimMutation.error} fallback="Failed to claim action." onRefresh={onRefresh} />
        <Button
          className="bg-[#013366] hover:bg-[#012a54] text-white font-bold px-[18px] py-2.5 rounded-md"
          onClick={() => claimMutation.mutate()}
          disabled={claimMutation.isPending}
        >
          {claimMutation.isPending && <IconLoader2 size={16} className="animate-spin mr-1" aria-hidden="true" />}
          Claim action
        </Button>
      </div>

      <hr className="border-[#e2e8f0]" />
      <CopyField label="Action ID" value={action.id} />

      <div className="flex flex-col gap-3">
        <MetadataRow label="Assigned group" value={action.actorId} />
        <MetadataRow label="Priority" value={action.priority === 'critical' ? 'Critical' : 'Normal'} />
        <MetadataRow label="Created" value={formatDateTime(action.createdAt)} />
        {action.dueDate && <MetadataRow label="Expires" value={formatDateTime(action.dueDate)} />}
      </div>
    </div>
  );
}

// ---------- State 2: Claimed by current user ----------

interface ClaimedByMeViewProps {
  action: WilActionItem;
  actorLabel: string;
  startMutation: UseMutationResult<WilActionItem, Error, void>;
  unclaimMutation: UseMutationResult<WilActionItem, Error, void>;
  onRefresh: () => void;
}

function ClaimedByMeView({
  action,
  actorLabel,
  startMutation,
  unclaimMutation,
  onRefresh,
}: Readonly<ClaimedByMeViewProps>) {
  return (
    <div className="flex flex-col gap-4.5">
      <div className="rounded-[10px] border border-[#91c4fa] bg-[#f1f8fe] px-4 py-3.5 space-y-1">
        <p className="text-[15px] font-bold text-foreground">Claimed by you</p>
        <p className="text-sm leading-[1.45] text-[#474543]">
          You claimed this action. Select Start when you are ready to begin, or unclaim to return it to the {actorLabel}{' '}
          queue.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <MutationError error={startMutation.error} fallback="Failed to start action." onRefresh={onRefresh} />
          <Button
            className="bg-[#013366] hover:bg-[#012a54] text-white font-bold px-[22px] py-[11px] rounded-md"
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending || unclaimMutation.isPending}
          >
            {startMutation.isPending && <IconLoader2 size={16} className="animate-spin mr-1" aria-hidden="true" />}
            Start
          </Button>
        </div>

        <div className="flex flex-col items-end gap-0.5">
          <MutationError error={unclaimMutation.error} fallback="Failed to unclaim." onRefresh={onRefresh} />
          <button
            type="button"
            className="px-2 py-1.5 text-sm text-[#605e5c] hover:text-foreground hover:underline disabled:opacity-50"
            onClick={() => unclaimMutation.mutate()}
            disabled={unclaimMutation.isPending || startMutation.isPending}
          >
            {unclaimMutation.isPending ? 'Unclaiming…' : 'Unclaim'}
          </button>
          <span className="text-xs text-[#9f9d9c]">Returns this action to the {actorLabel} queue.</span>
        </div>
      </div>

      <hr className="border-[#e2e8f0]" />
      <CopyField label="Action ID" value={action.id} />

      <div className="flex flex-col gap-3">
        <MetadataRow label="Claimed by" value="You" />
        {action.claimedAt && <MetadataRow label="Claimed" value={formatRelativeTime(action.claimedAt)} />}
        <MetadataRow label="Priority" value={action.priority === 'critical' ? 'Critical' : 'Normal'} />
        <MetadataRow label="Created" value={formatDateTime(action.createdAt)} />
      </div>
    </div>
  );
}

// ---------- State 3: Claimed or in-progress by another user ----------

interface ClaimedByOtherViewProps {
  action: WilActionItem;
  actorLabel: string;
  displayName: string;
  unclaimMutation: UseMutationResult<WilActionItem, Error, void>;
  onRefresh: () => void;
}

function ClaimedByOtherView({
  action,
  actorLabel,
  displayName,
  unclaimMutation,
  onRefresh,
}: Readonly<ClaimedByOtherViewProps>) {
  const [showConfirm, setShowConfirm] = useState(false);
  const isInProgress = action.status === 'in_progress';

  const confirmDescription = isInProgress
    ? `${displayName} is currently working on this action. Unclaiming will interrupt their work and return the action to the ${actorLabel} queue.`
    : `This action is claimed by ${displayName}. Unclaiming will return it to the ${actorLabel} queue.`;

  return (
    <div className="flex flex-col gap-4.5">
      <div className="rounded-[10px] border border-[#91c4fa] bg-[#f1f8fe] px-4 py-3.5 space-y-1">
        <p className="text-[15px] font-bold text-foreground">{displayName} is working on this action</p>
        <p className="text-sm leading-[1.45] text-[#474543]">
          This action was claimed by another user. You can unclaim it to return it to the {actorLabel} queue.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <MutationError error={unclaimMutation.error} fallback="Failed to unclaim." onRefresh={onRefresh} />
        <Button
          variant="outline"
          className="self-start rounded-md border-[#d1cfcd] bg-[#f3f2f1] px-[18px] py-[9px] text-sm font-bold text-[#605e5c] hover:bg-[#e8e6e4]"
          onClick={() => setShowConfirm(true)}
          disabled={unclaimMutation.isPending}
        >
          {unclaimMutation.isPending && <IconLoader2 size={14} className="animate-spin mr-1" aria-hidden="true" />}
          Unclaim
        </Button>
        <span className="text-xs text-[#9f9d9c]">Unclaiming returns this action to the {actorLabel} queue.</span>
      </div>

      <hr className="border-[#e2e8f0]" />
      <CopyField label="Action ID" value={action.id} />

      <div className="flex flex-col gap-3">
        <MetadataRow label="Claimed by" value={displayName} />
        {action.claimedAt && <MetadataRow label="Claimed" value={formatRelativeTime(action.claimedAt)} />}
        <MetadataRow label="Priority" value={action.priority === 'critical' ? 'Critical' : 'Normal'} />
        <MetadataRow label="Created" value={formatDateTime(action.createdAt)} />
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Unclaim this action?"
        description={confirmDescription}
        confirmLabel="Unclaim"
        confirmVariant="destructive"
        isConfirming={unclaimMutation.isPending}
        onConfirm={() => {
          unclaimMutation.mutate();
          setShowConfirm(false);
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}

// ---------- State 4: In progress by current user (show handler below) ----------

interface InProgressByMeBarProps {
  unclaimMutation: UseMutationResult<WilActionItem, Error, void>;
  onRefresh: () => void;
}

function InProgressByMeBar({ unclaimMutation, onRefresh }: Readonly<InProgressByMeBarProps>) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-[#91c4fa] bg-[#f1f8fe] px-4 py-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-foreground">Claimed by you</p>
        <MutationError error={unclaimMutation.error} fallback="Failed to unclaim." onRefresh={onRefresh} />
      </div>
      <button
        type="button"
        className="px-2 py-1 text-sm text-[#605e5c] hover:text-foreground hover:underline disabled:opacity-50"
        onClick={() => unclaimMutation.mutate()}
        disabled={unclaimMutation.isPending}
      >
        {unclaimMutation.isPending ? 'Unclaiming…' : 'Unclaim'}
      </button>
    </div>
  );
}

// ---------- Main ClaimGate component ----------

/**
 * Claim gate for group/role actions.
 *
 * Renders UI for claim lifecycle states:
 * 1. Pending (unclaimed): info banner + "Claim action" button + metadata
 * 2. Claimed by current user: "Claimed by you" banner + Start/Unclaim + metadata
 * 3. Claimed/in-progress by another user: "[Name] is working…" banner + Unclaim (with confirmation) + metadata
 *
 * For direct-user actions or in_progress by the claiming user, renders children immediately.
 * Any group member can unclaim an action (even one claimed by another user) — a confirmation
 * dialog warns before releasing another user's claim.
 */
export function ClaimGate({
  action,
  tenantId,
  userEmail,
  onInteractionSuccess,
  onActionUpdated,
  children,
}: Readonly<ClaimGateProps>) {
  const queryClient = useQueryClient();
  const onInteractionSuccessRef = useRef(onInteractionSuccess);
  const onActionUpdatedRef = useRef(onActionUpdated);
  useEffect(() => {
    onInteractionSuccessRef.current = onInteractionSuccess;
    onActionUpdatedRef.current = onActionUpdated;
  });

  const invalidateAndUpdate = (updatedAction: WilActionItem) => {
    queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
    queryClient.invalidateQueries({ queryKey: ['wil-action-counts'] });
    onActionUpdatedRef.current?.(updatedAction);
    onInteractionSuccessRef.current?.();
  };

  const claimMutation = useMutation({
    mutationFn: () => postWilClaimAction({ tenantId, actionId: action.id }),
    onSuccess: invalidateAndUpdate,
  });

  const unclaimMutation = useMutation({
    mutationFn: () => postWilUnclaimAction({ tenantId, actionId: action.id }),
    onSuccess: invalidateAndUpdate,
  });

  const startMutation = useMutation({
    mutationFn: () => postWilStartAction({ tenantId, actionId: action.id }),
    onSuccess: invalidateAndUpdate,
  });

  // Direct-user actions bypass the claim gate entirely
  if (!isSharedActorType(action.actorType)) {
    return <>{children}</>;
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['wil-actions'] });
    queryClient.invalidateQueries({ queryKey: ['wil-action-counts'] });
    onActionUpdatedRef.current?.(null);
  }

  // In progress + current user is claimer: show claim bar + handler
  const isClaimingActor = action.claimedBy === userEmail;
  const actorLabel = action.actorType === 'role' ? 'role' : 'group';

  if (action.status === 'in_progress' && isClaimingActor) {
    return (
      <div className="flex flex-col gap-4.5">
        <InProgressByMeBar unclaimMutation={unclaimMutation} onRefresh={refresh} />
        {children}
      </div>
    );
  }

  if (action.status === 'pending') {
    return (
      <PendingClaimView action={action} actorLabel={actorLabel} claimMutation={claimMutation} onRefresh={refresh} />
    );
  }

  if (action.status === 'claimed' && isClaimingActor) {
    return (
      <ClaimedByMeView
        action={action}
        actorLabel={actorLabel}
        startMutation={startMutation}
        unclaimMutation={unclaimMutation}
        onRefresh={refresh}
      />
    );
  }

  if ((action.status === 'claimed' || action.status === 'in_progress') && !isClaimingActor) {
    const displayName = formatDisplayName(action.claimedBy);
    return (
      <ClaimedByOtherView
        action={action}
        actorLabel={actorLabel}
        displayName={displayName}
        unclaimMutation={unclaimMutation}
        onRefresh={refresh}
      />
    );
  }

  // Fallback: render children (shouldn't normally reach here)
  return <>{children}</>;
}
