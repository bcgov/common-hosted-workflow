import type { WilActionItem } from '../services/backend/wil';
import { GetApprovalHandler } from './action-handlers/get-approval-handler';
import { ShowFormHandler } from './action-handlers/show-form-handler';
import { WaitOnEventHandler } from './action-handlers/wait-on-event-handler';
import { CompletedActionView } from './action-handlers/completed-action-view';
import { ClaimGate } from './action-handlers/claim-gate';
import { Badge } from '@/components/ui/badge';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useAuthUser } from '../state/session';

const TERMINAL_STATUSES: ReadonlySet<WilActionItem['status']> = new Set([
  'completed',
  'cancelled',
  'expired',
  'deleted',
]);

function isTerminalStatus(status: WilActionItem['status']): boolean {
  return TERMINAL_STATUSES.has(status);
}

function Placeholder() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-[var(--bc-muted)]">
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-30"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 9h6" />
        <path d="M9 13h4" />
      </svg>
      <p>Select an action from the list to view details.</p>
    </div>
  );
}

function UnsupportedAction({ action }: Readonly<{ action: WilActionItem }>) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-sm text-[var(--bc-muted)]">
      <IconAlertTriangle size={24} className="text-amber-500" aria-hidden="true" />
      <p className="font-medium text-[var(--bc-text)]">Unsupported action type</p>
      <Badge variant="outline">{action.actionType}</Badge>
      <p>This action type is not yet supported.</p>
    </div>
  );
}

interface ActionDetailPaneProps {
  action: WilActionItem | null;
  tenantId: string;
  onInteractionSuccess?: () => void;
}

export function ActionDetailPane({ action, tenantId, onInteractionSuccess }: Readonly<ActionDetailPaneProps>) {
  const user = useAuthUser();
  const userEmail = user?.email ?? '';

  if (!action) return <Placeholder />;
  if (isTerminalStatus(action.status)) return <CompletedActionView action={action} />;

  const handler = renderActionHandler(action, tenantId, onInteractionSuccess);

  return (
    <ClaimGate action={action} tenantId={tenantId} userEmail={userEmail} onInteractionSuccess={onInteractionSuccess}>
      {handler}
    </ClaimGate>
  );
}

function renderActionHandler(
  action: WilActionItem,
  tenantId: string,
  onInteractionSuccess?: () => void,
): React.ReactNode {
  switch (action.actionType) {
    case 'getapproval':
      return <GetApprovalHandler action={action} tenantId={tenantId} onInteractionSuccess={onInteractionSuccess} />;
    case 'showform':
      return <ShowFormHandler action={action} tenantId={tenantId} onInteractionSuccess={onInteractionSuccess} />;
    case 'waitonevent':
      return <WaitOnEventHandler action={action} tenantId={tenantId} onInteractionSuccess={onInteractionSuccess} />;
    default:
      return <UnsupportedAction action={action} />;
  }
}
