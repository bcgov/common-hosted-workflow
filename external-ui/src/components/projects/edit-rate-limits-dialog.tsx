import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import axios from 'axios';
import { IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toasts';
import { formatCount, formatShortDate } from '@/lib/rate-limit';
import {
  updateProjectRateLimit,
  type AdminProjectItem,
  type RateLimitStopBehavior,
  type UpdateProjectRateLimitBody,
} from '../../services/backend/projects';

const MAX_WEEKLY_LIMIT = 1_000_000;
const MAX_YEARLY_LIMIT = 100_000_000;

type LimitParseResult = number | null | undefined;
// undefined = not a valid whole number; null = input cleared (limit removed)

type DialogFieldErrors = Partial<Record<'weekly' | 'yearly' | 'reason', string>>;

function getRateLimitMutationErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    if (status === 400) return 'Invalid input';
    if (status === 404) return 'Project not found';
  }
  return 'Network error';
}

/**
 * Parses a limit input: empty string → null (clear the limit); a whole number
 * (commas/spaces tolerated) → the number; anything else → undefined.
 */
function parseLimitInput(raw: string): LimitParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const normalized = trimmed.replaceAll(',', '').replaceAll(' ', '');
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }
  const value = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(value) ? value : undefined;
}

function validateLimits(weekly: LimitParseResult, yearly: LimitParseResult, reason: string): DialogFieldErrors {
  const errors: DialogFieldErrors = {};

  if (weekly === undefined) {
    errors.weekly = 'Enter a whole number';
  } else if (weekly !== null && weekly > MAX_WEEKLY_LIMIT) {
    errors.weekly = `Weekly limit must be ${formatCount(MAX_WEEKLY_LIMIT)} or less`;
  }

  if (yearly === undefined) {
    errors.yearly = 'Enter a whole number';
  } else if (yearly !== null && yearly > MAX_YEARLY_LIMIT) {
    errors.yearly = `Annual limit must be ${formatCount(MAX_YEARLY_LIMIT)} or less`;
  }

  if (typeof weekly === 'number' && typeof yearly === 'number' && yearly < weekly) {
    errors.yearly = 'Annual limit must be at least the weekly limit';
  }

  if (reason.trim() === '') {
    errors.reason = 'Reason for change is required';
  }

  return errors;
}

export interface EditRateLimitsDialogProps {
  project: AdminProjectItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditRateLimitsDialog({ project, open, onOpenChange }: Readonly<EditRateLimitsDialogProps>) {
  const queryClient = useQueryClient();
  const [weeklyInput, setWeeklyInput] = useState('');
  const [yearlyInput, setYearlyInput] = useState('');
  const [stopBehavior, setStopBehavior] = useState<RateLimitStopBehavior>('hard_stop');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<DialogFieldErrors>({});

  // Re-seed the form from the current project config each time the dialog opens.
  useEffect(() => {
    if (!open) {
      return;
    }
    setWeeklyInput(project.weeklyRateLimit === null ? '' : formatCount(project.weeklyRateLimit));
    setYearlyInput(project.yearlyRateLimit === null ? '' : formatCount(project.yearlyRateLimit));
    setStopBehavior(project.stopBehavior ?? 'hard_stop');
    setReason('');
    setErrors({});
  }, [open, project]);

  function clearFieldError(field: keyof DialogFieldErrors) {
    setErrors((prev) => {
      if (prev[field] === undefined) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  const saveMutation = useMutation({
    mutationFn: (body: UpdateProjectRateLimitBody) => updateProjectRateLimit(project.projectId, body),
    onSuccess: () => {
      toast.success('Rate limits updated');
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: ['admin-projects'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-project', project.projectId] });
      void queryClient.invalidateQueries({ queryKey: ['admin-project-workflow-usage', project.projectId] });
    },
    onError: (error) => {
      toast.error(getRateLimitMutationErrorMessage(error));
    },
  });

  const parsedWeekly = parseLimitInput(weeklyInput);
  const parsedYearly = parseLimitInput(yearlyInput);
  const showPauseWarning = typeof parsedWeekly === 'number' && parsedWeekly < project.weeklyExecutionCount;

  function handleSave() {
    const nextErrors = validateLimits(parsedWeekly, parsedYearly, reason);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    saveMutation.mutate({
      weeklyRateLimit: parsedWeekly === undefined ? null : parsedWeekly,
      yearlyRateLimit: parsedYearly === undefined ? null : parsedYearly,
      lastAdminComment: reason.trim(),
      stopBehavior,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Close">
            <IconX size={16} aria-hidden="true" />
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Edit limits for {project.projectName}</DialogTitle>
          <DialogDescription>Limits count every run of every workflow in this project.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Weekly limit"
            htmlFor="weekly-rate-limit"
            description="Runs per calendar week, Monday to Sunday"
            error={errors.weekly}
          >
            <Input
              id="weekly-rate-limit"
              inputMode="numeric"
              autoComplete="off"
              value={weeklyInput}
              onChange={(e) => {
                setWeeklyInput(e.target.value);
                clearFieldError('weekly');
              }}
            />
          </Field>
          <Field
            label="Annual limit"
            htmlFor="annual-rate-limit"
            description="Runs per calendar year. Must be at least the weekly limit."
            error={errors.yearly}
          >
            <Input
              id="annual-rate-limit"
              inputMode="numeric"
              autoComplete="off"
              value={yearlyInput}
              onChange={(e) => {
                setYearlyInput(e.target.value);
                clearFieldError('yearly');
              }}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold leading-5 text-foreground">When a limit is reached</legend>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="stop-behavior"
                value="hard_stop"
                checked={stopBehavior === 'hard_stop'}
                onChange={() => setStopBehavior('hard_stop')}
                className="size-4 accent-[#013366]"
              />
              Pause new runs until the limit resets
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="stop-behavior"
                value="soft_stop"
                checked={stopBehavior === 'soft_stop'}
                onChange={() => setStopBehavior('soft_stop')}
                className="size-4 accent-[#013366]"
              />
              Keep running and alert admins (soft limit)
            </label>
          </div>
        </fieldset>

        <Field
          label="Reason for change"
          htmlFor="rate-limit-reason"
          required
          description="Required. Every change is saved to the audit log with your name."
          error={errors.reason}
        >
          <Textarea
            id="rate-limit-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are these limits changing?"
          />
        </Field>

        {project.updatedAt !== null && (
          <div className="rounded-control border border-border bg-surface-muted p-3 text-sm">
            <p>
              <span className="font-bold text-foreground">Last change</span>{' '}
              <span className="text-muted-foreground">
                {formatShortDate(new Date(project.updatedAt))}
                {project.updatedByName ? ` by ${project.updatedByName}` : ''}
              </span>
            </p>
            {project.lastAdminComment !== null && (
              <p className="mt-1 text-muted-foreground">{project.lastAdminComment}</p>
            )}
          </div>
        )}

        {showPauseWarning && (
          <div className="rounded-control border border-information bg-information-surface p-3 text-sm text-information-foreground">
            <p className="font-bold">
              {project.projectName} has used {formatCount(project.weeklyExecutionCount)} runs this week
            </p>
            <p>If the new weekly limit is lower than that, {project.projectName} workflows pause right away.</p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saveMutation.isPending}>
            Save limits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
