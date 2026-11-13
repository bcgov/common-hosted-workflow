"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createReadOnlyMiddleware = createReadOnlyMiddleware;
const _config_1 = require("@config");
const readonly_1 = require("../constants/readonly");
const errors_1 = require("../utils/errors");
// Advisory only: tells clients when it is reasonable to retry.
const RETRY_AFTER_SECONDS = '300';
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// POST routes that only read.
const READ_ONLY_POST_SUFFIX = '/chefs-token';
// Endpoints the MultiWebhookWait and CHEFS Resubmit Wait nodes / CHEFS callbacks call while a
// workflow runs. Workflows without WIL nodes stay available in read-only mode, so these must keep
// working. Matches: /multi-webhook-wait/..., /chefs/submissions/register, and the CHEFS callback
// /chefs/<webhookPath> (a single segment that is not "submissions").
const WORKFLOW_RUNTIME_PATH = /^\/(multi-webhook-wait\/|chefs\/submissions\/register$|chefs\/(?!submissions$)[^/]+$)/;
/**
 * In read-only mode, refuses writes to the WIL and custom-integration routes with a 503.
 */
function createReadOnlyMiddleware(isReadOnly = _config_1.READONLY_MODE) {
    return (req, res, next) => {
        const isAllowed = READ_METHODS.has(req.method) ||
            (req.method === 'POST' && req.path.endsWith(READ_ONLY_POST_SUFFIX)) ||
            WORKFLOW_RUNTIME_PATH.test(req.path);
        if (!isReadOnly || isAllowed) {
            return next();
        }
        res.setHeader('Retry-After', RETRY_AFTER_SECONDS);
        return next(new errors_1.AppError(503, readonly_1.READONLY_WRITE_MESSAGE, { code: readonly_1.READONLY_MAINTENANCE_CODE }));
    };
}
