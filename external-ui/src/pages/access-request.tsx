import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { createAccessRequest, getMyAccessRequest } from '../services/backend/access-requests';
import { getStoredAppToken } from '../services/backend/axios';
import { AccessRequestStatusBadge } from '../components/access-request-status-badge';
import type { AccessRequestListItem } from '../services/backend/access-requests';
import { IconSend, IconPlus, IconAlertTriangle } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const JUSTIFICATION_MIN_LENGTH = 10;

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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{statusLabel}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <AccessRequestStatusBadge status={request.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Justification</Label>
          <p className="text-sm text-[var(--bc-muted)]">{request.justification}</p>
        </div>
        {request.denyReason && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Reason</Label>
            <p className="text-sm text-[var(--bc-muted)]">{request.denyReason}</p>
          </div>
        )}
        <div className="space-y-2">
          <Label className="text-sm font-medium">{isPending ? 'Submitted' : 'Reviewed'}</Label>
          <p className="text-sm text-[var(--bc-muted)]">{new Date(reviewedDate).toLocaleDateString()}</p>
        </div>
        {!isPending && (
          <Button type="button" onClick={onNewRequest} variant="outline">
            <IconPlus size={16} aria-hidden="true" />
            New Request
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function NewRequestForm({
  justification,
  onJustificationChange,
  onSubmit,
  mutation,
}: {
  justification: string;
  onJustificationChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  mutation: { isPending: boolean; isSuccess: boolean; error: Error | null; reset: () => void };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">New Access Request</CardTitle>
        <CardDescription>Please provide a justification for why you need access.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="justification">Justification</Label>
            <Textarea
              id="justification"
              value={justification}
              onChange={(event) => onJustificationChange(event.target.value)}
              placeholder="Explain why you need access to the workflow system..."
              rows={4}
              required
              minLength={JUSTIFICATION_MIN_LENGTH}
            />
            <p className="text-xs text-[var(--bc-muted)]">
              Please provide at least {JUSTIFICATION_MIN_LENGTH} characters explaining why you need access.
            </p>
          </div>

          {mutation.error instanceof Error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          )}

          {mutation.isSuccess && (
            <Alert className="border-green-600 bg-green-50 text-green-800">
              <AlertTitle>Request Submitted</AlertTitle>
              <AlertDescription>Your access request has been submitted successfully.</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={mutation.isPending || !justification.trim()}>
            <IconSend size={16} aria-hidden="true" />
            {mutation.isPending ? 'Submitting...' : 'Submit Request'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function AccessRequest() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [justification, setJustification] = useState('');
  const [showNewRequest, setShowNewRequest] = useState(false);
  const redirectError = new URLSearchParams(window.location.search).get('error');

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
      await queryClient.invalidateQueries({ queryKey: ['access-requests', 'my', user?.email ?? ''] });
    },
  });

  useEffect(() => {
    if (createMutation.isSuccess) {
      const timer = setTimeout(() => createMutation.reset(), 5000);
      return () => clearTimeout(timer);
    }
  }, [createMutation.isSuccess, createMutation]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!justification.trim()) return;
    createMutation.mutate({ justification: justification.trim() });
  }

  const myRequest = myRequestQuery.data?.accessRequest;
  const showForm = !myRequestQuery.isLoading && (!myRequest || showNewRequest);

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
      <section className="max-w-6xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">Request Access</h1>
          <p className="max-w-4xl text-base text-[var(--bc-muted)]">
            Request access to n8n workflow management. An administrator will review your request.
          </p>
        </div>

        {redirectError && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-800">
            <IconAlertTriangle size={16} aria-hidden="true" />
            <AlertTitle>Attention</AlertTitle>
            <AlertDescription>{redirectError}</AlertDescription>
          </Alert>
        )}

        {myRequestQuery.isLoading && <p className="text-sm text-[var(--bc-muted)]">Loading...</p>}

        {!myRequestQuery.isLoading && myRequest && !showNewRequest && (
          <ExistingRequestCard request={myRequest} onNewRequest={() => setShowNewRequest(true)} />
        )}

        {showForm && (
          <NewRequestForm
            justification={justification}
            onJustificationChange={setJustification}
            onSubmit={handleSubmit}
            mutation={createMutation}
          />
        )}
      </section>
    </div>
  );
}
