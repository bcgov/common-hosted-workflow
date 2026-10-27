import { describe, expect, it } from 'vitest';
import { READONLY_EDIT_MESSAGE } from '../../../src/api/constants/readonly';
import { createReadOnlyEditGuard } from '../../../src/api/helpers/readonly-edit-guard';
import { AppError } from '../../../src/api/utils/errors';

describe('read-only edit guard', () => {
  it('lets the change through on Gold', () => {
    expect(createReadOnlyEditGuard(false)()).toBeUndefined();
  });

  it('refuses the change in read-only mode with a 503 maintenance error', () => {
    const guard = createReadOnlyEditGuard(true);

    expect(guard).toThrow(AppError);
    expect(guard).toThrow(
      expect.objectContaining({
        statusCode: 503,
        message: READONLY_EDIT_MESSAGE,
        details: { code: 'READONLY_MODE' },
      }),
    );
  });
});
