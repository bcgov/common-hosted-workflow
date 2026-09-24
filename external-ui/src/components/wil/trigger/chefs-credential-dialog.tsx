import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
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
import { extractErrorMessage } from '../../shared/error-utils';
import {
  createChefsCredential,
  chefsCredentialsQueryKey,
  DEFAULT_CHEFS_BASE_URL,
  type ChefsCredentialSummary,
} from '../../../services/backend/chefs-credentials';

interface ChefsCredentialDialogProps {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (credential: ChefsCredentialSummary) => void;
}

interface Draft {
  name: string;
  formName: string;
  baseUrl: string;
  formId: string;
  apiKey: string;
}

const EMPTY_DRAFT: Draft = {
  name: '',
  formName: '',
  baseUrl: DEFAULT_CHEFS_BASE_URL,
  formId: '',
  apiKey: '',
};

function isDraftValid(draft: Draft): boolean {
  return (
    draft.name.trim().length >= 3 &&
    draft.name.trim().length <= 128 &&
    draft.formName.trim().length > 0 &&
    draft.baseUrl.trim().length > 0 &&
    draft.formId.trim().length > 0 &&
    draft.apiKey.trim().length > 0
  );
}

export function ChefsCredentialDialog({
  tenantId,
  open,
  onOpenChange,
  onCreated,
}: Readonly<ChefsCredentialDialogProps>) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showApiKey, setShowApiKey] = useState(false);

  const createMutation = useMutation({
    mutationFn: (input: Draft) => createChefsCredential({ tenantId, input }),
    onSuccess: async (created) => {
      queryClient.setQueryData<ChefsCredentialSummary[]>(chefsCredentialsQueryKey(tenantId), (current) => {
        const list = current ?? [];
        return list.some((item) => item.id === created.id) ? list : [...list, created];
      });
      setDraft(EMPTY_DRAFT);
      setShowApiKey(false);
      onCreated(created);
      onOpenChange(false);
    },
  });

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const errorMessage = createMutation.isError
    ? extractErrorMessage(createMutation.error, 'Could not save the CHEFS credential')
    : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDraft(EMPTY_DRAFT);
          setShowApiKey(false);
          createMutation.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add CHEFS credential</DialogTitle>
          <DialogDescription>
            Saves a CHEFS Form Authentication credential on this project in n8n. The API key stays on the server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="chefs-credential-name">
              Credential name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="chefs-credential-name"
              value={draft.name}
              placeholder="e.g. Intake form"
              onChange={(event) => setField('name', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chefs-credential-form-name">
              Form name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="chefs-credential-form-name"
              value={draft.formName}
              placeholder="e.g. My CHEFS Form"
              onChange={(event) => setField('formName', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chefs-credential-base-url">
              CHEFS base URL <span className="text-red-500">*</span>
            </Label>
            <Input
              id="chefs-credential-base-url"
              value={draft.baseUrl}
              onChange={(event) => setField('baseUrl', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chefs-credential-form-id">
              Form ID <span className="text-red-500">*</span>
            </Label>
            <Input
              id="chefs-credential-form-id"
              value={draft.formId}
              placeholder="e.g. abc123-def456"
              onChange={(event) => setField('formId', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chefs-credential-api-key">
              API key <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="chefs-credential-api-key"
                type={showApiKey ? 'text' : 'password'}
                value={draft.apiKey}
                placeholder="Form API key"
                onChange={(event) => setField('apiKey', event.target.value)}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowApiKey((current) => !current)}
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--bc-muted)] hover:text-[var(--bc-text)]"
              >
                {showApiKey ? <IconEyeOff size={16} aria-hidden="true" /> : <IconEye size={16} aria-hidden="true" />}
              </Button>
            </div>
          </div>
          {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate(draft)}
            disabled={!isDraftValid(draft) || createMutation.isPending}
          >
            {createMutation.isPending ? 'Saving...' : 'Save credential'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
