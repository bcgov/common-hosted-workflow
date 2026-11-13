"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockN8nEditRoutes = blockN8nEditRoutes;
const express_1 = require("express");
const _config_1 = require("@config");
const readonly_1 = require("../constants/readonly");
function refuse(_req, res) {
    res.status(503).json({ code: 503, message: readonly_1.READONLY_EDIT_MESSAGE, details: { code: readonly_1.READONLY_MAINTENANCE_CODE } });
}
// Management operations that no before-hook covers.
// Keep the paths and HTTP methods aligned with n8n's route definitions.
// Workflow archive/unarchive and workflow/credential transfer are blocked on both APIs; sharing and folder
// transfer are blocked on the editor API (/rest) only, because the public API (/api/v1) has no such routes.
function buildEditRouteBlock() {
    const router = (0, express_1.Router)();
    router.post([
        '/rest/workflows/:id/archive',
        '/rest/workflows/:id/unarchive',
        '/api/v1/workflows/:id/archive',
        '/api/v1/workflows/:id/unarchive',
    ], refuse);
    router.put([
        '/rest/workflows/:id/transfer',
        '/rest/credentials/:id/transfer',
        '/rest/folders/:id/transfer',
        '/api/v1/workflows/:id/transfer',
        '/api/v1/credentials/:id/transfer',
        '/rest/workflows/:id/share',
        '/rest/credentials/:id/share',
    ], refuse);
    return router;
}
/**
 * Read-only mode, refuses workflow and credential management operations and folder transfers.
 * The Express app only becomes available after n8n has registered its routes, so the block is moved to the front
 * of Express 5's router stack; added at the end it would never be reached.
 * This relies on the internal `app.router.stack`, so it fails at startup if the stack is unavailable or the block
 * cannot be identified after registration.
 */
function blockN8nEditRoutes(app, isReadOnly = _config_1.READONLY_MODE) {
    if (!isReadOnly)
        return;
    const router = app.router;
    const stack = router?.stack;
    if (!Array.isArray(stack)) {
        throw new TypeError('Read-only mode could not start: the n8n route list was not found.');
    }
    const block = buildEditRouteBlock();
    app.use(block);
    // Move only the block; leave n8n's route order unchanged.
    const last = stack.at(-1);
    if (last?.handle !== block) {
        throw new TypeError('Read-only mode could not start: the read-only block was not added where expected.');
    }
    stack.unshift(stack.pop());
}
