import { useQuery } from '@tanstack/react-query';
import { IconLoader2, IconBell } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getWilMessages } from '../../services/backend/wil';
import type { WilMessageItem } from '../../services/backend/wil';

function MessageStatusBadge({ status }: Readonly<{ status: WilMessageItem['status'] }>) {
  if (status === 'active') {
    return <Badge className="gap-1 bg-[var(--bc-blue)] text-white">Active</Badge>;
  }
  return (
    <Badge variant="secondary" className="gap-1">
      Read
    </Badge>
  );
}

function MessageItem({ message }: Readonly<{ message: WilMessageItem }>) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <IconBell size={18} className="mt-0.5 shrink-0 text-[var(--bc-muted)]" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-[var(--bc-text)] truncate">{message.title}</span>
            <MessageStatusBadge status={message.status} />
          </div>
          <p className="text-sm text-[var(--bc-muted)] line-clamp-2">{message.body}</p>
          <p className="text-xs text-[var(--bc-muted)]">{new Date(message.createdAt).toLocaleString()}</p>
        </div>
      </CardContent>
    </Card>
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
        <AlertDescription>
          {messagesQuery.error instanceof Error ? messagesQuery.error.message : 'An error occurred'}
        </AlertDescription>
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
