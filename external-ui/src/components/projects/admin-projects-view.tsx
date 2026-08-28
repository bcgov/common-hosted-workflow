import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import axios from 'axios';
import { IconChevronLeft, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
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
import { toast } from '@/hooks/use-toasts';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
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

export function AdminProjectsView() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 400);
  const [typeFilter, setTypeFilter] = useState<ProjectTypeFilter>('all');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<PendingUpdate | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['admin-projects', page, debouncedSearchQuery, typeFilter],
    queryFn: ({ signal }) =>
      getAdminProjects({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearchQuery.trim() || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        signal,
      }),
    placeholderData: keepPreviousData,
  });

  const updateMutation = useMutation({
    mutationFn: (params: { projectId: string; tenantId: string }) =>
      updateProjectTenant(params.projectId, params.tenantId),
    onSuccess: () => {
      setEditingProjectId(null);
      queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
      toast.success('Tenant ID updated');
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
      toast.success('Tenant ID removed');
    },
    onError: (error) => {
      toast.error(getMutationErrorMessage(error));
    },
  });

  const projects = projectsQuery.data?.data ?? [];

  const summaryText = useMemo(() => {
    if (!projectsQuery.data) return '';
    const { pagination } = projectsQuery.data;
    return `${pagination.totalItems} projects`;
  }, [projectsQuery.data]);

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

    if (trimmed === '') {
      if (originalValue !== null) {
        setPendingDelete({ projectId, projectName, tenantId: originalValue });
      } else {
        cancelEditing();
      }
      return;
    }

    if (!UUID_REGEX.test(trimmed)) {
      setValidationError('Invalid UUID format');
      return;
    }

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
    return <p className="text-sm text-muted-foreground">Loading projects...</p>;
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
  if (!data) {
    return <p className="text-sm text-muted-foreground">No projects found.</p>;
  }

  const { pagination } = data;
  const totalPages = pagination.totalPages;

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
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search by project name, ID, or tenant ID..."
            className="pl-9"
            aria-label="Search projects"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as ProjectTypeFilter);
            setPage(1);
          }}
          className="h-10 rounded-control border border-border bg-surface px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-border-strong"
          aria-label="Filter by project type"
        >
          <option value="all">All types</option>
          <option value="personal">Personal</option>
          <option value="team">Team</option>
        </select>
      </div>

      {/* Summary Count */}
      <p className="text-[0.8125rem] text-muted-foreground">{summaryText}</p>

      {/* Project List */}
      {projects.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No projects match your filters.</p>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <ProjectRow
              key={project.projectId}
              project={project}
              isEditing={editingProjectId === project.projectId}
              editValue={editValue}
              validationError={editingProjectId === project.projectId ? validationError : null}
              isSaving={
                (updateMutation.isPending && updateMutation.variables?.projectId === project.projectId) ||
                (deleteMutation.isPending && deleteMutation.variables === project.projectId)
              }
              onStartEdit={() => startEditing(project.projectId, project.tenantId)}
              onCancelEdit={cancelEditing}
              onSaveEdit={() => saveEdit(project.projectId, project.tenantId, project.projectName)}
              onEditValueChange={(val) => {
                setEditValue(val);
                if (validationError) setValidationError(null);
              }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
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
              <strong className="text-foreground">{pendingUpdate?.projectName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {pendingUpdate?.oldTenantId ? (
              <p>
                <span className="text-muted-foreground">Current tenant:</span>{' '}
                <code className="font-mono text-xs">{pendingUpdate.oldTenantId}</code>
              </p>
            ) : (
              <p className="text-muted-foreground">No tenant currently assigned.</p>
            )}
            <p>
              <span className="text-muted-foreground">New tenant:</span>{' '}
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
              <strong className="text-foreground">{pendingDelete?.projectName}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Tenant to remove:</span>{' '}
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

/* ---------- Project Row Component ---------- */

interface ProjectRowProps {
  project: AdminProjectItem;
  isEditing: boolean;
  editValue: string;
  validationError: string | null;
  isSaving: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditValueChange: (value: string) => void;
}

function ProjectRow({
  project,
  isEditing,
  editValue,
  validationError,
  isSaving,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditValueChange,
}: Readonly<ProjectRowProps>) {
  const isPersonal = project.projectType === 'personal';
  const typeBadgeClasses = isPersonal
    ? 'bg-[#f1f8fe] text-[#1e5189] border border-[#c1ddfc]'
    : 'bg-[#f3f2f1] text-[#605e5c] border border-[#e0dedc]';

  return (
    <div
      className={`rounded-[12px] bg-white px-5 py-4 ${
        isEditing ? 'border-[1.5px] border-[#013366]' : 'border border-border'
      }`}
    >
      {/* Header: Name + Type Badge */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-foreground">
            <a
              href={`${globalThis.location.origin}/projects/${encodeURIComponent(project.projectId)}/workflows`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90]"
            >
              {project.projectName}
            </a>
          </h3>
          <p className="mt-0.5 truncate text-[0.8125rem] text-muted-foreground">{project.projectId}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2.5 py-0.5 text-xs font-medium ${typeBadgeClasses}`}>
          {isPersonal ? 'Personal' : 'Team'}
        </span>
      </div>

      {/* Tenant ID Row */}
      <div className="mt-3">
        {isEditing ? (
          <div className="space-y-3">
            <label className="block text-[0.8125rem] font-bold text-[#2D2D2D]">Tenant ID</label>
            <Input
              type="text"
              value={editValue}
              onChange={(e) => onEditValueChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSaveEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelEdit();
                }
              }}
              placeholder="Enter tenant UUID"
              aria-label="Tenant ID"
              aria-invalid={!!validationError}
              className="font-mono text-sm"
              autoFocus
              disabled={isSaving}
            />
            {validationError && (
              <span className="text-xs text-red-600" role="alert">
                {validationError}
              </span>
            )}
            <div className="flex items-center gap-3">
              <Button type="button" size="sm" onClick={onSaveEdit} disabled={isSaving}>
                Save
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onCancelEdit} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[0.8125rem] font-medium text-muted-foreground">Tenant ID</span>
            {project.tenantId ? (
              <>
                <span className="font-mono text-[0.8125rem] text-foreground">{project.tenantId}</span>
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="text-[0.8125rem] font-medium text-[#255a90] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90]"
                >
                  Edit
                </button>
              </>
            ) : (
              <>
                <span className="text-[0.8125rem] text-muted-foreground">No tenant mapped</span>
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="text-[0.8125rem] font-medium text-[#255a90] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#255a90]"
                >
                  Add tenant ID
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
