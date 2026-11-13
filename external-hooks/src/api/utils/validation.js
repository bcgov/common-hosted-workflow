"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseValidatedResponse = exports.parseValidatedRequest = exports.createRequestParser = exports.createRequestSchemaValidator = void 0;
const zod_1 = require("zod");
const errors_1 = require("./errors");
/** Returns Express middleware that validates `body`, `query`, and `params` against a Zod schema. */
const createRequestSchemaValidator = (schema) => (req, _res, next) => {
    try {
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            const message = error.issues.map((i) => `${i.path.join('.')} is ${i.message}`).join(', ');
            return next(new errors_1.AppError(400, message));
        }
        return next(error);
    }
};
exports.createRequestSchemaValidator = createRequestSchemaValidator;
/** Middleware that validates `body`, `query`, `params` and attaches the typed result to `req.parsed`. */
const createRequestParser = (schema) => (req, _res, next) => {
    try {
        req.parsed = schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            const message = error.issues.map((i) => `${i.path.join('.')} is ${i.message}`).join(', ');
            return next(new errors_1.AppError(400, message));
        }
        return next(error);
    }
};
exports.createRequestParser = createRequestParser;
const parseValidatedRequest = (schema, req) => schema.parse({
    body: req.body,
    query: req.query,
    params: req.params,
});
exports.parseValidatedRequest = parseValidatedRequest;
/** Ensures handler output matches a Zod schema before sending (fails fast on contract drift). */
const parseValidatedResponse = (schema, payload) => {
    try {
        return schema.parse(payload);
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            const message = error.issues.map((i) => `${i.path.join('.')} is ${i.message}`).join(', ');
            throw new errors_1.AppError(500, `Response validation failed: ${message}`);
        }
        throw error;
    }
};
exports.parseValidatedResponse = parseValidatedResponse;
