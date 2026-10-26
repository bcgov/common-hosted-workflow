import { describe, expect, it } from 'vitest';
import { GOLDDR_EDIT_MESSAGE } from '../../../src/api/constants/golddr';
import { createGoldDrEditGuard } from '../../../src/api/helpers/golddr-edit-guard';
import { AppError } from '../../../src/api/utils/errors';

describe('GoldDR edit guard', () => {
  it('lets the change through on Gold', () => {
    expect(createGoldDrEditGuard(false)()).toBeUndefined();
  });

  it('refuses the change on GoldDR with a 503 maintenance error', () => {
    const guard = createGoldDrEditGuard(true);

    expect(guard).toThrow(AppError);
    expect(guard).toThrow(
      expect.objectContaining({
        statusCode: 503,
        message: GOLDDR_EDIT_MESSAGE,
        details: { code: 'GOLDDR_MAINTENANCE' },
      }),
    );
  });
});
