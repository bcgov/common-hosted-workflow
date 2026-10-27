import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfig() {
  vi.resetModules();
  return import('../src/config');
}

describe('GoldDR detection from CLUSTER', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is GoldDR when CLUSTER=golddr, ignoring case and whitespace', async () => {
    vi.stubEnv('CLUSTER', '  GoldDR ');

    const config = await loadConfig();

    expect(config.CLUSTER).toBe('golddr');
    expect(config.READONLY_MODE).toBe(true);
  });

  it.each(['gold', '', 'golddr-test'])('is not GoldDR when CLUSTER is "%s"', async (value) => {
    vi.stubEnv('CLUSTER', value);

    const config = await loadConfig();

    expect(config.READONLY_MODE).toBe(false);
  });

  it('is not GoldDR when CLUSTER is unset', async () => {
    vi.stubEnv('CLUSTER', undefined);

    const config = await loadConfig();

    expect(config.CLUSTER).toBe('');
    expect(config.READONLY_MODE).toBe(false);
  });
});
