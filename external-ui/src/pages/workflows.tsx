import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { login } from '../auth/session-actions';
import { getWorkflows, shareWorkflow, unshareWorkflow } from '../services/backend/workflows';
import { useAuthUser, usePermissions } from '../state/session';
import { IconLogin2, IconShare, IconTrash, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function Workflows() {
  const user = useAuthUser();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [sharingWorkflowId, setSharingWorkflowId] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [unshareTarget, setUnshareTarget] = useState<{ workflowId: string; projectId: string } | null>(null);

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
      setUnshareTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['workflows', user?.email ?? ''] });
    },
  });

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
    <div className="mx-auto max-w-7xl px-6 py-10 lg:py-12">
      <section className="max-w-6xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--bc-text)] lg:text-4xl">Workflows</h1>
          <p className="max-w-4xl text-base text-[var(--bc-muted)]">
            Workflows you can view in n8n, with the email addresses associated to each project share.
          </p>
        </div>

        {!user ? (
          <Alert>
            <AlertTitle>Sign in required</AlertTitle>
            <AlertDescription>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <p className="text-sm text-[var(--bc-muted)]">Sign in to see your workflows.</p>
                <Button onClick={login}>
                  <IconLogin2 size={16} aria-hidden="true" />
                  Sign In
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : workflowsQuery.isLoading ? (
          <p className="text-sm text-[var(--bc-muted)]">Loading workflows...</p>
        ) : workflowsError ? (
          <Alert variant="destructive">
            <AlertTitle>workflow error</AlertTitle>
            <AlertDescription>{workflowsError}</AlertDescription>
          </Alert>
        ) : workflows.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-[var(--bc-muted)]">No workflows found for this user.</CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {workflows.map((workflow) => {
              const canRemoveProjects = workflow.projectShares.length > 1;
              return (
                <Card key={workflow.workflowId}>
                  <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{workflow.workflowName}</CardTitle>
                      <CardDescription className="font-mono text-xs break-all">{workflow.workflowId}</CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">
                        {workflow.projectIds.length} project{workflow.projectIds.length === 1 ? '' : 's'}
                      </Badge>
                      {canShareWorkflows ? (
                        <Button type="button" size="sm" onClick={() => openShareDialog(workflow.workflowId)}>
                          <IconShare size={16} aria-hidden="true" />
                          Share
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>

                  <CardContent>
                    <ScrollArea className="w-full rounded-md border border-[var(--bc-border)]">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-[var(--bc-surface)] hover:bg-[var(--bc-surface)]">
                            <TableHead className="w-[28%]">Project</TableHead>
                            <TableHead>User emails</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {workflow.projectShares.map((projectShare) => (
                            <TableRow key={projectShare.projectId}>
                              <TableCell className="font-mono text-xs break-all">{projectShare.projectId}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-2">
                                  {projectShare.userEmails.length ? (
                                    projectShare.userEmails.map((email) => (
                                      <Badge key={email} variant="outline">
                                        {email}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-xs text-[var(--bc-muted)]">No users</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                {canUnshareWorkflows && canRemoveProjects ? (
                                  <Button
                                    type="button"
                                    onClick={() =>
                                      setUnshareTarget({
                                        workflowId: workflow.workflowId,
                                        projectId: projectShare.projectId,
                                      })
                                    }
                                    variant="destructive"
                                    size="sm"
                                    disabled={unshareMutation.isPending}
                                  >
                                    <IconTrash size={14} aria-hidden="true" />
                                    Remove
                                  </Button>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog
          open={Boolean(sharingWorkflow && canShareWorkflows)}
          onOpenChange={(open) => {
            if (!open) {
              closeShareDialog();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share workflow</DialogTitle>
              <DialogDescription>{sharingWorkflow?.workflowName}</DialogDescription>
            </DialogHeader>

            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!sharingWorkflow) {
                  return;
                }
                shareMutation.mutate({ workflowId: sharingWorkflow.workflowId, email: shareEmail.trim() });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="share-email">Email</Label>
                <Input
                  id="share-email"
                  type="email"
                  value={shareEmail}
                  onChange={(event) => setShareEmail(event.target.value)}
                  placeholder="person@example.com"
                  autoFocus
                />
              </div>

              {shareMutation.error instanceof Error ? (
                <Alert variant="destructive">
                  <AlertTitle>share error</AlertTitle>
                  <AlertDescription>{shareMutation.error.message}</AlertDescription>
                </Alert>
              ) : null}

              <DialogFooter>
                <Button type="button" onClick={closeShareDialog} variant="outline">
                  <IconX size={16} aria-hidden="true" />
                  Cancel
                </Button>
                <Button type="submit" disabled={shareMutation.isPending || !shareEmail.trim()}>
                  <IconShare size={16} aria-hidden="true" />
                  Share
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(unshareTarget)}
          onOpenChange={(open) => {
            if (!open) {
              setUnshareTarget(null);
              unshareMutation.reset();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove workflow share</DialogTitle>
              <DialogDescription>
                This will remove access to this workflow for all users in project{' '}
                <span className="font-mono">{unshareTarget?.projectId}</span>.
              </DialogDescription>
            </DialogHeader>

            {unshareMutation.error instanceof Error ? (
              <Alert variant="destructive">
                <AlertTitle>remove error</AlertTitle>
                <AlertDescription>{unshareMutation.error.message}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                onClick={() => {
                  setUnshareTarget(null);
                  unshareMutation.reset();
                }}
                variant="outline"
              >
                <IconX size={16} aria-hidden="true" />
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={unshareMutation.isPending}
                onClick={() => {
                  if (unshareTarget) {
                    unshareMutation.mutate(unshareTarget);
                  }
                }}
              >
                <IconTrash size={14} aria-hidden="true" />
                {unshareMutation.isPending ? 'Removing...' : 'Remove'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {user ? (
          <div className="flex gap-4 pt-1 text-sm font-medium">
            <Link to="/" className="underline underline-offset-2 hover:text-[var(--bc-blue-dark)]">
              Home
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
