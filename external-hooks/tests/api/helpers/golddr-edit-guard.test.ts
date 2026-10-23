import { describe, expect, it } from 'vitest';
import { GOLDDR_EDIT_MESSAGE } from '../../../src/api/constants/golddr';
import { createGoldDrEditGuard } from '../../../src/api/helpers/golddr-edit-guard';
import { AppError } from '../../../src/api/utils/errors';

describe('GoldDR edit guard', () => {
  it('lets the change through on Gold', async () => {
    await expect(createGoldDrEditGuard(false)()).resolves.toBeUndefined();
  });

  it('refuses the change on GoldDR with a 503 maintenance error', async () => {
    const result = createGoldDrEditGuard(true)();

    await expect(result).rejects.toBeInstanceOf(AppError);
    await expect(result).rejects.toMatchObject({
      statusCode: 503,
      message: GOLDDR_EDIT_MESSAGE,
      details: { code: 'GOLDDR_MAINTENANCE' },
    });
  });
});
