import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActionDetailPane } from '../../../src/components/action-detail-pane';
import { TriggerListItem } from '../../../src/components/wil/trigger/trigger-list-item';
import { sessionState } from '../../../src/state/session';
import type { WilActionItem } from '../../../src/services/backend/wil';
import type { Trigger } from '../../../src/services/backend/trigger-types';

vi.mock('../../../src/components/action-handlers/action-detail-header', () => ({
  ActionDetailHeader: () => <h2>Action header</h2>,
}));
vi.mock('../../../src/components/action-handlers/get-approval-handler', () => ({
  GetApprovalHandler: () => <button type="button">Approve</button>,
}));

const userEmail = 'me@gov.bc.ca';

const action = { actionType: 'getapproval', status: 'pending' } as WilActionItem;

function groupAction(overrides: Partial<WilActionItem>) {
  return { ...action, id: 'action-1', actorType: 'group', actorId: 'my-team-group', ...overrides } as WilActionItem;
}

function renderPane(paneAction: WilActionItem) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ActionDetailPane action={paneAction} tenantId="tenant-1" />
    </QueryClientProvider>,
  );
}

const buttonTrigger = {
  id: 'trigger-1',
  config: { type: 'button', buttonText: 'Run report' },
} as unknown as Trigger;

function renderTriggerItem(canManage: boolean) {
  return render(
    <TriggerListItem
      trigger={buttonTrigger}
      isSelected={false}
      canManage={canManage}
      isCallbackPending={false}
      onClick={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onTriggerCallback={vi.fn()}
    />,
  );
}

describe('GoldDR restrictions in the WIL components', () => {
  beforeEach(() => {
    sessionState.goldDr = false;
    sessionState.session = { user: { email: userEmail } } as never;
  });

  afterEach(() => {
    sessionState.goldDr = false;
    sessionState.session = null as never;
  });

  describe('action detail pane', () => {
    it('keeps action controls enabled on Gold', () => {
      renderPane(action);

      expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    });

    it('disables action controls on GoldDR while the details stay visible', () => {
      sessionState.goldDr = true;

      renderPane(action);

      expect(screen.getByText('Action header')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    });

    describe('claim gate for a group action', () => {
      it('lets a group member claim a pending action on Gold', () => {
        renderPane(groupAction({ status: 'pending' }));

        expect(screen.getByRole('button', { name: 'Claim action' })).toBeEnabled();
      });

      it('disables Claim action on GoldDR', () => {
        sessionState.goldDr = true;

        renderPane(groupAction({ status: 'pending' }));

        expect(screen.getByRole('button', { name: 'Claim action' })).toBeDisabled();
      });

      it('disables Start and Unclaim on GoldDR for an action the user claimed', () => {
        sessionState.goldDr = true;

        renderPane(groupAction({ status: 'claimed', claimedBy: userEmail }));

        expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Unclaim' })).toBeDisabled();
      });

      it('disables Unclaim on GoldDR for an action claimed by someone else', () => {
        sessionState.goldDr = true;

        renderPane(groupAction({ status: 'claimed', claimedBy: 'sam.jones@gov.bc.ca' }));

        expect(screen.getByRole('button', { name: 'Unclaim' })).toBeDisabled();
      });

      it('disables Unclaim and the action controls on GoldDR once the user has started the action', () => {
        sessionState.goldDr = true;

        renderPane(groupAction({ status: 'in_progress', claimedBy: userEmail }));

        expect(screen.getByRole('button', { name: 'Unclaim' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
      });
    });
  });

  describe('trigger list item', () => {
    it('lets a viewer run a trigger on Gold', () => {
      renderTriggerItem(false);

      expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    });

    it('disables running a trigger on GoldDR', () => {
      sessionState.goldDr = true;

      renderTriggerItem(false);

      expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    });

    it('lets a manager run a trigger on Gold', () => {
      renderTriggerItem(true);

      expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
    });

    it('disables running a trigger for a manager on GoldDR', () => {
      sessionState.goldDr = true;

      renderTriggerItem(true);

      expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    });
  });
});
