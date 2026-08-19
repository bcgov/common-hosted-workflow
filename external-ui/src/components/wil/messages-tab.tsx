import { IconLoader2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getWilMessages } from '../../services/backend/wil';
import type { WilMessageItem } from '../../services/backend/wil';
import { extractErrorMessage } from '../shared/error-utils';
import { useInfiniteList } from '../../hooks/use-infinite-list';

function formatMessageDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function MessageItem({ message }: Readonly<{ message: WilMessageItem }>) {
  const isUnread = message.status === 'active';

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[#c6c5c3] bg-white px-4 py-4 md:py-3.5">
      {/* Status dot */}
      <div className="mt-1.5 shrink-0 w-2.5">
        <span
          className={`block size-2.5 rounded-full md:size-2 ${isUnread ? 'bg-[#2563eb]' : 'bg-[#c6c5c3]'}`}
          aria-label={isUnread ? 'Unread' : 'Read'}
        />
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1 space-y-1.5 md:space-y-1">
        <p className="text-sm font-bold text-foreground leading-snug break-words">{message.title}</p>
        <p className="text-[13px] text-[#474543] line-clamp-2 md:line-clamp-1 leading-relaxed">{message.body}</p>
        <p className="text-xs text-[#9f9d9c]">{formatMessageDate(message.createdAt)}</p>
      </div>
    </div>
  );
}

interface MessagesTabProps {
  tenantId: string;
  since: string | undefined;
}

export function MessagesTab({ tenantId, since }: Readonly<MessagesTabProps>) {
  const { items, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, error } = useInfiniteList<WilMessageItem>({
    queryKey: ['wil-messages', tenantId, since],
    queryFn: ({ cursor, signal }) => getWilMessages({ tenantId, since: cursor ?? since, signal }),
    enabled: Boolean(tenantId),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--bc-muted)]">
        <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
        Loading messages...
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading messages</AlertTitle>
        <AlertDescription>{extractErrorMessage(error, 'An error occurred')}</AlertDescription>
      </Alert>
    );
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--bc-muted)]">No messages found.</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      {hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="lg"
            className="w-full md:w-auto"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
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
        <p className="pt-2 text-center text-xs text-[var(--bc-muted)]">All messages loaded.</p>
      )}
    </div>
  );
}
