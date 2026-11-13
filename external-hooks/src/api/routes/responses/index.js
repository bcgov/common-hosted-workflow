'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.BadRequestResponse = BadRequestResponse;
exports.UnauthorizedResponse = UnauthorizedResponse;
exports.ForbiddenResponse = ForbiddenResponse;
exports.NotFoundResponse = NotFoundResponse;
exports.UnprocessableEntityResponse = UnprocessableEntityResponse;
exports.InternalServerErrorResponse = InternalServerErrorResponse;
exports.OkResponse = OkResponse;
exports.CreatedResponse = CreatedResponse;
exports.NoContentResponse = NoContentResponse;
const validation_1 = require('../../utils/validation');
function errorJson(res, statusCode, message, details) {
  const body = { error: { message } };
  if (details !== undefined) {
    body.error.details = details;
  }
  res.status(statusCode).json(body);
}
function BadRequestResponse(res, details) {
  errorJson(res, 400, 'Bad Request', details);
}
function UnauthorizedResponse(res, details) {
  errorJson(res, 401, 'Unauthorized', details);
}
function ForbiddenResponse(res, details) {
  errorJson(res, 403, 'Forbidden', details);
}
function NotFoundResponse(res, details) {
  errorJson(res, 404, 'Not Found', details);
}
function UnprocessableEntityResponse(res, details) {
  errorJson(res, 422, 'Unprocessable Entity', details);
}
function InternalServerErrorResponse(res, details) {
  errorJson(res, 500, 'Internal Server Error', details);
}
function OkResponse(res, data, schema) {
  if (schema) {
    res.status(200).json((0, validation_1.parseValidatedResponse)(schema, data));
  } else {
    res.status(200).json(data);
  }
}
function CreatedResponse(res, data, schema) {
  if (schema) {
    res.status(201).json((0, validation_1.parseValidatedResponse)(schema, data));
  } else {
    res.status(201).json(data);
  }
}
function NoContentResponse(res) {
  res.status(204).end();
}
