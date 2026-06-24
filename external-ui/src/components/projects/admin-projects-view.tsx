import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import axios from 'axios';
import {
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconCheck,
  IconX,
  IconSearch,
  IconExternalLink,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toasts';
import {
  getAdminProjects,
  updateProjectTenant,
  deleteProjectTenant,
  type AdminProjectItem,
} from '../../services/backend/projects';

const PAGE_SIZE = 25;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ProjectTypeFilter = 'all' | 'personal' | 'team';

interface PendingUpdate {
  projectId: string;
  projectName: string;
  oldTenantId: string | null;
  newTenantId: string;
}

interface PendingDelete {
  projectId: string;
  projectName: string;
  tenantId: string;
}

function getMutationErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    if (status === 400) return 'Invalid tenant ID format';
    if (status === 409) return 'Tenant ID already in use';
  }
  return 'Network error';
}

function matchesSearch(project: AdminProjectItem, query: string): boolean {
  const lower = query.toLowerCase();
  if (project.projectName.toLowerCase().includes(lower)) return true;
  if (project.projectId.toLowerCase().includes(lower)) return true;
  if (project.tenantId && project.tenantId.toLowerCase().includes(lower)) return true;
  return false;
}

export function AdminProjectsView() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ProjectTypeFilter>('all');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['admin-projects', page],
    queryFn: ({ signal }) => getAdminProjects({ page, pageSize: PAGE_SIZE, signal }),
  });

  const updateMutation = useMutation({
    mutationFn: (params: { projectId: string; tenantId: string }) =>
      updateProjectTenant(params.projectId, params.tenantId),
    onSuccess: () => {
      setEditingProjectId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
    },
    onError: (error) => {
      toast.error(getMutationErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (projectId: string) => deleteProjectTenant(projectId),
    onSuccess: () => {
      setEditingProjectId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
    },
    onError: (error) => {
      toast.error(getMutationErrorMessage(error));
    },
  });

  // Client-side filtering of the current page's data
  const filteredProjects = useMemo(() => {
    if (!projectsQuery.data) return [];
    let items = projectsQuery.data.data;

    if (typeFilter !== 'all') {
      items = items.filter((p) => p.projectType === typeFilter);
    }

    if (searchQuery.trim()) {
      items = items.filter((p) => matchesSearch(p, searchQuery.trim()));
    }

    return items;
  }, [projectsQuery.data, typeFilter, searchQuery]);

  function startEditing(projectId: string, currentValue: string | null) {
    setEditingProjectId(projectId);
    setEditValue(currentValue ?? '');
    setValidationError(null);
  }

  function cancelEditing() {
    setEditingProjectId(null);
    setEditValue('');
    setValidationError(null);
  }

  function saveEdit(projectId: string, originalValue: string | null, projectName: string) {
    const trimmed = editValue.trim();

    // If cleared, delete the mapping
    if (trimmed === '') {
      if (originalValue !== null) {
        setPendingDelete({ projectId, projectName, tenantId: originalValue });
      } else {
        cancelEditing();
      }
      return;
    }

    // Validate UUID
    if (!UUID_REGEX.test(trimmed)) {
      setValidationError('Invalid UUID format');
      return;
    }

    // No change
    if (trimmed === originalValue) {
      cancelEditing();
      return;
    }

    setValidationError(null);
    setPendingUpdate({ projectId, projectName, oldTenantId: originalValue, newTenantId: trimmed });
  }

  function confirmUpdate() {
    if (!pendingUpdate) return;
    updateMutation.mutate({ projectId: pendingUpdate.projectId, tenantId: pendingUpdate.newTenantId });
    setPendingUpdate(null);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteMutation.mutate(pendingDelete.projectId);
    setPendingDelete(null);
  }

  if (projectsQuery.isLoading) {
    return <p className="text-sm text-[var(--bc-muted)]">Loading projects...</p>;
  }

  if (projectsQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error loading projects</AlertTitle>
        <AlertDescription>
          {projectsQuery.error instanceof Error ? projectsQuery.error.message : 'Could not load projects'}
        </AlertDescription>
      </Alert>
    );
  }

  const data = projectsQuery.data;
  if (!data || data.data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-[var(--bc-muted)]">No projects found.</CardContent>
      </Card>
    );
  }

  const { pagination } = data;
  const totalPages = pagination.totalPages;

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--bc-muted)]"
            aria-hidden="true"
          />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by project name, project ID, or tenant ID..."
            className="pl-9"
            aria-label="Search projects"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ProjectTypeFilter)}
          className="h-9 rounded-md border border-[var(--bc-border)] bg-white px-3 text-sm text-[var(--bc-text)] focus:outline-none focus:ring-2 focus:ring-[var(--bc-blue)]"
          aria-label="Filter by project type"
        >
          <option value="all">All types</option>
          <option value="personal">Personal</option>
          <option value="team">Team</option>
        </select>
      </div>

      {/* Filtered Results */}
      {filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-[var(--bc-muted)]">No projects match your filters.</CardContent>
        </Card>
      ) : (
        filteredProjects.map((project) => {
          const isEditing = editingProjectId === project.projectId;
          const isSaving =
            (updateMutation.isPending && updateMutation.variables?.projectId === project.projectId) ||
            (deleteMutation.isPending && deleteMutation.variables === project.projectId);

          return (
            <Card key={project.projectId}>
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{project.projectName}</CardTitle>
                  <CardDescription className="font-mono text-xs break-all">{project.projectId}</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-[var(--bc-surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--bc-muted)]">
                    {project.projectType}
                  </span>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a
                      href={`${globalThis.location.origin}/projects/${encodeURIComponent(project.projectId)}/workflows`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <IconExternalLink size={16} aria-hidden="true" />
                      Open
                    </a>
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                <ScrollArea className="w-full rounded-md border border-[var(--bc-border)]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[var(--bc-surface)] hover:bg-[var(--bc-surface)]">
                        <TableHead>Tenant ID</TableHead>
                        <TableHead className="w-[100px] text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>
                          {isEditing ? (
                            <div className="flex flex-col gap-1">
                              <Input
                                type="text"
                                value={editValue}
                                onChange={(e) => {
                                  setEditValue(e.target.value);
                                  if (validationError) setValidationError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    saveEdit(project.projectId, project.tenantId, project.projectName);
                                  } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelEditing();
                                  }
                                }}
                                placeholder="Enter tenant UUID"
                                aria-label="Tenant ID"
                                aria-invalid={!!validationError}
                                className="h-8 font-mono text-xs"
                                autoFocus
                                disabled={isSaving}
                              />
                              {validationError && (
                                <span className="text-xs text-red-600" role="alert">
                                  {validationError}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="font-mono text-xs break-all">
                              {project.tenantId ?? <span className="text-[var(--bc-muted)]">—</span>}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => saveEdit(project.projectId, project.tenantId, project.projectName)}
                                disabled={isSaving}
                                aria-label="Save"
                              >
                                <IconCheck size={16} className="text-green-600" aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={cancelEditing}
                                disabled={isSaving}
                                aria-label="Cancel"
                              >
                                <IconX size={16} className="text-red-600" aria-hidden="true" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => startEditing(project.projectId, project.tenantId)}
                              aria-label="Edit tenant ID"
                            >
                              <IconEdit size={16} aria-hidden="true" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-[var(--bc-muted)]">
            Page {page} of {totalPages} ({pagination.totalItems} projects)
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              <IconChevronLeft size={16} aria-hidden="true" />
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Next
              <IconChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {/* Update Confirmation Dialog */}
      <Dialog
        open={!!pendingUpdate}
        onOpenChange={(open) => {
          if (!open) setPendingUpdate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Tenant Update</DialogTitle>
            <DialogDescription>
              You are about to change the tenant mapping for project{' '}
              <strong className="text-[var(--bc-text)]">{pendingUpdate?.projectName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {pendingUpdate?.oldTenantId ? (
              <p>
                <span className="text-[var(--bc-muted)]">Current tenant:</span>{' '}
                <code className="font-mono text-xs">{pendingUpdate.oldTenantId}</code>
              </p>
            ) : (
              <p className="text-[var(--bc-muted)]">No tenant currently assigned.</p>
            )}
            <p>
              <span className="text-[var(--bc-muted)]">New tenant:</span>{' '}
              <code className="font-mono text-xs">{pendingUpdate?.newTenantId}</code>
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingUpdate(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmUpdate}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Tenant Removal</DialogTitle>
            <DialogDescription>
              You are about to remove the tenant mapping for project{' '}
              <strong className="text-[var(--bc-text)]">{pendingDelete?.projectName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-[var(--bc-muted)]">Tenant to remove:</span>{' '}
              <code className="font-mono text-xs">{pendingDelete?.tenantId}</code>
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
