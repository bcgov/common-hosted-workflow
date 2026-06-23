import { useQuery } from '@tanstack/react-query';
import { IconLoader2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getWilActions } from '../../services/backend/wil';
import type { WilActionItem } from '../../services/backend/wil';
import { ActionItem } from './action-item';
import { extractErrorMessage } from '../action-handlers/shared/error-utils';

interface ActionsTabProps {
  tenantId: string;
  since: string | undefined;
  statusFilter: string[];
  cursor: string | null;
  onLoadMore: (nextCursor: string) => void;
  selectedAction: WilActionItem | null;
  onSelectAction: (action: WilActionItem) => void;
}

export function ActionsTab({
  tenantId,
  since,
  statusFilter,
  cursor,
  onLoadMore,
  selectedAction,
  onSelectAction,
}: Readonly<ActionsTabProps>) {
  const sinceParam = cursor ?? since;

  const actionsQuery = useQuery({
    queryKey: ['wil-actions', tenantId, sinceParam, statusFilter],
    queryFn: ({ signal }) => getWilActions({ tenantId, since: sinceParam, status: statusFilter, signal }),
    enabled: Boolean(tenantId),
  });

  if (actionsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--bc-muted)]">
        <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
        Loading actions...
      </div>
    );
  }

  if (actionsQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading actions</AlertTitle>
        <AlertDescription>{extractErrorMessage(actionsQuery.error, 'An error occurred')}</AlertDescription>
      </Alert>
    );
  }

  const data = actionsQuery.data;
  if (!data || data.data.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--bc-muted)]">No actions found.</p>;
  }

  const { nextCursor } = data;

  return (
    <div className="space-y-3">
      {data.data.map((action) => (
        <ActionItem
          key={action.id}
          action={action}
          isSelected={selectedAction?.id === action.id}
          onClick={() => onSelectAction(action)}
        />
      ))}
      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => onLoadMore(nextCursor)}>
            Load More
          </Button>
        </div>
      ) : (
        <p className="pt-2 text-center text-xs text-[var(--bc-muted)]">All actions loaded.</p>
      )}
    </div>
  );
}
