import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toasts';
import { parseLimitInput, validateLimitPair, type LimitFieldErrors, type LimitParseResult } from '@/lib/limit-input';
import { formatCount } from '@/lib/rate-limit';
import {
  getRateLimitDefaults,
  updateRateLimitDefaults,
  type ProjectRateLimitDefaults,
  type RateLimitScopeDefaults,
} from '../../services/backend/projects';

export const RATE_LIMIT_DEFAULTS_QUERY_KEY = ['rate-limit-defaults'] as const;

type ScopeInputKeys = {
  weekly: string;
  yearly: string;
};

type DefaultFieldErrors = Partial<Record<'teamWeekly' | 'teamYearly' | 'personalWeekly' | 'personalYearly', string>>;

function getDefaultsMutationErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    if (status === 400) return 'Invalid input';
  }
  return 'Network error';
}

/** undefined (invalid input) cannot be saved: a save happens only with valid parsed values. */
function normalizeParsed(value: LimitParseResult): number | null {
  return value === undefined ? null : value;
}

export interface DefaultLimitsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DefaultLimitsDialog({ open, onOpenChange }: Readonly<DefaultLimitsDialogProps>) {
  const queryClient = useQueryClient();
  const [scopeInputs, setScopeInputs] = useState<{ team: ScopeInputKeys; personal: ScopeInputKeys }>({
    team: { weekly: '', yearly: '' },
    personal: { weekly: '', yearly: '' },
  });
  const [errors, setErrors] = useState<DefaultFieldErrors>({});

  // Fetched while the dialog is open so the form always seeds from freshly
  // saved values; the response carries no usage counts, only the limits.
  const defaultsQuery = useQuery({
    queryKey: RATE_LIMIT_DEFAULTS_QUERY_KEY,
    queryFn: ({ signal }) => getRateLimitDefaults(signal),
    enabled: open,
  });

  // Seed the form from the saved defaults whenever the dialog opens (or the
  // query resolves while it is open).
  useEffect(() => {
    if (!open) {
      return;
    }
    const data = defaultsQuery.data;
    if (!data) {
      return;
    }
    setScopeInputs({
      team: {
        weekly: data.team.weeklyRateLimit === null ? '' : formatCount(data.team.weeklyRateLimit),
        yearly: data.team.yearlyRateLimit === null ? '' : formatCount(data.team.yearlyRateLimit),
      },
      personal: {
        weekly: data.personal.weeklyRateLimit === null ? '' : formatCount(data.personal.weeklyRateLimit),
        yearly: data.personal.yearlyRateLimit === null ? '' : formatCount(data.personal.yearlyRateLimit),
      },
    });
    setErrors({});
  }, [open, defaultsQuery.data]);

  function clearFieldError(field: keyof DefaultFieldErrors) {
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
    mutationFn: (body: ProjectRateLimitDefaults) => updateRateLimitDefaults(body),
    onSuccess: () => {
      toast.success('Default limits updated');
      onOpenChange(false);
      void queryClient.invalidateQueries({ queryKey: RATE_LIMIT_DEFAULTS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(getDefaultsMutationErrorMessage(error));
    },
  });

  const parsed = {
    team: {
      weekly: parseLimitInput(scopeInputs.team.weekly),
      yearly: parseLimitInput(scopeInputs.team.yearly),
    },
    personal: {
      weekly: parseLimitInput(scopeInputs.personal.weekly),
      yearly: parseLimitInput(scopeInputs.personal.yearly),
    },
  };

  function handleSave() {
    const nextErrors: DefaultFieldErrors = {
      ...mapScopeErrors('team', validateLimitPair(parsed.team.weekly, parsed.team.yearly)),
      ...mapScopeErrors('personal', validateLimitPair(parsed.personal.weekly, parsed.personal.yearly)),
    };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    saveMutation.mutate({
      team: {
        weeklyRateLimit: normalizeParsed(parsed.team.weekly),
        yearlyRateLimit: normalizeParsed(parsed.team.yearly),
      },
      personal: {
        weeklyRateLimit: normalizeParsed(parsed.personal.weekly),
        yearlyRateLimit: normalizeParsed(parsed.personal.yearly),
      },
    });
  }

  function renderScopeInputs(scope: 'team' | 'personal') {
    const fieldErrors: Record<'weekly' | 'yearly', string | undefined> = {
      weekly: scope === 'team' ? errors.teamWeekly : errors.personalWeekly,
      yearly: scope === 'team' ? errors.teamYearly : errors.personalYearly,
    };
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Default weekly limit"
          htmlFor={`default-${scope}-weekly`}
          description="Runs per calendar week, Monday to Sunday. Leave blank for no default."
          error={fieldErrors.weekly}
        >
          <Input
            id={`default-${scope}-weekly`}
            inputMode="numeric"
            autoComplete="off"
            value={scopeInputs[scope].weekly}
            onChange={(e) => {
              setScopeInputs((prev) => ({ ...prev, [scope]: { ...prev[scope], weekly: e.target.value } }));
              clearFieldError(scope === 'team' ? 'teamWeekly' : 'personalWeekly');
            }}
          />
        </Field>
        <Field
          label="Default annual limit"
          htmlFor={`default-${scope}-yearly`}
          description="Runs per calendar year. Must be at least the weekly limit. Leave blank for no default."
          error={fieldErrors.yearly}
        >
          <Input
            id={`default-${scope}-yearly`}
            inputMode="numeric"
            autoComplete="off"
            value={scopeInputs[scope].yearly}
            onChange={(e) => {
              setScopeInputs((prev) => ({ ...prev, [scope]: { ...prev[scope], yearly: e.target.value } }));
              clearFieldError(scope === 'team' ? 'teamYearly' : 'personalYearly');
            }}
          />
        </Field>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogClose asChild>
          <Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="Close">
            <IconX size={16} aria-hidden="true" />
          </Button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Default limits</DialogTitle>
          <DialogDescription>
            Projects without limits of their own run on these defaults. Leave a field blank for no default.
          </DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold leading-5 text-foreground">Team projects (tenants)</legend>
          {renderScopeInputs('team')}
        </fieldset>

        <Separator />

        <fieldset className="space-y-2">
          <legend className="text-sm font-bold leading-5 text-foreground">Personal accounts</legend>
          {renderScopeInputs('personal')}
        </fieldset>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saveMutation.isPending}>
            Save defaults
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Maps one scope's field errors onto the flat dialog error keys. Entries
 * without an actual message are left out entirely, so an all-valid form
 * produces an empty error object and Save can proceed.
 */
function mapScopeErrors(scope: 'team' | 'personal', scopeErrors: LimitFieldErrors): DefaultFieldErrors {
  const weeklyKey: keyof DefaultFieldErrors = scope === 'team' ? 'teamWeekly' : 'personalWeekly';
  const yearlyKey: keyof DefaultFieldErrors = scope === 'team' ? 'teamYearly' : 'personalYearly';
  const mapped: DefaultFieldErrors = {};
  if (scopeErrors.weekly !== undefined) {
    mapped[weeklyKey] = scopeErrors.weekly;
  }
  if (scopeErrors.yearly !== undefined) {
    mapped[yearlyKey] = scopeErrors.yearly;
  }
  return mapped;
}

/** Re-exported for tests: the full-replace body shape for {@link updateRateLimitDefaults}. */
export type { RateLimitScopeDefaults };
