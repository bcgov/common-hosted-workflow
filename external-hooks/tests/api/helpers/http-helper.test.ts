import { describe, expect, it } from 'vitest';
import { formatPatchActionStatusMessage } from '../../../src/api/helpers/http-helper';

describe('formatPatchActionStatusMessage', () => {
  it('returns deletion message for "deleted" status', () => {
    expect(formatPatchActionStatusMessage('deleted')).toBe('The action has been deleted.');
  });

  it('returns generic update message for other statuses', () => {
    expect(formatPatchActionStatusMessage('completed')).toBe('Status updated to completed.');
    expect(formatPatchActionStatusMessage('pending')).toBe('Status updated to pending.');
    expect(formatPatchActionStatusMessage('in_progress')).toBe('Status updated to in_progress.');
  });
});
