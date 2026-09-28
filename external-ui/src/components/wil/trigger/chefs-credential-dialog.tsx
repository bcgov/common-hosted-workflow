import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  updateChefsCredential,
  chefsCredentialsQueryKey,
  DEFAULT_CHEFS_BASE_URL,
  type ChefsCredentialList,
  type ChefsCredentialSummary,
  type UpdateChefsCredentialInput,
} from '../../../services/backend/chefs-credentials';
import {
  createChefsCredentialFormSchema,
  editChefsCredentialFormSchema,
  type ChefsCredentialFormValues,
} from './chefs-credential-schema';

interface ChefsCredentialDialogProps {
  tenantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (credential: ChefsCredentialSummary) => void;
  /** When set, the dialog edits this credential instead of creating a new one. */
  editing?: ChefsCredentialSummary | null;
  onUpdated?: (credential: ChefsCredentialSummary) => void;
}

const EMPTY_VALUES: ChefsCredentialFormValues = {
  name: '',
  formName: '',
  baseUrl: DEFAULT_CHEFS_BASE_URL,
  formId: '',
  apiKey: '',
};

function valuesFromCredential(credential: ChefsCredentialSummary): ChefsCredentialFormValues {
  return {
    name: credential.name,
    formName: credential.formName,
    baseUrl: credential.baseUrl || DEFAULT_CHEFS_BASE_URL,
    formId: credential.formId,
    apiKey: '',
  };
}

function FieldError({ message }: Readonly<{ message?: string }>) {
  return message ? <p className="text-sm text-red-600">{message}</p> : null;
}

export function ChefsCredentialDialog({
  tenantId,
  open,
  onOpenChange,
  onCreated,
  editing = null,
  onUpdated,
}: Readonly<ChefsCredentialDialogProps>) {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (input: ChefsCredentialFormValues) => createChefsCredential({ tenantId, input }),
    onSuccess: async (created) => {
      queryClient.setQueryData<ChefsCredentialList>(chefsCredentialsQueryKey(tenantId), (current) => {
        const list = current?.credentials ?? [];
        const credentials = list.some((item) => item.id === created.id) ? list : [...list, created];
        return { canCreate: current?.canCreate ?? true, credentials };
      });
      onCreated(created);
      onOpenChange(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateChefsCredentialInput) =>
      updateChefsCredential({ tenantId, credentialId: editing?.id ?? '', input }),
    onSuccess: async (updated) => {
      queryClient.setQueryData<ChefsCredentialList>(chefsCredentialsQueryKey(tenantId), (current) =>
        current
          ? { ...current, credentials: current.credentials.map((item) => (item.id === updated.id ? updated : item)) }
          : current,
      );
      onUpdated?.(updated);
      onOpenChange(false);
    },
  });

  const isEditing = Boolean(editing);
  const activeMutation = isEditing ? updateMutation : createMutation;

  const errorMessage = activeMutation.isError
    ? extractErrorMessage(activeMutation.error, 'Could not save the CHEFS credential')
    : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          createMutation.reset();
          updateMutation.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit CHEFS credential' : 'Add CHEFS credential'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Updates this CHEFS Form Authentication credential in n8n. The API key stays on the server.'
              : 'Saves a CHEFS Form Authentication credential on this project in n8n. The API key stays on the server.'}
          </DialogDescription>
        </DialogHeader>
        <ChefsCredentialForm
          key={editing?.id ?? 'new'}
          defaultValues={editing ? valuesFromCredential(editing) : EMPTY_VALUES}
          isEditing={isEditing}
          isPending={activeMutation.isPending}
          errorMessage={errorMessage}
          onCancel={() => onOpenChange(false)}
          onSubmit={(values) =>
            isEditing
              ? updateMutation.mutate({ ...values, apiKey: values.apiKey || undefined })
              : createMutation.mutate(values)
          }
        />
      </DialogContent>
    </Dialog>
  );
}

interface ChefsCredentialFormProps {
  defaultValues: ChefsCredentialFormValues;
  isEditing: boolean;
  isPending: boolean;
  errorMessage: string;
  onSubmit: (values: ChefsCredentialFormValues) => void;
  onCancel: () => void;
}

function ChefsCredentialForm({
  defaultValues,
  isEditing,
  isPending,
  errorMessage,
  onSubmit,
  onCancel,
}: Readonly<ChefsCredentialFormProps>) {
  const [showApiKey, setShowApiKey] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ChefsCredentialFormValues>({
    resolver: zodResolver(isEditing ? editChefsCredentialFormSchema : createChefsCredentialFormSchema),
    defaultValues,
    mode: 'onTouched',
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="chefs-credential-name">
            Credential name <span className="text-red-500">*</span>
          </Label>
          <Input id="chefs-credential-name" placeholder="e.g. Intake form" {...register('name')} />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chefs-credential-form-name">
            Form name <span className="text-red-500">*</span>
          </Label>
          <Input id="chefs-credential-form-name" placeholder="e.g. My CHEFS Form" {...register('formName')} />
          <FieldError message={errors.formName?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chefs-credential-base-url">
            CHEFS base URL <span className="text-red-500">*</span>
          </Label>
          <Input id="chefs-credential-base-url" {...register('baseUrl')} />
          <FieldError message={errors.baseUrl?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chefs-credential-form-id">
            Form ID <span className="text-red-500">*</span>
          </Label>
          <Input id="chefs-credential-form-id" placeholder="e.g. abc123-def456" {...register('formId')} />
          <FieldError message={errors.formId?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="chefs-credential-api-key">
            API key {!isEditing && <span className="text-red-500">*</span>}
          </Label>
          <div className="relative">
            <Input
              id="chefs-credential-api-key"
              type={showApiKey ? 'text' : 'password'}
              placeholder={isEditing ? 'Leave blank to keep the current API key' : 'Form API key'}
              className="pr-10"
              {...register('apiKey')}
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
          <FieldError message={errors.apiKey?.message} />
        </div>
        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
      </div>
      <DialogFooter className="mt-6">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid || isPending}>
          {isPending ? 'Saving...' : isEditing ? 'Save changes' : 'Save credential'}
        </Button>
      </DialogFooter>
    </form>
  );
}
