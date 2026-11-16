import { describe, expect, it, vi } from 'vitest';
import { buildSkipChefsCallbackBody } from '../../../src/components/wil/trigger/trigger-chefs-preview';
import type { HostSubmitDetail } from '../../../src/components/chefs/types';

vi.mock('../../../src/services/backend/triggers', () => ({ getTriggerChefsToken: vi.fn(), callbackTrigger: vi.fn() }));
vi.mock('../../../src/services/backend/axios', () => ({ getStoredAppToken: vi.fn() }));

const detail: HostSubmitDetail = {
  data: { firstName: 'Ada', age: 36, address: { city: 'Victoria' } },
  submission: { data: { firstName: 'Ada' }, state: 'submitted' },
  formId: 'form-1',
  formName: 'Intake',
  timestamp: '2026-11-16T10:00:00.000Z',
  isDraft: false,
};

describe('buildSkipChefsCallbackBody', () => {
  it('returns all form field values as a flat object', () => {
    expect(buildSkipChefsCallbackBody(detail)).toEqual({
      firstName: 'Ada',
      age: 36,
      address: { city: 'Victoria' },
    });
  });

  it('returns a new object rather than the original data reference', () => {
    expect(buildSkipChefsCallbackBody(detail)).not.toBe(detail.data);
  });
});
