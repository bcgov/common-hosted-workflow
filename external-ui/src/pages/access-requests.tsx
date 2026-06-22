import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { login } from '../auth/session-actions';
import { listAccessRequests, reviewAccessRequest } from '../services/backend/access-requests';
import type { AccessRequestListItem } from '../services/backend/access-requests';
import { AccessRequestStatusBadge } from '../components/access-request-status-badge';
import { useAuthUser, useSession } from '../state/session';
import { IconLogin2, IconCheck, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

const DENY_REASON_MIN_LENGTH = 10;
const PAGE_SIZE = 50;

function DenyDialog({
  request,
  denyReason,
  onDenyReasonChange,
  onConfirm,
  onOpenChange,
  isPending,
  error,
}: {
  request: AccessRequestListItem | null;
  denyReason: string;
  onDenyReasonChange: (value: string) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  error: Error | null;
}) {
  return (
    <Dialog open={Boolean(request)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deny Access Request</DialogTitle>
          <DialogDescription>Please provide a reason for denying this access request.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Requester</Label>
            <p className="text-sm">{request?.requesterEmail}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Justification</Label>
            <p className="text-sm text-[var(--bc-muted)]">{request?.justification}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deny-reason">Denial Reason</Label>
            <Textarea
              id="deny-reason"
              value={denyReason}
              onChange={(event) => onDenyReasonChange(event.target.value)}
              placeholder="Explain why this request is being denied..."
              rows={3}
              required
              minLength={DENY_REASON_MIN_LENGTH}
            />
            <p className="text-xs text-[var(--bc-muted)]">
              Please provide at least {DENY_REASON_MIN_LENGTH} characters.
            </p>
          </div>

          {error instanceof Error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" onClick={() => onOpenChange(false)} variant="outline">
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending || !denyReason.trim()}>
              <IconX size={16} aria-hidden="true" />
              {isPending ? 'Denying...' : 'Deny Request'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RequestTable({
  requests,
  statusFilter,
  onStatusFilterChange,
  total,
  onApprove,
  onDeny,
  isPending,
}: {
  requests: AccessRequestListItem[];
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  total: number;
  onApprove: (request: AccessRequestListItem) => void;
  onDeny: (request: AccessRequestListItem) => void;
  isPending: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label htmlFor="status-filter" className="text-sm font-medium">
          Filter by status:
        </Label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value)}
          className="rounded-md border border-[var(--bc-border)] bg-[var(--bc-card)] px-3 py-2 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
          <option value="">All</option>
        </select>
        <span className="text-sm text-[var(--bc-muted)]">
          {total} request{total === 1 ? '' : 's'}
        </span>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-[var(--bc-muted)]">
            No {statusFilter ? statusFilter : ''} access requests found.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="w-full rounded-md">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--bc-surface)] hover:bg-[var(--bc-surface)]">
                    <TableHead>Email</TableHead>
                    <TableHead>Justification</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-mono text-xs">{request.requesterEmail}</TableCell>
                      <TableCell>
                        <p className="line-clamp-2 max-w-md text-sm">{request.justification}</p>
                      </TableCell>
                      <TableCell>
                        <AccessRequestStatusBadge status={request.status} />
                      </TableCell>
                      <TableCell className="text-sm text-[var(--bc-muted)]">
                        {new Date(request.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {request.status === 'pending' ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => onApprove(request)}
                              disabled={isPending}
                              className="bg-green-600 text-white hover:bg-green-700"
                            >
                              <IconCheck size={14} aria-hidden="true" />
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => onDeny(request)}
                              disabled={isPending}
                            >
                              <IconX size={14} aria-hidden="true" />
                              Deny
                            </Button>
                          </div>
                        ) : request.reviewerEmail ? (
                          <span className="text-xs text-[var(--bc-muted)]">by {request.reviewerEmail}</span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function AccessRequests() {
  const user = useAuthUser();
  const session = useSession();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [reviewingRequest, setReviewingRequest] = useState<AccessRequestListItem | null>(null);
  const [denyReason, setDenyReason] = useState('');

  const listQuery = useQuery({
    queryKey: ['access-requests', 'admin', user?.email ?? '', statusFilter],
    queryFn: ({ signal }) => listAccessRequests({ status: statusFilter, limit: PAGE_SIZE }, { signal }),
    enabled: Boolean(user) && Boolean(session?.permissions.canReviewAccessRequests),
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      accessRequestId,
      action,
      denyReason,
    }: {
      accessRequestId: string;
      action: 'approve' | 'deny';
      denyReason?: string;
    }) => reviewAccessRequest(accessRequestId, action, denyReason),
    onSuccess: async () => {
      setReviewingRequest(null);
      setDenyReason('');
      await queryClient.invalidateQueries({ queryKey: ['access-requests'] });
    },
  });

  const isAdmin = session?.permissions.canReviewAccessRequests ?? false;
  const requests = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  function handleApprove(request: AccessRequestListItem) {
    reviewMutation.mutate({ accessRequestId: request.id, action: 'approve' });
  }

  function handleDeny(request: AccessRequestListItem) {
    setReviewingRequest(request);
    setDenyReason('');
  }

  function confirmDeny() {
    if (!reviewingRequest || !denyReason.trim()) return;
    reviewMutation.mutate({
      accessRequestId: reviewingRequest.id,
      action: 'deny',
      denyReason: denyReason.trim(),
    });
  }

  function handleDenyDialogOpenChange(open: boolean) {
    if (!open) {
      setReviewingRequest(null);
      setDenyReason('');
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
        <section className="max-w-6xl space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">Access Requests</h1>
          </div>
          <Alert>
            <AlertTitle>Sign in required</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <p className="text-sm text-[var(--bc-muted)]">Sign in to view access requests.</p>
                <Button onClick={login}>
                  <IconLogin2 size={16} aria-hidden="true" />
                  Sign In
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </section>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
        <section className="max-w-6xl space-y-6">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">Access Requests</h1>
          </div>
          <Alert>
            <AlertTitle>Admin access required</AlertTitle>
            <AlertDescription>You need admin privileges to view access requests.</AlertDescription>
          </Alert>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
      <section className="max-w-6xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">Access Requests</h1>
          <p className="max-w-4xl text-base text-[var(--bc-muted)]">
            Review and manage access requests from users requesting n8n workflow access.
          </p>
        </div>

        {listQuery.isLoading && <p className="text-sm text-[var(--bc-muted)]">Loading...</p>}

        {listQuery.error instanceof Error && (
          <Alert variant="destructive">
            <AlertTitle>Error loading access requests</AlertTitle>
            <AlertDescription>{listQuery.error.message}</AlertDescription>
          </Alert>
        )}

        {!listQuery.isLoading && !listQuery.error && (
          <RequestTable
            requests={requests}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            total={total}
            onApprove={handleApprove}
            onDeny={handleDeny}
            isPending={reviewMutation.isPending}
          />
        )}
      </section>

      <DenyDialog
        request={reviewingRequest}
        denyReason={denyReason}
        onDenyReasonChange={setDenyReason}
        onConfirm={confirmDeny}
        onOpenChange={handleDenyDialogOpenChange}
        isPending={reviewMutation.isPending}
        error={reviewMutation.error}
      />
    </div>
  );
}
