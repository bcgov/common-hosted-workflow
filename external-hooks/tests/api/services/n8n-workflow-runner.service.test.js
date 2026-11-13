"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const n8n_workflow_runner_service_1 = require("../../../src/api/services/n8n-workflow-runner.service");
const run = (items, lastNodeExecuted = 'Last') => ({
    data: { resultData: { lastNodeExecuted, runData: { Last: [{ data: { main: [items] } }] } } },
});
(0, vitest_1.describe)('extractLastNodeOutput', () => {
    (0, vitest_1.it)('returns the json of a single item', () => {
        (0, vitest_1.expect)((0, n8n_workflow_runner_service_1.extractLastNodeOutput)(run([{ json: { a: 1 } }]))).toEqual({ a: 1 });
    });
    (0, vitest_1.it)('returns an array for several items', () => {
        (0, vitest_1.expect)((0, n8n_workflow_runner_service_1.extractLastNodeOutput)(run([{ json: { a: 1 } }, { json: { a: 2 } }]))).toEqual([{ a: 1 }, { a: 2 }]);
    });
    (0, vitest_1.it)('returns undefined without output or last node', () => {
        (0, vitest_1.expect)((0, n8n_workflow_runner_service_1.extractLastNodeOutput)(run([]))).toBeUndefined();
        (0, vitest_1.expect)((0, n8n_workflow_runner_service_1.extractLastNodeOutput)(run([{ json: {} }], ''))).toBeUndefined();
        (0, vitest_1.expect)((0, n8n_workflow_runner_service_1.extractLastNodeOutput)({})).toBeUndefined();
    });
});
