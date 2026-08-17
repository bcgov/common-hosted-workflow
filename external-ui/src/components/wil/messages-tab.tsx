import { useQuery } from '@tanstack/react-query';
import { IconLoader2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getWilMessages } from '../../services/backend/wil';
import type { WilMessageItem } from '../../services/backend/wil';
import { extractErrorMessage } from '../shared/error-utils';

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
    <div className="flex items-start gap-3 rounded-lg border border-[#c6c5c3] bg-white px-4 py-3.5">
      {/* Status dot */}
      <div className="mt-1.5 shrink-0 w-2.5">
        <span
          className={`block size-2 rounded-full ${isUnread ? 'bg-[#2563eb]' : 'bg-[#c6c5c3]'}`}
          aria-label={isUnread ? 'Unread' : 'Read'}
        />
      </div>

      {/* Text content */}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-bold text-foreground truncate">{message.title}</p>
        <p className="text-[13px] text-[#474543] line-clamp-1">{message.body}</p>
        <p className="text-xs text-[#9f9d9c]">{formatMessageDate(message.createdAt)}</p>
      </div>
    </div>
  );
}

interface MessagesTabProps {
  tenantId: string;
  since: string | undefined;
  cursor: string | null;
  onLoadMore: (nextCursor: string) => void;
}

export function MessagesTab({ tenantId, since, cursor, onLoadMore }: Readonly<MessagesTabProps>) {
  const sinceParam = cursor ?? since;

  const messagesQuery = useQuery({
    queryKey: ['wil-messages', tenantId, sinceParam],
    queryFn: ({ signal }) => getWilMessages({ tenantId, since: sinceParam, signal }),
    enabled: Boolean(tenantId),
  });

  if (messagesQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-[var(--bc-muted)]">
        <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />
        Loading messages...
      </div>
    );
  }

  if (messagesQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading messages</AlertTitle>
        <AlertDescription>{extractErrorMessage(messagesQuery.error, 'An error occurred')}</AlertDescription>
      </Alert>
    );
  }

  const data = messagesQuery.data;
  if (!data || data.data.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--bc-muted)]">No messages found.</p>;
  }

  const { nextCursor } = data;

  return (
    <div className="space-y-3">
      {data.data.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      {nextCursor ? (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={() => onLoadMore(nextCursor)}>
            Load More
          </Button>
        </div>
      ) : (
        <p className="pt-2 text-center text-xs text-[var(--bc-muted)]">All messages loaded.</p>
      )}
    </div>
  );
}
