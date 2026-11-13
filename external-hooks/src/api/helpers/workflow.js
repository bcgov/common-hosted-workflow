"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractCredentialIds = extractCredentialIds;
exports.getWorkflowNodes = getWorkflowNodes;
function extractCredentialIds(nodes) {
    const ids = new Set();
    for (const node of nodes) {
        if (!node.credentials)
            continue;
        for (const cred of Object.values(node.credentials)) {
            if (cred?.id)
                ids.add(cred.id);
        }
    }
    return Array.from(ids);
}
function getWorkflowNodes(workflow) {
    if (!workflow || typeof workflow !== 'object') {
        return [];
    }
    const nodes = Reflect.get(workflow, 'nodes');
    return Array.isArray(nodes) ? nodes : [];
}
