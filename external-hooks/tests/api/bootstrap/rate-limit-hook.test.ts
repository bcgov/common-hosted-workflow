import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProjectRateLimitService } from '../../../src/api/services/project-rate-limit.service';
import { RateLimitExceededError } from '../../../src/api/services/project-rate-limit.service';
import {
  buildRateLimitPreExecuteHandler,
  createMemoizedRateLimitServiceGetter,
  createRateLimitPreExecuteHandler,
  type RateLimitHookDeps,
} from '../../../src/api/bootstrap/rate-limit-hook';
import { buildN8nRuntimeContext } from '../../../src/api/bootstrap/n8n-repositories';
import { buildCustomRepositories } from '../../../src/api/bootstrap/custom-repositories';

// The memoized getter under test delegates to the bootstrap builders; mock
// them so no test requires n8n internals or opens a drizzle pool.
vi.mock('../../../src/api/bootstrap/n8n-repositories', () => ({
  buildN8nRuntimeContext: vi.fn(),
}));
vi.mock('../../../src/api/bootstrap/custom-repositories', () => ({
  buildCustomRepositories: vi.fn(),
}));

const WORKFLOW_ID = 'wf-100';

function makeFakeService() {
  return { enforceExecution: vi.fn().mockResolvedValue(undefined) };
}

function asService(fake: ReturnType<typeof makeFakeService>): ProjectRateLimitService {
  return fake as unknown as ProjectRateLimitService;
}

function makeWorkflow(): { id: string } {
  return { id: WORKFLOW_ID };
}

/** Handler on fully fake deps; every dep observable via the returned refs. */
function makeHandler(overrides: Partial<RateLimitHookDeps> = {}) {
  const service = makeFakeService();
  const deps: RateLimitHookDeps = {
    isEnabled: () => true,
    resolveRateLimitService: vi.fn().mockResolvedValue(asService(service)),
    isWorkerProcess: vi.fn().mockReturnValue(false),
    ...overrides,
  };
  return { handler: buildRateLimitPreExecuteHandler(deps), deps, service };
}

/** Loads a fresh hook module against the currently stubbed env (config
 * values such as EXECUTIONS_MODE are read at module load). */
async function loadFreshHookModule() {
  vi.resetModules();
  return await import('../../../src/api/bootstrap/rate-limit-hook');
}

describe('buildRateLimitPreExecuteHandler', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('never resolves the service when the kill switch is off', async () => {
    const { handler, deps } = makeHandler({ isEnabled: () => false });

    await expect(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();

    expect(deps.resolveRateLimitService).not.toHaveBeenCalled();
    expect(deps.isWorkerProcess).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each(['manual', 'internal', 'evaluation', 'eval_manual'])(
    'never resolves the service for exempt mode %s',
    async (mode) => {
      const { handler, deps } = makeHandler();

      await expect(handler(makeWorkflow(), mode)).resolves.toBeUndefined();

      expect(deps.resolveRateLimitService).not.toHaveBeenCalled();
      expect(deps.isWorkerProcess).not.toHaveBeenCalled();
    },
  );

  it('enforces against the workflow id for production modes', async () => {
    const { handler, service } = makeHandler();

    await expect(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();

    expect(service.enforceExecution).toHaveBeenCalledTimes(1);
    expect(service.enforceExecution).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: WORKFLOW_ID, mode: 'trigger' }),
    );
  });

  it('propagates the exact RateLimitExceededError the service threw', async () => {
    const breach = new RateLimitExceededError('Weekly execution limit reached for project');
    const service = makeFakeService();
    service.enforceExecution.mockRejectedValue(breach);
    const { handler } = makeHandler({
      resolveRateLimitService: vi.fn().mockResolvedValue(asService(service)),
    });

    await expect(handler(makeWorkflow(), 'trigger')).rejects.toBe(breach);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('fails open on arbitrary service errors, logging them once', async () => {
    const service = makeFakeService();
    service.enforceExecution.mockRejectedValue(new Error('custom DB unreachable'));
    const { handler } = makeHandler({
      resolveRateLimitService: vi.fn().mockResolvedValue(asService(service)),
    });

    await expect(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failing open'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(WORKFLOW_ID));
  });

  it('returns silently when the service is disabled in this process', async () => {
    // Real disabled getter (empty database URL) wired through the policy:
    // the hook must return, never touch the builders, and the getter must
    // log the disabled state exactly once across invocations.
    const service = makeFakeService();
    const { handler } = makeHandler({
      resolveRateLimitService: createMemoizedRateLimitServiceGetter(''),
    });

    await expect(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();
    await expect(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();

    expect(service.enforceExecution).not.toHaveBeenCalled();
    expect(buildN8nRuntimeContext).not.toHaveBeenCalled();
    expect(buildCustomRepositories).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CUSTOM_DATABASE_URL is not set'));
  });
});

describe('buildRateLimitPreExecuteHandler counting-process decision', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function loadHandlerWithDeps(deps: RateLimitHookDeps) {
    const module = await loadFreshHookModule();
    return module.buildRateLimitPreExecuteHandler(deps);
  }

  it('counts usage in regular mode without probing the process type', async () => {
    vi.stubEnv('EXECUTIONS_MODE', 'regular');
    const service = makeFakeService();
    const isWorkerProcess = vi.fn().mockReturnValue(true); // must not be consulted
    const handler = await loadHandlerWithDeps({
      isEnabled: () => true,
      resolveRateLimitService: vi.fn().mockResolvedValue(asService(service)),
      isWorkerProcess,
    });

    await handler(makeWorkflow(), 'trigger');

    expect(service.enforceExecution).toHaveBeenCalledWith({
      workflowId: WORKFLOW_ID,
      mode: 'trigger',
      countUsage: true,
    });
    expect(isWorkerProcess).not.toHaveBeenCalled();
  });

  it('counts usage on the worker in queue mode', async () => {
    vi.stubEnv('EXECUTIONS_MODE', 'queue');
    const service = makeFakeService();
    const handler = await loadHandlerWithDeps({
      isEnabled: () => true,
      resolveRateLimitService: vi.fn().mockResolvedValue(asService(service)),
      isWorkerProcess: () => true,
    });

    await handler(makeWorkflow(), 'webhook');

    expect(service.enforceExecution).toHaveBeenCalledWith({
      workflowId: WORKFLOW_ID,
      mode: 'webhook',
      countUsage: true,
    });
  });

  it('runs a check-only pass without counting on main in queue mode', async () => {
    vi.stubEnv('EXECUTIONS_MODE', 'queue');
    const service = makeFakeService();
    const handler = await loadHandlerWithDeps({
      isEnabled: () => true,
      resolveRateLimitService: vi.fn().mockResolvedValue(asService(service)),
      isWorkerProcess: () => false,
    });

    await handler(makeWorkflow(), 'trigger');

    expect(service.enforceExecution).toHaveBeenCalledWith({
      workflowId: WORKFLOW_ID,
      mode: 'trigger',
      countUsage: false,
    });
  });
});

describe('createMemoizedRateLimitServiceGetter', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('memoizes the disabled state when the database URL is empty', async () => {
    const getter = createMemoizedRateLimitServiceGetter('');

    await expect(getter()).resolves.toBeNull();
    await expect(getter()).resolves.toBeNull();

    expect(buildN8nRuntimeContext).not.toHaveBeenCalled();
    expect(buildCustomRepositories).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CUSTOM_DATABASE_URL is not set'));
  });

  it('builds the service once and reuses the same instance across calls', async () => {
    vi.mocked(buildN8nRuntimeContext).mockReturnValue({ n8nRepositories: {} } as any);
    vi.mocked(buildCustomRepositories).mockReturnValue({ projectRateLimit: {} } as any);

    const getter = createMemoizedRateLimitServiceGetter('postgres://localhost/custom');
    const [first, second] = await Promise.all([getter(), getter()]);

    expect(buildN8nRuntimeContext).toHaveBeenCalledTimes(1);
    expect(buildCustomRepositories).toHaveBeenCalledTimes(1);
    expect(buildCustomRepositories).toHaveBeenCalledWith('postgres://localhost/custom');
    expect(first).toBe(second);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('fails open when the build fails and retries on the next call', async () => {
    vi.mocked(buildN8nRuntimeContext).mockImplementation(() => {
      throw new Error('DI container not ready');
    });
    const getter = createMemoizedRateLimitServiceGetter('postgres://localhost/custom');

    await expect(getter()).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failing open'));

    // The memo is not poisoned: the next execution retries the build.
    vi.mocked(buildN8nRuntimeContext).mockReturnValue({ n8nRepositories: {} } as any);
    vi.mocked(buildCustomRepositories).mockReturnValue({} as any);
    await expect(getter()).resolves.toBeDefined();
    expect(buildN8nRuntimeContext).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('createRateLimitPreExecuteHandler (default wiring)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Module-mock instances survive vi.resetModules(), so clear the shared
    // builder mocks before asserting fresh call counts.
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('disables enforcement and logs once when CUSTOM_DATABASE_URL is missing', async () => {
    vi.stubEnv('CUSTOM_DATABASE_URL', '');
    vi.stubEnv('EXECUTIONS_MODE', 'regular');
    const { createRateLimitPreExecuteHandler: buildDefaultHandler } = await loadFreshHookModule();
    const handler = buildDefaultHandler();

    await expect(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();
    await expect(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('CUSTOM_DATABASE_URL is not set'));
  });

  it('never resolves the service when the kill switch is off', async () => {
    vi.stubEnv('CUSTOM_DATABASE_URL', '');
    vi.stubEnv('EXECUTIONS_MODE', 'regular');
    vi.stubEnv('RATE_LIMIT_ENFORCEMENT_ENABLED', 'false');
    const { createRateLimitPreExecuteHandler: buildDefaultHandler } = await loadFreshHookModule();
    const handler = buildDefaultHandler();

    await expect(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();

    // Not even the disabled-state log: the kill switch precedes resolution.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('memoizes the service across executions', async () => {
    vi.stubEnv('CUSTOM_DATABASE_URL', 'postgres://localhost/custom');
    vi.stubEnv('EXECUTIONS_MODE', 'regular');
    const { createRateLimitPreExecuteHandler: buildDefaultHandler } = await loadFreshHookModule();
    // Import the mocked builders after the reset so the fns below are the
    // exact instances the freshly loaded hook module bound.
    const { buildN8nRuntimeContext: buildContext } = await import('../../../src/api/bootstrap/n8n-repositories');
    const { buildCustomRepositories: buildRepos } = await import('../../../src/api/bootstrap/custom-repositories');

    const findProjectIds = vi.fn().mockResolvedValue([]);
    vi.mocked(buildContext).mockReturnValue({
      n8nRepositories: { sharedWorkflow: { findProjectIds } },
    } as any);
    vi.mocked(buildRepos).mockReturnValue({} as any);

    const handler = buildDefaultHandler();
    await handler(makeWorkflow(), 'trigger');
    await handler(makeWorkflow(), 'trigger');

    expect(buildContext).toHaveBeenCalledTimes(1);
    expect(buildRepos).toHaveBeenCalledTimes(1);
    expect(buildRepos).toHaveBeenCalledWith('postgres://localhost/custom');
    // The same memoized service instance served both runs end to end.
    expect(findProjectIds).toHaveBeenCalledTimes(2);
    expect(findProjectIds).toHaveBeenCalledWith(WORKFLOW_ID);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
