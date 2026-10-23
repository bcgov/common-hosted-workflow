import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@config', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/config')>();
  return { ...original, IS_GOLDDR: true };
});

type HookFn = (...args: unknown[]) => Promise<unknown>;
type HookConfig = Record<string, Record<string, HookFn[]>>;

let hooks: HookConfig;

describe('n8n hook registration on GoldDR', () => {
  // The first import pulls in the whole route tree, which is slow on a cold start.
  beforeAll(async () => {
    const imported = (await import('../../src/api/hooks')) as unknown as { default?: HookConfig } & HookConfig;
    hooks = (imported.default ?? imported) as HookConfig;
  }, 30_000);

  it.each([
    ['workflow', 'create'],
    ['workflow', 'update'],
    ['workflow', 'delete'],
    ['credentials', 'create'],
    ['credentials', 'update'],
    ['credentials', 'delete'],
  ])('blocks %s.%s', async (area, event) => {
    expect(hooks[area][event]).toHaveLength(1);
    await expect(hooks[area][event][0]()).rejects.toMatchObject({ statusCode: 503 });
  });

  it('leaves activating and deactivating a workflow alone so safe workflows keep starting', async () => {
    expect(hooks.workflow.activate).toBeUndefined();
    expect(hooks.workflow.deactivate).toBeUndefined();
  });

  it('keeps the existing hooks', async () => {
    expect(hooks.workflow.afterUpdate).toHaveLength(1);
    expect(hooks.n8n.ready).toHaveLength(1);
    expect(hooks.frontend.settings).toHaveLength(1);
  });
});
