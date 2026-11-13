"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerDisplayName = triggerDisplayName;
exports.resolveTriggerInput = resolveTriggerInput;
exports.buildWilTriggerItem = buildWilTriggerItem;
const enum_1 = require("../../constants/enum");
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}
function parseJsonObject(text) {
    if (typeof text !== 'string' || !text)
        return {};
    try {
        return asRecord(JSON.parse(text));
    }
    catch {
        return {};
    }
}
/** Display name of a trigger (form name or button label). */
function triggerDisplayName(trigger) {
    const meta = asRecord(trigger.metadata);
    const name = trigger.triggerType === enum_1.WorkflowTriggerTypeEnum.CHEFS_FORM ? meta.formName : meta.buttonText;
    return typeof name === 'string' ? name : '';
}
/**
 * Input handed to the node: button → configured `inputValues` (legacy `postBody` JSON as fallback),
 * CHEFS form → the submitted body.
 */
function resolveTriggerInput(trigger, requestBody) {
    if (trigger.triggerType === enum_1.WorkflowTriggerTypeEnum.CHEFS_FORM)
        return requestBody;
    const meta = asRecord(trigger.metadata);
    const configured = asRecord(meta.inputValues);
    return Object.keys(configured).length > 0 ? configured : parseJsonObject(meta.postBody);
}
/** The single item a WIL Trigger node emits (the node output contract). */
function buildWilTriggerItem(params) {
    const { trigger, session, tenantId } = params;
    return {
        json: {
            source: 'wil',
            trigger: { id: trigger.id, type: trigger.triggerType, name: triggerDisplayName(trigger) },
            actor: {
                email: session.email,
                tenantId,
                roles: session.tenantRoles.find((entry) => entry.tenantId === tenantId)?.roles ?? [],
                groups: session.tenantGroups.find((entry) => entry.tenantId === tenantId)?.groups ?? [],
            },
            input: resolveTriggerInput(trigger, params.requestBody),
            firedAt: (params.now ?? new Date()).toISOString(),
        },
    };
}
