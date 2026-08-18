import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { login } from '../auth/session-actions';
import { listAccessRequests, reviewAccessRequest } from '../services/backend/access-requests';
import type { AccessRequestListItem } from '../services/backend/access-requests';
import { AccessRequestStatusBadge } from '../components/access-request-status-badge';
import { useAuthUser, useSession } from '../state/session';
import { toast } from '../hooks/use-toasts';
import { IconLogin2, IconCheck, IconX, IconChevronLeft, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
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
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/patterns/page-header';

const DENY_REASON_MIN_LENGTH = 10;
const PAGE_SIZE = 25;

type StatusFilter = 'pending' | 'approved' | 'denied' | '';

function DenyDialog({
  request,
  denyReason,
  onDenyReasonChange,
  onConfirm,
  onOpenChange,
  isPending,
}: {
  request: AccessRequestListItem | null;
  denyReason: string;
  onDenyReasonChange: (value: string) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
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
            <p className="text-sm text-muted-foreground">{request?.justification}</p>
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
            <p className="text-xs text-muted-foreground">
              Please provide at least {DENY_REASON_MIN_LENGTH} characters.
            </p>
          </div>

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

function RequestCard({
  request,
  onApprove,
  onDeny,
  isPending,
}: {
  request: AccessRequestListItem;
  onApprove: (request: AccessRequestListItem) => void;
  onDeny: (request: AccessRequestListItem) => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-border bg-white px-5 py-4">
      {/* Header: Email + Status Badge */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-foreground">{request.requesterEmail}</h3>
          <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
            Submitted {new Date(request.createdAt).toLocaleDateString()}
          </p>
        </div>
        <AccessRequestStatusBadge status={request.status} />
      </div>

      {/* Justification */}
      <div className="mt-3">
        <span className="text-[0.8125rem] font-medium text-muted-foreground">Justification</span>
        <p className="mt-1 text-sm text-foreground">{request.justification}</p>
      </div>

      {/* Reviewer info or Actions */}
      {request.status === 'pending' ? (
        <div className="mt-4 flex flex-col items-end gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => onApprove(request)}
            disabled={isPending}
            className="w-full bg-[var(--ds-color-success)] text-white hover:bg-[#357039] sm:w-auto"
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
            className="w-full sm:w-auto"
          >
            <IconX size={14} aria-hidden="true" />
            Deny
          </Button>
        </div>
      ) : request.reviewerEmail ? (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[0.8125rem] font-medium text-muted-foreground">Reviewed by</span>
          <span className="text-[0.8125rem] text-foreground">{request.reviewerEmail}</span>
        </div>
      ) : null}

      {/* Deny reason if denied */}
      {request.status === 'denied' && request.denyReason && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[0.8125rem] font-medium text-muted-foreground">Reason</span>
          <span className="text-[0.8125rem] text-foreground">{request.denyReason}</span>
        </div>
      )}
    </div>
  );
}

function AccessRequestsListView({
  onApprove,
  onDeny,
  isReviewPending,
}: {
  onApprove: (request: AccessRequestListItem) => void;
  onDeny: (request: AccessRequestListItem) => void;
  isReviewPending: boolean;
}) {
  const user = useAuthUser();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const offset = (currentPage - 1) * PAGE_SIZE;

  const listQuery = useQuery({
    queryKey: ['access-requests', 'admin', user?.email ?? '', statusFilter, currentPage],
    queryFn: ({ signal }) => listAccessRequests({ status: statusFilter, limit: PAGE_SIZE, offset }, { signal }),
    enabled: Boolean(user),
  });

  const requests = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (!listQuery.isLoading && total > 0 && requests.length === 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, listQuery.isLoading, requests.length, total, totalPages]);

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests;
    const lower = searchQuery.toLowerCase();
    return requests.filter(
      (r) => r.requesterEmail.toLowerCase().includes(lower) || r.justification.toLowerCase().includes(lower),
    );
  }, [requests, searchQuery]);

  const summaryText = useMemo(() => {
    const statusLabel = statusFilter || 'total';
    return `${total} ${statusLabel} request${total === 1 ? '' : 's'}`;
  }, [total, statusFilter]);

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value as StatusFilter);
    setCurrentPage(1);
  }

  if (listQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading access requests...</p>;
  }

  if (listQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading access requests</AlertTitle>
        <AlertDescription>
          {listQuery.error instanceof Error ? listQuery.error.message : 'Could not load access requests'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search and Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by email or justification..."
            className="pl-9"
            aria-label="Search access requests"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
          className="h-10 rounded-control border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-border-strong"
          aria-label="Filter by status"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
          <option value="">All</option>
        </select>
      </div>

      {/* Summary Count */}
      <p className="text-[0.8125rem] text-muted-foreground">{summaryText}</p>

      {/* Request Cards */}
      {filteredRequests.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No {statusFilter ? statusFilter : ''} access requests found.
        </p>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onApprove={onApprove}
              onDeny={onDeny}
              isPending={isReviewPending}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages} ({total} requests)
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage <= 1}
            >
              <IconChevronLeft size={16} aria-hidden="true" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage >= totalPages}
            >
              Next
              <IconChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AccessRequests() {
  const user = useAuthUser();
  const session = useSession();
  const queryClient = useQueryClient();
  const [reviewingRequest, setReviewingRequest] = useState<AccessRequestListItem | null>(null);
  const [denyReason, setDenyReason] = useState('');

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
    onSuccess: async (_data, variables) => {
      setReviewingRequest(null);
      setDenyReason('');
      toast.success(`Access request ${variables.action === 'approve' ? 'approved' : 'denied'} successfully.`);
      await queryClient.invalidateQueries({ queryKey: ['access-requests'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to review access request.');
    },
  });

  const isAdmin = session?.permissions.canReviewAccessRequests ?? false;

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

  return (
    <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-muted">
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="Review Requests"
            description="Review and manage access requests from users requesting n8n workflow access."
          />

          {!user && (
            <Alert>
              <AlertTitle>Sign in required</AlertTitle>
              <AlertDescription>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <p className="text-sm text-muted-foreground">Sign in to view access requests.</p>
                  <Button onClick={login}>
                    <IconLogin2 size={16} aria-hidden="true" />
                    Sign In
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {user && !isAdmin && (
            <Alert>
              <AlertTitle>Admin access required</AlertTitle>
              <AlertDescription>You need admin privileges to view access requests.</AlertDescription>
            </Alert>
          )}

          {user && isAdmin && (
            <AccessRequestsListView
              onApprove={handleApprove}
              onDeny={handleDeny}
              isReviewPending={reviewMutation.isPending}
            />
          )}
        </div>
      </PageContainer>

      <DenyDialog
        request={reviewingRequest}
        denyReason={denyReason}
        onDenyReasonChange={setDenyReason}
        onConfirm={confirmDeny}
        onOpenChange={handleDenyDialogOpenChange}
        isPending={reviewMutation.isPending}
      />
    </div>
  );
}
