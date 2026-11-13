"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const project_rate_limit_service_1 = require("../../../src/api/services/project-rate-limit.service");
const rate_limit_hook_1 = require("../../../src/api/bootstrap/rate-limit-hook");
const n8n_repositories_1 = require("../../../src/api/bootstrap/n8n-repositories");
const custom_repositories_1 = require("../../../src/api/bootstrap/custom-repositories");
// The memoized getter under test delegates to the bootstrap builders; mock
// them so no test requires n8n internals or opens a drizzle pool.
vitest_1.vi.mock('../../../src/api/bootstrap/n8n-repositories', () => ({
    buildN8nRuntimeContext: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('../../../src/api/bootstrap/custom-repositories', () => ({
    buildCustomRepositories: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('../../../src/api/bootstrap/services', () => ({
    tryResolveNodeMailerService: vitest_1.vi.fn().mockReturnValue(null),
}));
const WORKFLOW_ID = 'wf-100';
function makeFakeService() {
    return { enforceExecution: vitest_1.vi.fn().mockResolvedValue(undefined) };
}
function asService(fake) {
    return fake;
}
function makeWorkflow() {
    return { id: WORKFLOW_ID };
}
/** Handler on fully fake deps; every dep observable via the returned refs. */
function makeHandler(overrides = {}) {
    const service = makeFakeService();
    const deps = {
        isEnabled: () => true,
        resolveRateLimitService: vitest_1.vi.fn().mockResolvedValue(asService(service)),
        isWorkerProcess: vitest_1.vi.fn().mockReturnValue(false),
        ...overrides,
    };
    return { handler: (0, rate_limit_hook_1.buildRateLimitPreExecuteHandler)(deps), deps, service };
}
/** Loads a fresh hook module against the currently stubbed env (config
 * values such as EXECUTIONS_MODE are read at module load). */
async function loadFreshHookModule() {
    vitest_1.vi.resetModules();
    return await Promise.resolve().then(() => __importStar(require('../../../src/api/bootstrap/rate-limit-hook')));
}
(0, vitest_1.describe)('buildRateLimitPreExecuteHandler', () => {
    let errorSpy;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        errorSpy = vitest_1.vi.spyOn(console, 'error').mockImplementation(() => { });
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
        vitest_1.vi.unstubAllEnvs();
    });
    (0, vitest_1.it)('never resolves the service when the kill switch is off', async () => {
        const { handler, deps } = makeHandler({ isEnabled: () => false });
        await (0, vitest_1.expect)(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();
        (0, vitest_1.expect)(deps.resolveRateLimitService).not.toHaveBeenCalled();
        (0, vitest_1.expect)(deps.isWorkerProcess).not.toHaveBeenCalled();
        (0, vitest_1.expect)(errorSpy).not.toHaveBeenCalled();
    });
    vitest_1.it.each(['manual', 'internal', 'evaluation', 'eval_manual'])('never resolves the service for exempt mode %s', async (mode) => {
        const { handler, deps } = makeHandler();
        await (0, vitest_1.expect)(handler(makeWorkflow(), mode)).resolves.toBeUndefined();
        (0, vitest_1.expect)(deps.resolveRateLimitService).not.toHaveBeenCalled();
        (0, vitest_1.expect)(deps.isWorkerProcess).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('enforces against the workflow id for production modes', async () => {
        const { handler, service } = makeHandler();
        await (0, vitest_1.expect)(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();
        (0, vitest_1.expect)(service.enforceExecution).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(service.enforceExecution).toHaveBeenCalledWith(vitest_1.expect.objectContaining({ workflowId: WORKFLOW_ID, mode: 'trigger' }));
    });
    (0, vitest_1.it)('propagates the exact RateLimitExceededError the service threw', async () => {
        const breach = new project_rate_limit_service_1.RateLimitExceededError('Weekly execution limit reached for project');
        const service = makeFakeService();
        service.enforceExecution.mockRejectedValue(breach);
        const { handler } = makeHandler({
            resolveRateLimitService: vitest_1.vi.fn().mockResolvedValue(asService(service)),
        });
        await (0, vitest_1.expect)(handler(makeWorkflow(), 'trigger')).rejects.toBe(breach);
        (0, vitest_1.expect)(errorSpy).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('fails open on arbitrary service errors, logging them once', async () => {
        const service = makeFakeService();
        service.enforceExecution.mockRejectedValue(new Error('custom DB unreachable'));
        const { handler } = makeHandler({
            resolveRateLimitService: vitest_1.vi.fn().mockResolvedValue(asService(service)),
        });
        await (0, vitest_1.expect)(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('failing open'));
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining(WORKFLOW_ID));
    });
    (0, vitest_1.it)('returns silently when the service is disabled in this process', async () => {
        // Real disabled getter (empty database URL) wired through the policy:
        // the hook must return, never touch the builders, and the getter must
        // log the disabled state exactly once across invocations.
        const service = makeFakeService();
        const { handler } = makeHandler({
            resolveRateLimitService: (0, rate_limit_hook_1.createMemoizedRateLimitServiceGetter)(''),
        });
        await (0, vitest_1.expect)(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();
        await (0, vitest_1.expect)(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();
        (0, vitest_1.expect)(service.enforceExecution).not.toHaveBeenCalled();
        (0, vitest_1.expect)(n8n_repositories_1.buildN8nRuntimeContext).not.toHaveBeenCalled();
        (0, vitest_1.expect)(custom_repositories_1.buildCustomRepositories).not.toHaveBeenCalled();
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('CUSTOM_DATABASE_URL is not set'));
    });
});
(0, vitest_1.describe)('buildRateLimitPreExecuteHandler counting-process decision', () => {
    let errorSpy;
    (0, vitest_1.beforeEach)(() => {
        errorSpy = vitest_1.vi.spyOn(console, 'error').mockImplementation(() => { });
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
        vitest_1.vi.unstubAllEnvs();
    });
    async function loadHandlerWithDeps(deps) {
        const module = await loadFreshHookModule();
        return module.buildRateLimitPreExecuteHandler(deps);
    }
    (0, vitest_1.it)('counts usage in regular mode without probing the process type', async () => {
        vitest_1.vi.stubEnv('EXECUTIONS_MODE', 'regular');
        const service = makeFakeService();
        const isWorkerProcess = vitest_1.vi.fn().mockReturnValue(true); // must not be consulted
        const handler = await loadHandlerWithDeps({
            isEnabled: () => true,
            resolveRateLimitService: vitest_1.vi.fn().mockResolvedValue(asService(service)),
            isWorkerProcess,
        });
        await handler(makeWorkflow(), 'trigger');
        (0, vitest_1.expect)(service.enforceExecution).toHaveBeenCalledWith({
            workflowId: WORKFLOW_ID,
            mode: 'trigger',
            countUsage: true,
        });
        (0, vitest_1.expect)(isWorkerProcess).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('counts usage on the worker in queue mode', async () => {
        vitest_1.vi.stubEnv('EXECUTIONS_MODE', 'queue');
        const service = makeFakeService();
        const handler = await loadHandlerWithDeps({
            isEnabled: () => true,
            resolveRateLimitService: vitest_1.vi.fn().mockResolvedValue(asService(service)),
            isWorkerProcess: () => true,
        });
        await handler(makeWorkflow(), 'webhook');
        (0, vitest_1.expect)(service.enforceExecution).toHaveBeenCalledWith({
            workflowId: WORKFLOW_ID,
            mode: 'webhook',
            countUsage: true,
        });
    });
    (0, vitest_1.it)('runs a check-only pass without counting on main in queue mode', async () => {
        vitest_1.vi.stubEnv('EXECUTIONS_MODE', 'queue');
        const service = makeFakeService();
        const handler = await loadHandlerWithDeps({
            isEnabled: () => true,
            resolveRateLimitService: vitest_1.vi.fn().mockResolvedValue(asService(service)),
            isWorkerProcess: () => false,
        });
        await handler(makeWorkflow(), 'trigger');
        (0, vitest_1.expect)(service.enforceExecution).toHaveBeenCalledWith({
            workflowId: WORKFLOW_ID,
            mode: 'trigger',
            countUsage: false,
        });
    });
});
(0, vitest_1.describe)('createMemoizedRateLimitServiceGetter', () => {
    let errorSpy;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        errorSpy = vitest_1.vi.spyOn(console, 'error').mockImplementation(() => { });
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)('memoizes the disabled state when the database URL is empty', async () => {
        const getter = (0, rate_limit_hook_1.createMemoizedRateLimitServiceGetter)('');
        await (0, vitest_1.expect)(getter()).resolves.toBeNull();
        await (0, vitest_1.expect)(getter()).resolves.toBeNull();
        (0, vitest_1.expect)(n8n_repositories_1.buildN8nRuntimeContext).not.toHaveBeenCalled();
        (0, vitest_1.expect)(custom_repositories_1.buildCustomRepositories).not.toHaveBeenCalled();
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('CUSTOM_DATABASE_URL is not set'));
    });
    (0, vitest_1.it)('builds the service once and reuses the same instance across calls', async () => {
        vitest_1.vi.mocked(n8n_repositories_1.buildN8nRuntimeContext).mockReturnValue({ n8nRepositories: {} });
        vitest_1.vi.mocked(custom_repositories_1.buildCustomRepositories).mockReturnValue({ projectRateLimit: {} });
        const getter = (0, rate_limit_hook_1.createMemoizedRateLimitServiceGetter)('postgres://localhost/custom');
        const [first, second] = await Promise.all([getter(), getter()]);
        (0, vitest_1.expect)(n8n_repositories_1.buildN8nRuntimeContext).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(custom_repositories_1.buildCustomRepositories).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(custom_repositories_1.buildCustomRepositories).toHaveBeenCalledWith('postgres://localhost/custom');
        (0, vitest_1.expect)(first).toBe(second);
        (0, vitest_1.expect)(errorSpy).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('fails open when the build fails and retries on the next call', async () => {
        vitest_1.vi.mocked(n8n_repositories_1.buildN8nRuntimeContext).mockImplementation(() => {
            throw new Error('DI container not ready');
        });
        const getter = (0, rate_limit_hook_1.createMemoizedRateLimitServiceGetter)('postgres://localhost/custom');
        await (0, vitest_1.expect)(getter()).resolves.toBeNull();
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('failing open'));
        // The memo is not poisoned: the next execution retries the build.
        vitest_1.vi.mocked(n8n_repositories_1.buildN8nRuntimeContext).mockReturnValue({ n8nRepositories: {} });
        vitest_1.vi.mocked(custom_repositories_1.buildCustomRepositories).mockReturnValue({});
        await (0, vitest_1.expect)(getter()).resolves.toBeDefined();
        (0, vitest_1.expect)(n8n_repositories_1.buildN8nRuntimeContext).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledTimes(1);
    });
});
(0, vitest_1.describe)('createRateLimitPreExecuteHandler (default wiring)', () => {
    let errorSpy;
    (0, vitest_1.beforeEach)(() => {
        // Module-mock instances survive vi.resetModules(), so clear the shared
        // builder mocks before asserting fresh call counts.
        vitest_1.vi.clearAllMocks();
        errorSpy = vitest_1.vi.spyOn(console, 'error').mockImplementation(() => { });
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
        vitest_1.vi.unstubAllEnvs();
    });
    (0, vitest_1.it)('disables enforcement and logs once when CUSTOM_DATABASE_URL is missing', async () => {
        vitest_1.vi.stubEnv('CUSTOM_DATABASE_URL', '');
        vitest_1.vi.stubEnv('EXECUTIONS_MODE', 'regular');
        const { createRateLimitPreExecuteHandler: buildDefaultHandler } = await loadFreshHookModule();
        const handler = buildDefaultHandler();
        await (0, vitest_1.expect)(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();
        await (0, vitest_1.expect)(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(errorSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('CUSTOM_DATABASE_URL is not set'));
    });
    (0, vitest_1.it)('never resolves the service when the kill switch is off', async () => {
        vitest_1.vi.stubEnv('CUSTOM_DATABASE_URL', '');
        vitest_1.vi.stubEnv('EXECUTIONS_MODE', 'regular');
        vitest_1.vi.stubEnv('RATE_LIMIT_ENFORCEMENT_ENABLED', 'false');
        const { createRateLimitPreExecuteHandler: buildDefaultHandler } = await loadFreshHookModule();
        const handler = buildDefaultHandler();
        await (0, vitest_1.expect)(handler(makeWorkflow(), 'trigger')).resolves.toBeUndefined();
        // Not even the disabled-state log: the kill switch precedes resolution.
        (0, vitest_1.expect)(errorSpy).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('memoizes the service across executions', async () => {
        vitest_1.vi.stubEnv('CUSTOM_DATABASE_URL', 'postgres://localhost/custom');
        vitest_1.vi.stubEnv('EXECUTIONS_MODE', 'regular');
        const { createRateLimitPreExecuteHandler: buildDefaultHandler } = await loadFreshHookModule();
        // Import the mocked builders after the reset so the fns below are the
        // exact instances the freshly loaded hook module bound.
        const { buildN8nRuntimeContext: buildContext } = await Promise.resolve().then(() => __importStar(require('../../../src/api/bootstrap/n8n-repositories')));
        const { buildCustomRepositories: buildRepos } = await Promise.resolve().then(() => __importStar(require('../../../src/api/bootstrap/custom-repositories')));
        const findProjectIds = vitest_1.vi.fn().mockResolvedValue([]);
        vitest_1.vi.mocked(buildContext).mockReturnValue({
            n8nRepositories: { sharedWorkflow: { findProjectIds } },
        });
        vitest_1.vi.mocked(buildRepos).mockReturnValue({});
        const handler = buildDefaultHandler();
        await handler(makeWorkflow(), 'trigger');
        await handler(makeWorkflow(), 'trigger');
        (0, vitest_1.expect)(buildContext).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(buildRepos).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(buildRepos).toHaveBeenCalledWith('postgres://localhost/custom');
        // The same memoized service instance served both runs end to end.
        (0, vitest_1.expect)(findProjectIds).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(findProjectIds).toHaveBeenCalledWith(WORKFLOW_ID);
        (0, vitest_1.expect)(errorSpy).not.toHaveBeenCalled();
    });
});
