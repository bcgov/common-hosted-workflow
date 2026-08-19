import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TRIGGER_MANAGE_ROLE_VALUES } from '../../../lib/trigger-manage-roles';
import { useHasTenantRoles, useTenantRolesById } from '../../../state/session';
import { useTriggers } from './use-triggers';
import { canUserSeeTrigger } from './trigger-utils';
import { TRIGGER_TYPES } from '../../../constants/constants';
import { TriggerListContent } from './trigger-list-content';
import { TriggerFormPane } from './trigger-form-pane';
import { MobileDetailView } from '../mobile-detail-view';

interface TriggersTabProps {
  tenantId: string;
  isPersonalTenant: boolean;
  userEmail: string;
  isMobile?: boolean;
}

export function TriggersTab({ tenantId, isPersonalTenant, userEmail, isMobile = false }: Readonly<TriggersTabProps>) {
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
    isDeleting,
    pendingDeleteTrigger,
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
    requestDelete,
    confirmDelete,
    cancelDelete,
    confirmNavigation,
    cancelNavigation,
  } = useTriggers({ tenantId, isPersonalTenant, userEmail });

  const visibleTriggers = canManage
    ? triggers
    : triggers.filter((t) => canUserSeeTrigger(t, userTenantRoles, userEmail));

  const deleteTriggerLabel =
    pendingDeleteTrigger?.config.type === TRIGGER_TYPES.CHEFS_FORM
      ? pendingDeleteTrigger.config.formName || 'this trigger'
      : pendingDeleteTrigger?.config.buttonText || 'this trigger';

  // --- Mobile: full-screen detail/edit view ---
  if (isMobile && formMode !== 'idle') {
    return (
      <>
        <MobileDetailView title={formPaneTitle} onBack={cancel}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#2d2d2d]">{formPaneTitle}</h2>
              <p className="text-[13px] text-[#605e5c]">* required</p>
            </div>
            <div className="h-px bg-[#e0dedc]" />
          </div>
          <div className="mt-4">
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
        </MobileDetailView>

        <ConfirmDialog
          open={hasPendingNav}
          title="Unsaved changes"
          description="You have unsaved changes. Please save or cancel before switching triggers."
          confirmLabel="Discard changes"
          cancelLabel="Stay"
          confirmVariant="destructive"
          onConfirm={confirmNavigation}
          onCancel={cancelNavigation}
        />

        <ConfirmDialog
          open={pendingDeleteTrigger !== null}
          title="Delete trigger"
          description={`Are you sure you want to delete "${deleteTriggerLabel}"? This action cannot be undone.`}
          confirmLabel="Delete"
          confirmVariant="destructive"
          isConfirming={isDeleting}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      </>
    );
  }

  // --- Mobile: card list view ---
  if (isMobile) {
    return (
      <>
        <div className="space-y-3">
          <TriggerListContent
            canManage={canManage}
            visibleTriggers={visibleTriggers}
            selectedTriggerId={selectedTriggerId}
            callbackTriggerId={callbackTriggerId}
            openCreate={openCreate}
            selectTrigger={selectTrigger}
            requestDelete={requestDelete}
            openChefsPreview={openChefsPreview}
            triggerCallback={triggerCallback}
          />
        </div>

        <ConfirmDialog
          open={pendingDeleteTrigger !== null}
          title="Delete trigger"
          description={`Are you sure you want to delete "${deleteTriggerLabel}"? This action cannot be undone.`}
          confirmLabel="Delete"
          confirmVariant="destructive"
          isConfirming={isDeleting}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      </>
    );
  }

  // --- Desktop: split-pane layout (unchanged) ---
  return (
    <>
      <div className="grid grid-cols-[minmax(320px,420px)_1fr] gap-0 min-h-[500px] rounded-xl border border-[var(--bc-border)] bg-white shadow-sm overflow-hidden">
        {/* List pane */}
        <div className="overflow-y-auto border-r border-[var(--bc-border)] p-4 space-y-3">
          <TriggerListContent
            canManage={canManage}
            visibleTriggers={visibleTriggers}
            selectedTriggerId={selectedTriggerId}
            callbackTriggerId={callbackTriggerId}
            openCreate={openCreate}
            selectTrigger={selectTrigger}
            requestDelete={requestDelete}
            openChefsPreview={openChefsPreview}
            triggerCallback={triggerCallback}
          />
        </div>

        {/* Form / detail pane */}
        <div className="p-6 overflow-y-auto bg-white">
          {formMode !== 'idle' && (
            <div className="mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#2d2d2d]">{formPaneTitle}</h2>
                <p className="text-[13px] text-[#605e5c]">* indicates a required field</p>
              </div>
              <div className="h-px bg-[#e0dedc]" />
            </div>
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

      <ConfirmDialog
        open={hasPendingNav}
        title="Unsaved changes"
        description="You have unsaved changes. Please save or cancel before switching triggers."
        confirmLabel="Discard changes"
        cancelLabel="Stay"
        confirmVariant="destructive"
        onConfirm={confirmNavigation}
        onCancel={cancelNavigation}
      />

      <ConfirmDialog
        open={pendingDeleteTrigger !== null}
        title="Delete trigger"
        description={`Are you sure you want to delete "${deleteTriggerLabel}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="destructive"
        isConfirming={isDeleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
}
