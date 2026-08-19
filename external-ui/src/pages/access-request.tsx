import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { createAccessRequest, getMyAccessRequest } from '../services/backend/access-requests';
import { getStoredAppToken } from '../services/backend/axios';
import { useAuthUser, useSessionLoading } from '../state/session';
import { AccessRequestStatusBadge } from '../components/access-request-status-badge';
import type { AccessRequestListItem } from '../services/backend/access-requests';
import { toast } from '../hooks/use-toasts';
import { IconSend, IconPlus, IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/patterns/page-header';

const JUSTIFICATION_MIN_LENGTH = 10;

function SuccessState({ email }: { email: string }) {
  return (
    <div className="flex items-center justify-center px-4 py-16 sm:py-24">
      <div className="w-full max-w-[600px] rounded-[16px] border-2 border-dashed border-[var(--ds-color-success)] bg-white px-8 py-10 text-center sm:px-12 sm:py-14">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#eaf4eb]">
          <IconCircleCheck size={28} className="text-[var(--ds-color-success)]" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold text-[var(--ds-color-success)]">Request Submitted</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Your access request has been received. An administrator will review it and respond to {email} within 2
          business days.
        </p>
        <div className="mt-8">
          <Button asChild>
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExistingRequestCard({ request, onNewRequest }: { request: AccessRequestListItem; onNewRequest: () => void }) {
  const isPending = request.status === 'pending';
  const statusLabel = isPending
    ? 'Access Request Pending'
    : `Access Request ${request.status === 'approved' ? 'Approved' : 'Denied'}`;
  const description = isPending
    ? 'Your request is being reviewed by an administrator.'
    : request.status === 'approved'
      ? 'Your request has been approved. You can now access n8n workflows.'
      : 'Your request was not approved.';
  const reviewedDate = isPending ? request.createdAt : request.updatedAt;

  return (
    <div className="w-full max-w-[680px] rounded-[12px] border border-border bg-white px-6 py-5 shadow-card sm:px-8 sm:py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-semibold text-foreground">{statusLabel}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <AccessRequestStatusBadge status={request.status} />
      </div>

      {/* Details */}
      <div className="mt-5 space-y-4">
        <div className="space-y-1">
          <span className="text-[0.8125rem] font-medium text-muted-foreground">Justification</span>
          <p className="text-sm text-foreground">{request.justification}</p>
        </div>
        {request.denyReason && (
          <div className="space-y-1">
            <span className="text-[0.8125rem] font-medium text-muted-foreground">Reason</span>
            <p className="text-sm text-foreground">{request.denyReason}</p>
          </div>
        )}
        <div className="space-y-1">
          <span className="text-[0.8125rem] font-medium text-muted-foreground">
            {isPending ? 'Submitted' : 'Reviewed'}
          </span>
          <p className="text-sm text-foreground">{new Date(reviewedDate).toLocaleDateString()}</p>
        </div>
        {!isPending && (
          <div className="pt-2">
            <Button type="button" onClick={onNewRequest} variant="outline" size="sm">
              <IconPlus size={16} aria-hidden="true" />
              New Request
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function NewRequestForm({
  justification,
  onJustificationChange,
  onSubmit,
  onCancel,
  isPending,
  showCancel,
}: {
  justification: string;
  onJustificationChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel?: () => void;
  isPending: boolean;
  showCancel: boolean;
}) {
  return (
    <div className="w-full max-w-[680px] rounded-[12px] border border-border bg-white px-6 py-5 shadow-card sm:px-8 sm:py-6">
      <h2 className="text-lg font-semibold text-foreground">New Access Request</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Describe your role and why you need access to the workflow system.
      </p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="justification" className="text-sm font-medium">
            Justification <span className="text-[var(--ds-color-danger)]">*</span>
          </Label>
          <Textarea
            id="justification"
            value={justification}
            onChange={(event) => onJustificationChange(event.target.value)}
            placeholder='e.g. "I am a data analyst on the SDG project and need access to monitor the nightly ETL pipeline workflows."'
            rows={5}
            required
            minLength={JUSTIFICATION_MIN_LENGTH}
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">
            Minimum {JUSTIFICATION_MIN_LENGTH} characters. Be specific about your role and the workflows you need to
            access.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
          <Button type="submit" disabled={isPending || !justification.trim()}>
            <IconSend size={16} aria-hidden="true" />
            {isPending ? 'Submitting...' : 'Submit Request'}
          </Button>
          {showCancel && onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

export function AccessRequest() {
  const user = useAuthUser();
  const authLoading = useSessionLoading();
  const queryClient = useQueryClient();
  const [justification, setJustification] = useState('');
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const redirectError = new URLSearchParams(globalThis.location.search).get('error');

  const hasToken = Boolean(getStoredAppToken());
  const canQueryMyRequest = !authLoading && (Boolean(user) || hasToken);

  const myRequestQuery = useQuery({
    queryKey: ['access-requests', 'my', user?.email ?? ''],
    queryFn: ({ signal }) => getMyAccessRequest({ signal }),
    enabled: canQueryMyRequest,
  });

  const createMutation = useMutation({
    mutationFn: ({ justification }: { justification: string }) => createAccessRequest(justification),
    onSuccess: async () => {
      setJustification('');
      setShowNewRequest(false);
      setShowSuccess(true);
      toast.success('Access request submitted successfully.');
      await queryClient.invalidateQueries({ queryKey: ['access-requests', 'my', user?.email ?? ''] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit access request.');
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!justification.trim()) return;
    createMutation.mutate({ justification: justification.trim() });
  }

  const myRequest = myRequestQuery.data?.accessRequest;
  const showForm = !myRequestQuery.isLoading && (!myRequest || showNewRequest);

  if (showSuccess) {
    return (
      <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-muted">
        <SuccessState email={user?.email ?? ''} />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-muted">
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="Request Access"
            description="Submit a request for access to n8n workflow management. An administrator will review and respond within 2 business days."
          />

          {redirectError && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-800">
              <IconAlertTriangle size={16} aria-hidden="true" />
              <AlertTitle>Attention</AlertTitle>
              <AlertDescription>{redirectError}</AlertDescription>
            </Alert>
          )}

          {myRequestQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

          {!myRequestQuery.isLoading && myRequest && !showNewRequest && (
            <ExistingRequestCard request={myRequest} onNewRequest={() => setShowNewRequest(true)} />
          )}

          {showForm && (
            <NewRequestForm
              justification={justification}
              onJustificationChange={setJustification}
              onSubmit={handleSubmit}
              onCancel={myRequest ? () => setShowNewRequest(false) : undefined}
              isPending={createMutation.isPending}
              showCancel={Boolean(myRequest)}
            />
          )}
        </div>
      </PageContainer>
    </div>
  );
}
