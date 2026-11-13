"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WIL_NODE_MAX_TIMEOUT_SEC = exports.WIL_NODE_DEFAULT_TIMEOUT_SEC = void 0;
exports.parseWilTriggerNode = parseWilTriggerNode;
exports.extractWilTriggerNodes = extractWilTriggerNodes;
exports.findWilTriggerNode = findWilTriggerNode;
exports.validateWilInput = validateWilInput;
const _config_1 = require("@config");
const enum_1 = require("../constants/enum");
// Defaults must mirror the node description: n8n omits parameters equal to their default from saved JSON.
exports.WIL_NODE_DEFAULT_TIMEOUT_SEC = 30;
exports.WIL_NODE_MAX_TIMEOUT_SEC = 120;
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}
function pickEnum(allowed, value, fallback) {
    return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}
function parseSources(value) {
    if (!Array.isArray(value))
        return [...enum_1.WIL_TRIGGER_SOURCES];
    return enum_1.WIL_TRIGGER_SOURCES.filter((source) => value.includes(source));
}
function parseInputSchema(inputSource, params) {
    if (inputSource === 'workflowInputs') {
        const values = asRecord(params.workflowInputs).values;
        if (!Array.isArray(values))
            return [];
        return values.flatMap((entry) => {
            const field = asRecord(entry);
            const name = typeof field.name === 'string' ? field.name.trim() : '';
            return name ? [{ name, type: pickEnum(enum_1.WIL_TRIGGER_INPUT_FIELD_TYPES, field.type, 'string') }] : [];
        });
    }
    return [];
}
/** Parses one n8n node; returns null unless it is an enabled WIL Trigger node with an id. */
function parseWilTriggerNode(node) {
    const raw = asRecord(node);
    if (typeof raw.type !== 'string' || !_config_1.WIL_TRIGGER_NODE_TYPES.includes(raw.type) || raw.disabled === true)
        return null;
    if (typeof raw.id !== 'string' || !raw.id)
        return null;
    const params = asRecord(raw.parameters);
    const nodeName = typeof raw.name === 'string' ? raw.name : '';
    const inputSource = pickEnum(enum_1.WIL_TRIGGER_INPUT_SOURCES, params.inputSource, 'passthrough');
    const timeout = Number(params.responseTimeoutSec ?? exports.WIL_NODE_DEFAULT_TIMEOUT_SEC);
    return {
        nodeId: raw.id,
        nodeName,
        label: typeof params.displayLabel === 'string' && params.displayLabel.trim() ? params.displayLabel.trim() : nodeName,
        description: typeof params.description === 'string' ? params.description : '',
        acceptedSources: parseSources(params.acceptedSources),
        inputSource,
        inputSchema: parseInputSchema(inputSource, params),
        respondMode: pickEnum(enum_1.WIL_TRIGGER_RESPOND_MODES, params.respondMode, 'immediately'),
        responseTimeoutSec: Number.isFinite(timeout)
            ? Math.min(Math.max(Math.trunc(timeout), 1), exports.WIL_NODE_MAX_TIMEOUT_SEC)
            : exports.WIL_NODE_DEFAULT_TIMEOUT_SEC,
    };
}
/** All enabled WIL Trigger nodes in a node list. */
function extractWilTriggerNodes(nodes) {
    if (!Array.isArray(nodes))
        return [];
    return nodes.flatMap((node) => {
        const info = parseWilTriggerNode(node);
        return info ? [info] : [];
    });
}
/** One WIL Trigger node by its (rename-stable) n8n node id. */
function findWilTriggerNode(nodes, nodeId) {
    return extractWilTriggerNodes(nodes).find((info) => info.nodeId === nodeId) ?? null;
}
function matchesType(type, value) {
    switch (type) {
        case 'number':
            return typeof value === 'number' && Number.isFinite(value);
        case 'boolean':
            return typeof value === 'boolean';
        case 'array':
            return Array.isArray(value);
        case 'object':
            return typeof value === 'object' && value !== null && !Array.isArray(value);
        default:
            return typeof value === 'string';
    }
}
/**
 * Validates caller-supplied input values against a node's declared schema.
 * Missing/empty values are allowed (the node fills defaults); wrong types are reported.
 */
function validateWilInput(schema, values) {
    if (schema.length === 0 || values === undefined || values === null)
        return [];
    const provided = asRecord(values);
    return schema.flatMap((field) => {
        const value = provided[field.name];
        if (value === undefined || value === null || value === '')
            return [];
        return matchesType(field.type, value) ? [] : [`"${field.name}" must be of type ${field.type}`];
    });
}
