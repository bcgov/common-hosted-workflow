"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const wil_trigger_item_1 = require("../../../../src/api/routes/helpers/wil-trigger-item");
const session = {
    email: 'actor@example.com',
    tenantRoles: [{ tenantId: 't1', roles: ['viewer'] }],
    tenantGroups: [{ tenantId: 't1', groups: ['g1'] }],
};
const button = (metadata) => ({ id: 'tr1', triggerType: 'button', metadata });
(0, vitest_1.describe)('resolveTriggerInput', () => {
    (0, vitest_1.it)('prefers configured button inputValues over the legacy postBody', () => {
        (0, vitest_1.expect)((0, wil_trigger_item_1.resolveTriggerInput)(button({ inputValues: { a: 1 }, postBody: '{"b":2}' }), {})).toEqual({ a: 1 });
    });
    (0, vitest_1.it)('falls back to the parsed postBody and tolerates invalid JSON', () => {
        (0, vitest_1.expect)((0, wil_trigger_item_1.resolveTriggerInput)(button({ postBody: '{"b":2}' }), {})).toEqual({ b: 2 });
        (0, vitest_1.expect)((0, wil_trigger_item_1.resolveTriggerInput)(button({ postBody: 'nope' }), {})).toEqual({});
    });
    (0, vitest_1.it)('uses the submitted body for CHEFS forms', () => {
        (0, vitest_1.expect)((0, wil_trigger_item_1.resolveTriggerInput)({ id: 'tr1', triggerType: 'chefs-form', metadata: {} }, { x: 1 })).toEqual({ x: 1 });
    });
});
(0, vitest_1.describe)('buildWilTriggerItem', () => {
    (0, vitest_1.it)('follows the node output contract', () => {
        const item = (0, wil_trigger_item_1.buildWilTriggerItem)({
            trigger: button({ buttonText: 'Go' }),
            session,
            tenantId: 't1',
            requestBody: {},
            now: new Date('2026-01-01T00:00:00Z'),
        });
        (0, vitest_1.expect)(item.json).toEqual({
            source: 'wil',
            trigger: { id: 'tr1', type: 'button', name: 'Go' },
            actor: { email: 'actor@example.com', tenantId: 't1', roles: ['viewer'], groups: ['g1'] },
            input: {},
            firedAt: '2026-01-01T00:00:00.000Z',
        });
    });
    (0, vitest_1.it)('returns empty roles/groups for another tenant', () => {
        const item = (0, wil_trigger_item_1.buildWilTriggerItem)({ trigger: button({}), session, tenantId: 'other', requestBody: {} });
        (0, vitest_1.expect)(item.json.actor).toMatchObject({ roles: [], groups: [] });
    });
});
