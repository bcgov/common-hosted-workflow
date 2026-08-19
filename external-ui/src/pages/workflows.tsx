import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { IconArrowsRightLeft, IconInfoCircle } from '@tabler/icons-react';
import { getWorkflows, shareWorkflow, unshareWorkflow } from '../services/backend/workflows';
import { useAuthUser, usePermissions } from '../state/session';
import { login } from '../auth/session-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/patterns/page-header';
import { CopyField } from '@/components/patterns/copy-field';
import { EmptyState } from '@/components/patterns/empty-state';
import { SignedOutView } from '@/components/patterns/signed-out-view';

export function Workflows() {
  const user = useAuthUser();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [sharingWorkflowId, setSharingWorkflowId] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState('');

  const workflowsQuery = useQuery({
    queryKey: ['workflows', user?.email ?? ''],
    queryFn: ({ signal }) => getWorkflows({ signal }),
    enabled: Boolean(user),
  });

  const shareMutation = useMutation({
    mutationFn: ({ workflowId, email }: { workflowId: string; email: string }) => shareWorkflow(workflowId, email),
    onSuccess: async () => {
      setSharingWorkflowId(null);
      setShareEmail('');
      await queryClient.invalidateQueries({ queryKey: ['workflows', user?.email ?? ''] });
    },
  });

  const unshareMutation = useMutation({
    mutationFn: ({ workflowId, projectId }: { workflowId: string; projectId: string }) =>
      unshareWorkflow(workflowId, projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflows', user?.email ?? ''] });
    },
  });
  const unsharePending = unshareMutation.isPending ? unshareMutation.variables : null;
  const unshareError =
    unshareMutation.isError && unshareMutation.variables
      ? { ...unshareMutation.variables, message: unshareMutation.error.message }
      : null;

  const workflows = workflowsQuery.data ?? [];
  const canShareWorkflows = permissions?.canShareWorkflows ?? false;
  const canUnshareWorkflows = permissions?.canUnshareWorkflows ?? false;
  const workflowsError = workflowsQuery.error instanceof Error ? workflowsQuery.error.message : null;
  const sharingWorkflow = workflows.find((workflow) => workflow.workflowId === sharingWorkflowId) ?? null;

  function openShareDialog(workflowId: string) {
    setSharingWorkflowId(workflowId);
    setShareEmail('');
    shareMutation.reset();
  }

  function closeShareDialog() {
    setSharingWorkflowId(null);
    setShareEmail('');
    shareMutation.reset();
  }

  return (
    <div className="min-h-[calc(100svh-var(--ds-header-height)-var(--ds-footer-height))] bg-surface-subtle">
      <PageContainer className="space-y-[var(--ds-section-gap)]">
        <PageHeader
          title="Workflows"
          description="Workflows you can view in n8n, with the email addresses associated to each project share."
        />

        {!user ? (
          <SignedOutView onSignIn={login} />
        ) : workflowsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading workflows…</p>
        ) : workflowsError ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load workflows</AlertTitle>
            <AlertDescription>{workflowsError}</AlertDescription>
          </Alert>
        ) : workflows.length === 0 ? (
          <EmptyState
            icon={<IconArrowsRightLeft className="size-6" aria-hidden="true" />}
            title="No workflows found"
            description="Your account does not currently have access to any n8n workflows."
          />
        ) : (
          <div className="space-y-6">
            {workflows.map((workflow) => (
              <WorkflowCard
                key={workflow.workflowId}
                workflow={workflow}
                canShare={canShareWorkflows}
                canUnshare={canUnshareWorkflows}
                onShare={() => openShareDialog(workflow.workflowId)}
                onUnshareConfirm={(projectId) => unshareMutation.mutate({ workflowId: workflow.workflowId, projectId })}
                onUnshareCancel={() => unshareMutation.reset()}
                pendingProjectId={
                  unsharePending && unsharePending.workflowId === workflow.workflowId ? unsharePending.projectId : null
                }
                errorProjectId={
                  unshareError && unshareError.workflowId === workflow.workflowId ? unshareError.projectId : null
                }
                errorMessage={
                  unshareError && unshareError.workflowId === workflow.workflowId ? unshareError.message : null
                }
              />
            ))}
          </div>
        )}
      </PageContainer>

      {/* Share Dialog */}
      <Dialog
        open={Boolean(sharingWorkflow && canShareWorkflows)}
        onOpenChange={(open) => {
          if (!open) closeShareDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share workflow</DialogTitle>
            <DialogDescription>{sharingWorkflow?.workflowName}</DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2.5 rounded-lg border border-[#cfe0f5] bg-[#eff4fb] p-3">
            <IconInfoCircle className="mt-0.5 size-5 shrink-0 text-[#2563eb]" aria-hidden="true" />
            <p className="text-sm text-[#334155]">They will get access to view this workflow in n8n.</p>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!sharingWorkflow) return;
              shareMutation.mutate({ workflowId: sharingWorkflow.workflowId, email: shareEmail.trim() });
            }}
          >
            <div className="space-y-3">
              <Label htmlFor="share-email">Email</Label>
              <Input
                id="share-email"
                type="email"
                value={shareEmail}
                onChange={(event) => setShareEmail(event.target.value)}
                placeholder="person@example.com"
                autoFocus
              />
              <p className="text-[0.8125rem] text-muted-foreground">
                Enter a government email address to enable sharing. Example: person@example.com
              </p>
            </div>

            {shareMutation.error instanceof Error ? (
              <Alert variant="destructive">
                <AlertTitle>Share failed</AlertTitle>
                <AlertDescription>{shareMutation.error.message}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="gap-3">
              <Button type="button" onClick={closeShareDialog} variant="secondary" className="min-w-[122px]">
                Cancel
              </Button>
              <Button type="submit" disabled={shareMutation.isPending || !shareEmail.trim()} className="min-w-[122px]">
                {shareMutation.isPending ? 'Sharing…' : 'Share'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Workflow Card ─── */

interface WorkflowCardProps {
  workflow: {
    workflowId: string;
    workflowName: string;
    projectIds: string[];
    projectShares: Array<{ projectId: string; userEmails: string[] }>;
  };
  canShare: boolean;
  canUnshare: boolean;
  onShare: () => void;
  onUnshareConfirm: (projectId: string) => void;
  onUnshareCancel: () => void;
  pendingProjectId: string | null;
  errorProjectId: string | null;
  errorMessage: string | null;
}

function unshareConfirmationMessage(workflowName: string, projectShare: { projectId: string; userEmails: string[] }) {
  if (projectShare.userEmails.length <= 1) {
    const who = projectShare.userEmails[0] ?? 'all users';
    return `Remove ${who} from ${workflowName}? They will lose access to view it in n8n.`;
  }
  return `Remove access to ${workflowName} for project ${projectShare.projectId}? This will remove ${projectShare.userEmails.length} users: ${projectShare.userEmails.join(', ')}. They will lose access to view it in n8n.`;
}

function WorkflowCard({
  workflow,
  canShare,
  canUnshare,
  onShare,
  onUnshareConfirm,
  onUnshareCancel,
  pendingProjectId,
  errorProjectId,
  errorMessage,
}: Readonly<WorkflowCardProps>) {
  const [confirmProjectId, setConfirmProjectId] = useState<string | null>(null);
  const canRemoveProjects = workflow.projectShares.length > 1;

  function cancelConfirm() {
    setConfirmProjectId(null);
    onUnshareCancel();
  }

  return (
    <Card>
      <CardContent className="space-y-4 px-6 pt-5 pb-6 sm:px-6 sm:pt-5 sm:pb-6">
        {/* Header row: name + badge + share */}
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-lg font-bold leading-6 text-foreground">{workflow.workflowName}</h2>
          <Badge
            variant="secondary"
            className="rounded-control border-transparent bg-[#eef2f7] px-2.5 py-[5px] text-[0.8125rem] font-normal text-[#475569]"
          >
            {workflow.projectIds.length} project{workflow.projectIds.length === 1 ? '' : 's'}
          </Badge>
          {canShare ? (
            <Button type="button" size="sm" className="px-4 py-2 text-sm" onClick={onShare}>
              Share
            </Button>
          ) : null}
        </div>

        {/* Workflow ID */}
        <CopyField label="Workflow ID" value={workflow.workflowId} />

        {/* Shared access */}
        <div className="w-full">
          <p className="text-sm font-bold text-foreground">Shared access</p>
          <div className="flex gap-4 pt-3 pb-2.5 text-[0.8125rem] text-muted-foreground">
            <span className="w-[280px] shrink-0">Project</span>
            <span className="min-w-0 flex-1">User email</span>
            <span className="w-[120px] shrink-0 text-right sm:w-[300px]">Action</span>
          </div>
          <div className="border-t border-[#e2e8f0]" />

          {workflow.projectShares.map((projectShare) => (
            <div key={projectShare.projectId}>
              <div className="flex items-center gap-4 border-b border-[#f1f5f9] py-3.5">
                <span className="w-[280px] shrink-0 truncate text-[0.8125rem] text-muted-foreground">
                  {projectShare.projectId}
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {projectShare.userEmails.length > 0 ? (
                    projectShare.userEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center rounded-control border-[1.5px] border-[#cbd5e1] bg-white px-2.5 py-[5px] text-[0.8125rem] text-[#334155]"
                      >
                        {email}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No users</span>
                  )}
                </div>
                <div className="flex w-[120px] shrink-0 justify-end sm:w-[300px]">
                  {canUnshare && canRemoveProjects ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[1.5px] border-[#dc2626] px-3.5 py-[7px] text-[0.8125rem] text-[#dc2626] hover:bg-danger-surface"
                      onClick={() => setConfirmProjectId(projectShare.projectId)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>

              {confirmProjectId === projectShare.projectId ? (
                <div className="flex flex-col gap-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 sm:flex-row sm:items-center">
                  <p className="flex-1 text-[0.8125rem] leading-[1.4] text-[#991b1b]">
                    {unshareConfirmationMessage(workflow.workflowName, projectShare)}
                  </p>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-[1.5px] border-[#cbd5e1] px-3.5 py-[7px] text-[0.8125rem] text-[#334155]"
                      onClick={cancelConfirm}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-[#dc2626] px-3.5 py-[7px] text-[0.8125rem] text-white hover:bg-[#dc2626] active:bg-[#b91c1c]"
                      disabled={pendingProjectId === projectShare.projectId}
                      onClick={() => onUnshareConfirm(projectShare.projectId)}
                    >
                      {pendingProjectId === projectShare.projectId ? 'Removing…' : 'Remove access'}
                    </Button>
                  </div>
                  {errorProjectId === projectShare.projectId && errorMessage ? (
                    <p className="w-full text-xs text-[#991b1b] sm:w-auto">{errorMessage}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
