import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { IconKey } from '@tabler/icons-react';
import { Label } from '@/components/ui/label';
import { extractErrorMessage } from '../../shared/error-utils';
import {
  chefsCredentialsQueryKey,
  DEFAULT_CHEFS_BASE_URL,
  listChefsCredentials,
  type ChefsCredentialSummary,
} from '../../../services/backend/chefs-credentials';
import type { ChefsFormTriggerPayload } from '../../../services/backend/trigger-types';
import { ChefsCredentialCombobox } from './chefs-credential-combobox';
import { ChefsCredentialDialog } from './chefs-credential-dialog';
import {
  ActorIdBanner,
  AllowedActorsField,
  AllowedActorsTypeField,
  PostBodyField,
  TriggerFormActions,
  TriggerMethodField,
  TriggerUrlField,
} from './trigger-shared';

export const DEFAULT_CHEFS_FORM: ChefsFormTriggerPayload = {
  type: 'chefs-form',
  n8nCredentialId: '',
  formId: '',
  formName: '',
  baseUrl: DEFAULT_CHEFS_BASE_URL,
  apiKey: '',
  allowedActors: '*',
  allowedActorsType: '',
  callbackWebhookUrl: '',
  postBody: '',
  triggerMethod: 'POST',
  includeActorId: true,
};

interface ChefsFormFieldsProps {
  tenantId: string;
  value: ChefsFormTriggerPayload;
  onChange: (v: ChefsFormTriggerPayload) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  /** When true, Allowed Actors Type and Allowed Actors fields are read-only (personal project). */
  actorsLocked?: boolean;
}

function withSelectedCredential(
  value: ChefsFormTriggerPayload,
  credential: ChefsCredentialSummary,
): ChefsFormTriggerPayload {
  return {
    ...value,
    n8nCredentialId: credential.id,
    formId: credential.formId,
    formName: credential.formName,
    baseUrl: credential.baseUrl || value.baseUrl,
    apiKey: '',
  };
}

export function ChefsFormFields({
  tenantId,
  value,
  onChange,
  onSave,
  onCancel,
  isSaving,
  actorsLocked = false,
}: Readonly<ChefsFormFieldsProps>) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<ChefsCredentialSummary | null>(null);
  const credentialsQuery = useQuery({
    queryKey: chefsCredentialsQueryKey(tenantId),
    queryFn: ({ signal }) => listChefsCredentials({ tenantId, signal }),
  });

  function set<K extends keyof ChefsFormTriggerPayload>(key: K, val: ChefsFormTriggerPayload[K]) {
    onChange({ ...value, [key]: val });
  }

  const credentials = credentialsQuery.data ?? [];
  const selected = credentials.find((credential) => credential.id === value.n8nCredentialId);
  const savedCredentialMissing = Boolean(value.n8nCredentialId) && !selected && !credentialsQuery.isPending;
  const usesLegacyKey = !value.n8nCredentialId && value.apiKey.trim().length > 0;

  const isValid = Boolean(
    value.n8nCredentialId.trim() && value.callbackWebhookUrl.trim() && value.allowedActorsType !== '',
  );

  function selectCredential(credentialId: string) {
    const match = credentials.find((credential) => credential.id === credentialId);
    if (!match) {
      onChange({ ...value, n8nCredentialId: credentialId });
      return;
    }
    onChange(withSelectedCredential(value, match));
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="chefs-credential">
          CHEFS credential <span className="text-red-500">*</span>
        </Label>
        <ChefsCredentialCombobox
          id="chefs-credential"
          credentials={credentials}
          value={value.n8nCredentialId}
          onSelect={selectCredential}
          onAddNew={() => {
            setEditingCredential(null);
            setDialogOpen(true);
          }}
          onEdit={(credential) => {
            setEditingCredential(credential);
            setDialogOpen(true);
          }}
          isLoading={credentialsQuery.isPending}
          savedCredentialMissing={savedCredentialMissing}
          missingLabel={value.formName || 'Saved credential'}
        />
        {credentialsQuery.isError && (
          <p className="text-sm text-red-600">
            {extractErrorMessage(credentialsQuery.error, 'Could not load CHEFS credentials')}
          </p>
        )}
      </div>
      {selected && (
        <div className="rounded-lg border border-border-strong bg-surface-subtle px-3.5 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            <IconKey size={12} aria-hidden="true" />
            From the selected credential
          </p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Form name</dt>
              <dd className="text-foreground">{selected.formName || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Form ID</dt>
              <dd className="text-foreground break-all">{selected.formId || '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Base URL</dt>
              <dd className="text-foreground break-all">{selected.baseUrl || '—'}</dd>
            </div>
          </dl>
        </div>
      )}
      {usesLegacyKey && (
        <p className="text-sm text-[var(--bc-muted)]">
          This trigger still uses a stored API key. Select or add a CHEFS credential to replace it.
        </p>
      )}
      <ChefsCredentialDialog
        tenantId={tenantId}
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditingCredential(null);
        }}
        editing={editingCredential}
        onCreated={(credential) => onChange(withSelectedCredential(value, credential))}
        onUpdated={(credential) => {
          if (credential.id === value.n8nCredentialId) {
            onChange(withSelectedCredential(value, credential));
          }
        }}
      />
      <TriggerMethodField
        id="chefs-trigger-method"
        value={value.triggerMethod}
        onChange={(v) => set('triggerMethod', v)}
      />
      <div className="grid grid-cols-2 gap-4">
        <AllowedActorsTypeField
          id="chefs-actors-type"
          value={value.allowedActorsType}
          onChange={(v) => {
            if (v === 'all') {
              onChange({ ...value, allowedActorsType: 'all', allowedActors: '*' });
            } else {
              onChange({
                ...value,
                allowedActorsType: v,
                allowedActors: value.allowedActorsType === 'all' ? '' : value.allowedActors,
              });
            }
          }}
          disabled={actorsLocked}
        />
        <AllowedActorsField
          id="chefs-allowed-actors"
          value={value.allowedActors}
          onChange={(v) => set('allowedActors', v)}
          required
          disabled={actorsLocked || value.allowedActorsType === 'all'}
        />
      </div>
      <TriggerUrlField
        id="chefs-callback-url"
        label="Callback Webhook URL"
        value={value.callbackWebhookUrl}
        onChange={(v) => set('callbackWebhookUrl', v)}
      />
      <PostBodyField
        id="chefs-post-body"
        value={value.postBody}
        onChange={(v) => set('postBody', v)}
        method={value.triggerMethod}
      />
      <ActorIdBanner method={value.triggerMethod} />
      <TriggerFormActions onSave={onSave} onCancel={onCancel} isSaving={isSaving} isValid={!!isValid} />
    </div>
  );
}
