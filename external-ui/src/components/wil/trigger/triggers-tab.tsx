import { IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TRIGGER_MANAGE_ROLE_VALUES } from '../../../lib/trigger-manage-roles';
import { useHasTenantRoles, useTenantRolesById } from '../../../state/session';
import { useTriggers } from './use-triggers';
import { canUserSeeTrigger } from './trigger-utils';
import { TRIGGER_TYPES } from '../../../constants/constants';
import { TriggerListItem } from './trigger-list-item';
import { TriggerFormPane } from './trigger-form-pane';

interface TriggersTabProps {
  tenantId: string;
  isPersonalTenant: boolean;
  userEmail: string;
}

export function TriggersTab({ tenantId, isPersonalTenant, userEmail }: Readonly<TriggersTabProps>) {
  const hasManageRoles = useHasTenantRoles(tenantId, TRIGGER_MANAGE_ROLE_VALUES);
  const canManage = isPersonalTenant || hasManageRoles;
  const userTenantRoles = useTenantRolesById(tenantId);

  const {
    triggers,
    selectedTriggerId,
    selectedTrigger,
    callbackTriggerId,
    formMode,
    triggerType,
    chefsForm,
    buttonForm,
    isSaving,
    buttonCallbackStatus,
    buttonCallbackError,
    formPaneTitle,
    hasPendingNav,
    openCreate,
    openChefsPreview,
    selectTrigger,
    cancel,
    changeTriggerType,
    setChefsForm,
    setButtonForm,
    save,
    triggerCallback,
    confirmNavigation,
    cancelNavigation,
  } = useTriggers({ tenantId, isPersonalTenant, userEmail });

  const visibleTriggers = canManage
    ? triggers
    : triggers.filter((t) => canUserSeeTrigger(t, userTenantRoles, userEmail));

  return (
    <>
      <div className="grid grid-cols-[minmax(320px,420px)_1fr] gap-0 min-h-[500px] rounded-xl border border-[var(--bc-border)] bg-white shadow-sm overflow-hidden">
        {/* List pane */}
        <div className="overflow-y-auto border-r border-[var(--bc-border)] p-4 space-y-3">
          {canManage && (
            <Button type="button" className="w-full" onClick={openCreate}>
              <IconPlus size={16} aria-hidden="true" />
              Create Trigger
            </Button>
          )}
          {visibleTriggers.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--bc-muted)]">No triggers found.</p>
          ) : (
            visibleTriggers.map((trigger) => (
              <TriggerListItem
                key={trigger.id}
                trigger={trigger}
                isSelected={selectedTriggerId === trigger.id}
                canManage={canManage}
                isCallbackPending={callbackTriggerId === trigger.id}
                onClick={() => selectTrigger(trigger, canManage)}
                onEdit={() => selectTrigger(trigger, canManage)}
                onTriggerCallback={() => {
                  if (trigger.config.type === TRIGGER_TYPES.CHEFS_FORM) {
                    openChefsPreview(trigger);
                  } else {
                    triggerCallback(trigger);
                  }
                }}
              />
            ))
          )}
        </div>

        {/* Form / detail pane */}
        <div className="p-6 overflow-y-auto bg-[var(--bc-surface,#f8fafc)]">
          {formMode !== 'idle' && (
            <h2 className="text-base font-semibold text-[var(--bc-text)] mb-4">{formPaneTitle}</h2>
          )}
          <TriggerFormPane
            mode={formMode}
            triggerType={triggerType}
            onTriggerTypeChange={changeTriggerType}
            chefsForm={chefsForm}
            onChefsFormChange={setChefsForm}
            buttonForm={buttonForm}
            onButtonFormChange={setButtonForm}
            onSave={save}
            onCancel={cancel}
            isSaving={isSaving}
            actorsLocked={isPersonalTenant}
            selectedTrigger={selectedTrigger}
            tenantId={tenantId}
            buttonCallbackStatus={buttonCallbackStatus}
            buttonCallbackError={buttonCallbackError}
          />
        </div>
      </div>

      <Dialog
        open={hasPendingNav}
        onOpenChange={(open) => {
          if (!open) cancelNavigation();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Please save or cancel before switching triggers.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancelNavigation}>
              Stay
            </Button>
            <Button type="button" variant="destructive" onClick={confirmNavigation}>
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
