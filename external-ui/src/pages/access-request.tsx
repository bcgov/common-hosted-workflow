import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { createAccessRequest, getMyAccessRequest } from '../services/backend/access-requests';
import { getStoredAppToken } from '../services/backend/axios';
import { AccessRequestStatusBadge } from '../components/access-request-status-badge';
import { IconSend, IconPlus, IconAlertTriangle } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const JUSTIFICATION_MIN_LENGTH = 10;

export function AccessRequest() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [justification, setJustification] = useState('');
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
      await queryClient.invalidateQueries({ queryKey: ['access-requests', 'my', user?.email ?? ''] });
    },
  });

  useEffect(() => {
    if (createMutation.isSuccess) {
      const timer = setTimeout(() => createMutation.reset(), 5000);
      return () => clearTimeout(timer);
    }
  }, [createMutation.isSuccess, createMutation]);

  const myRequest = myRequestQuery.data?.accessRequest;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!justification.trim()) return;
    createMutation.mutate({ justification: justification.trim() });
  }

  function handleNewRequest() {
    createMutation.reset();
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
      <section className="max-w-6xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">Request Access</h1>
          <p className="max-w-4xl text-base text-[var(--bc-muted)]">
            Request access to n8n workflow management. An administrator will review your request.
          </p>
        </div>

        {redirectError ? (
          <Alert className="border-amber-300 bg-amber-50 text-amber-800">
            <IconAlertTriangle size={16} aria-hidden="true" />
            <AlertTitle>Attention</AlertTitle>
            <AlertDescription>{redirectError}</AlertDescription>
          </Alert>
        ) : null}

        {myRequestQuery.isLoading ? (
          <p className="text-sm text-[var(--bc-muted)]">Loading...</p>
        ) : myRequest ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-lg">
                    {myRequest.status === 'pending'
                      ? 'Access Request Pending'
                      : `Access Request ${myRequest.status === 'approved' ? 'Approved' : 'Denied'}`}
                  </CardTitle>
                  <CardDescription>
                    {myRequest.status === 'pending'
                      ? 'Your request is being reviewed by an administrator.'
                      : myRequest.status === 'approved'
                        ? 'Your request has been approved. You can now access n8n workflows.'
                        : 'Your request was not approved.'}
                  </CardDescription>
                </div>
                <AccessRequestStatusBadge status={myRequest.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Submitted</Label>
                <p className="text-sm text-[var(--bc-muted)]">{new Date(myRequest.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Justification</Label>
                <p className="text-sm text-[var(--bc-muted)]">{myRequest.justification}</p>
              </div>
              {myRequest.denyReason && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Reason</Label>
                  <p className="text-sm text-[var(--bc-muted)]">{myRequest.denyReason}</p>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {myRequest.status === 'pending' ? 'Submitted' : 'Reviewed'}
                </Label>
                <p className="text-sm text-[var(--bc-muted)]">
                  {new Date(
                    myRequest.status === 'pending' ? myRequest.createdAt : myRequest.updatedAt,
                  ).toLocaleDateString()}
                </p>
              </div>
              {myRequest.status !== 'pending' && (
                <Button type="button" onClick={handleNewRequest} variant="outline">
                  <IconPlus size={16} aria-hidden="true" />
                  New Request
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">New Access Request</CardTitle>
              <CardDescription>Please provide a justification for why you need access.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="justification">Justification</Label>
                  <Textarea
                    id="justification"
                    value={justification}
                    onChange={(event) => setJustification(event.target.value)}
                    placeholder="Explain why you need access to the workflow system..."
                    rows={4}
                    required
                    minLength={JUSTIFICATION_MIN_LENGTH}
                  />
                  <p className="text-xs text-[var(--bc-muted)]">
                    Please provide at least {JUSTIFICATION_MIN_LENGTH} characters explaining why you need access.
                  </p>
                </div>

                {createMutation.error instanceof Error ? (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{createMutation.error.message}</AlertDescription>
                  </Alert>
                ) : null}

                {createMutation.isSuccess ? (
                  <Alert className="border-green-600 bg-green-50 text-green-800">
                    <AlertTitle>Request Submitted</AlertTitle>
                    <AlertDescription>Your access request has been submitted successfully.</AlertDescription>
                  </Alert>
                ) : null}

                <Button type="submit" disabled={createMutation.isPending || !justification.trim()}>
                  <IconSend size={16} aria-hidden="true" />
                  {createMutation.isPending ? 'Submitting...' : 'Submit Request'}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
