import { IconLoader2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getWilActions } from '../../services/backend/wil';
import type { WilActionItem } from '../../services/backend/wil';
import { ActionItem } from './action-item';
import { extractErrorMessage } from '../shared/error-utils';
import { useInfiniteList } from '../../hooks/use-infinite-list';

interface ActionsTabProps {
  tenantId: string;
  since: string | undefined;
  statusFilter: string[];
  selectedAction: WilActionItem | null;
  onSelectAction: (action: WilActionItem) => void;
}

export function ActionsTab({
  tenantId,
  since,
  statusFilter,
  selectedAction,
  onSelectAction,
}: Readonly<ActionsTabProps>) {
  const { items, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, error } = useInfiniteList<WilActionItem>({
    queryKey: ['wil-actions', tenantId, since, statusFilter],
    queryFn: ({ cursor, signal }) => getWilActions({ tenantId, since: cursor ?? since, status: statusFilter, signal }),
    enabled: Boolean(tenantId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
        Loading actions...
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading actions</AlertTitle>
        <AlertDescription>{extractErrorMessage(error, 'An error occurred')}</AlertDescription>
      </Alert>
    );
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No actions found.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((action) => (
        <ActionItem
          key={action.id}
          action={action}
          isSelected={selectedAction?.id === action.id}
          onClick={() => onSelectAction(action)}
        />
      ))}
      {hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? (
              <span className="flex items-center gap-2">
                <IconLoader2 size={14} className="animate-spin" aria-hidden="true" />
                Loading...
              </span>
            ) : (
              'Load More'
            )}
          </Button>
        </div>
      ) : (
        <p className="pt-2 text-center text-xs text-muted-foreground">All actions loaded.</p>
      )}
    </div>
  );
}
