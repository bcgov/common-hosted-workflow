import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { IconTrash, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toasts';
import {
  formatCount,
  formatShortDate,
  formatWeeklyKeyRange,
  getWeeklyPeriodKey,
  listUpcomingWeeklyPeriodOptions,
} from '@/lib/rate-limit';
import {
  createProjectTopup,
  deleteProjectTopup,
  listProjectTopups,
  type AdminProjectItem,
  type ProjectTopupItem,
} from '../../services/backend/projects';

const TOPUP_HISTORY_PAGE_SIZE = 4;

type DialogFieldErrors = Partial<Record<'amount' | 'comment', string>>;

function getTopupMutationErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    if (status === 400) return 'Invalid top-up';
    if (status === 404) return 'Top-up not found';
    if (status === 409) return 'Top-ups for the current or past weeks cannot be deleted';
  }
  return 'Network error';
}

/**
 * Parses an amount input: a whole number (commas/spaces tolerated) → the
 * number; empty or anything else → undefined (invalid).
 */
function parseAmountInput(raw: string): number | undefined {
  const normalized = raw.trim().replaceAll(',', '').replaceAll(' ', '');
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }
  const value = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(value) ? value : undefined;
}

function validateAmount(amount: number | undefined, comment: string): DialogFieldErrors {
  const errors: DialogFieldErrors = {};

  if (amount === undefined || amount < 1 || amount > 1_000_000) {
    errors.amount = 'Enter a whole number of runs between 1 and 1,000,000';
  }

  if (comment.trim() === '') {
    errors.comment = 'Admin comment is required';
  }

  return errors;
}

export interface ManageTopupsDialogProps {
  project: AdminProjectItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageTopupsDialog({ project, open, onOpenChange }: Readonly<ManageTopupsDialogProps>) {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<DialogFieldErrors>({});
  const [page, setPage] = useState(1);
  const [topupToDelete, setTopupToDelete] = useState<ProjectTopupItem | null>(null);

  // Fresh form each time the dialog opens (deliberately not re-run when the
  // project refetches, so an in-progress entry survives background updates).
  useEffect(() => {
    if (open) {
      setPeriod(listUpcomingWeeklyPeriodOptions()[0].value);
      setAmountInput('');
      setComment('');
      setErrors({});
      setPage(1);
    }
  }, [open]);

  const periodOptions = listUpcomingWeeklyPeriodOptions();
  const currentWeeklyKey = getWeeklyPeriodKey();

  const topupsQuery = useQuery({
    queryKey: ['admin-project-topups', project.projectId, page],
    queryFn: ({ signal }) => listProjectTopups(project.projectId, page, TOPUP_HISTORY_PAGE_SIZE, signal),
    enabled: open,
  });

  function invalidateTopupQueries() {
    void queryClient.invalidateQueries({ queryKey: ['admin-project-topups', project.projectId] });
    void queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-project', project.projectId] });
  }

  const addMutation = useMutation({
    mutationFn: (body: { periodKey: string; amount: number; adminComment: string }) =>
      createProjectTopup(project.projectId, body),
    onSuccess: () => {
      // Keep the chosen period; clear the rest so another top-up can be entered.
      setAmountInput('');
      setComment('');
      setErrors({});
      setPage(1);
      invalidateTopupQueries();
      toast.success('Top-up added');
    },
    onError: (error) => toast.error(getTopupMutationErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (topupId: string) => deleteProjectTopup(project.projectId, topupId),
    onSuccess: () => {
      setTopupToDelete(null);
      invalidateTopupQueries();
      toast.success('Top-up removed');
    },
    onError: (error) => toast.error(getTopupMutationErrorMessage(error)),
  });

  const parsedAmount = parseAmountInput(amountInput);

  function handleAdd() {
    const nextErrors = validateAmount(parsedAmount, comment);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || parsedAmount === undefined) {
      return;
    }
    addMutation.mutate({ periodKey: period, amount: parsedAmount, adminComment: comment.trim() });
  }

  const topups = topupsQuery.data?.data ?? [];
  const totalPages = topupsQuery.data?.pagination.totalPages ?? 1;
  const totalItems = topupsQuery.data?.pagination.totalItems ?? 0;

  const weeklyLimitText =
    project.weeklyRateLimit === null
      ? null
      : `${formatCount(project.weeklyRateLimit)}${
          project.weeklyTopupRuns > 0 ? ` (+${formatCount(project.weeklyTopupRuns)} top-up)` : ''
        }`;
  const annualLimitText = project.yearlyRateLimit === null ? 'not set' : formatCount(project.yearlyRateLimit);
  const limitsText =
    weeklyLimitText === null
      ? `No weekly limit is configured, so a top-up would not take effect. Annual limit is ${annualLimitText}.`
      : `Weekly limit is ${weeklyLimitText} and annual limit is ${annualLimitText}.`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Close">
              <IconX size={16} aria-hidden="true" />
            </Button>
          </DialogClose>
          <DialogHeader>
            <DialogTitle>Manage top-ups for {project.projectName}</DialogTitle>
            <DialogDescription>
              Top-ups add runs to the weekly limit for a single week. They apply on top of the configured limit.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Period" htmlFor="topup-period" description="Week the extra runs apply to">
              <Select
                id="topup-period"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                disabled={addMutation.isPending}
              >
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Top-up amount"
              htmlFor="topup-amount"
              description="Extra runs for that week"
              error={errors.amount}
            >
              <Input
                id="topup-amount"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 2,000"
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
                disabled={addMutation.isPending}
              />
            </Field>
          </div>

          <p className="text-xs text-muted-foreground">{limitsText}</p>

          <Field
            label="Admin comment"
            htmlFor="topup-comment"
            required
            description="Required. Saved with the top-up as its audit trail."
            error={errors.comment}
          >
            <Textarea
              id="topup-comment"
              value={comment}
              maxLength={2000}
              onChange={(e) => {
                setComment(e.target.value);
                setErrors((prev) => ({ ...prev, comment: undefined }));
              }}
              placeholder="Why is this top-up needed?"
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={addMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleAdd} disabled={addMutation.isPending}>
              Add top-up
            </Button>
          </DialogFooter>

          <Separator className="my-2" />

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">History</h3>
            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              {topupsQuery.isPending ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Loading top-ups...</p>
              ) : topupsQuery.isError ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">Could not load top-up history.</p>
              ) : topups.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">No top-ups yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-surface">
                      <TableHead className="uppercase">Amount</TableHead>
                      <TableHead className="uppercase">Added</TableHead>
                      <TableHead className="uppercase">Week</TableHead>
                      <TableHead className="uppercase">Comment</TableHead>
                      <TableHead className="w-10">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Zebra striping (odd rows) local to this dialog; odd rows keep a
                        darker hover (surface-muted) so hover stays visible on striped rows. */}
                    {topups.map((topup, topupIndex) => (
                      <TableRow
                        key={topup.id}
                        className={topupIndex % 2 === 1 ? 'bg-surface-subtle hover:bg-surface-muted' : undefined}
                      >
                        <TableCell className="text-sm font-semibold text-foreground">
                          +{formatCount(topup.amount)}
                        </TableCell>
                        <TableCell className="text-sm">{formatShortDate(new Date(topup.createdAt))}</TableCell>
                        <TableCell className="text-sm">{formatWeeklyKeyRange(topup.periodKey)}</TableCell>
                        <TableCell className="max-w-[16rem] text-sm break-words whitespace-pre-wrap">
                          {topup.adminComment}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {/* Only future weeks can be removed; the current week is already in effect. */}
                          {topup.periodKey > currentWeeklyKey && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-danger-foreground"
                              aria-label={`Remove top-up for the week of ${formatWeeklyKeyRange(topup.periodKey)}`}
                              onClick={() => setTopupToDelete(topup)}
                            >
                              <IconTrash size={16} aria-hidden="true" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {topups.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Showing {topups.length} of {formatCount(totalItems)} top-ups
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={topupToDelete !== null}
        title="Remove top-up"
        description={
          topupToDelete
            ? `This removes the ${formatCount(topupToDelete.amount)}-run top-up for the week of ${formatWeeklyKeyRange(topupToDelete.periodKey)}.`
            : ''
        }
        confirmLabel="Remove"
        confirmVariant="destructive"
        isConfirming={deleteMutation.isPending}
        onConfirm={() => {
          if (topupToDelete) {
            deleteMutation.mutate(topupToDelete.id);
          }
        }}
        onCancel={() => setTopupToDelete(null)}
      />
    </>
  );
}
