import type { Response } from 'express';

interface ErrorResponseBody {
  error: {
    message: string;
    details?: unknown;
  };
}

function errorJson(res: Response, statusCode: number, message: string, details?: unknown): void {
  const body: ErrorResponseBody = { error: { message } };
  if (details !== undefined) {
    body.error.details = details;
  }
  res.status(statusCode).json(body);
}

export function BadRequestResponse(res: Response, details?: unknown): void {
  errorJson(res, 400, 'Bad Request', details);
}

export function UnauthorizedResponse(res: Response, details?: unknown): void {
  errorJson(res, 401, 'Unauthorized', details);
}

export function ForbiddenResponse(res: Response, details?: unknown): void {
  errorJson(res, 403, 'Forbidden', details);
}

export function NotFoundResponse(res: Response, details?: unknown): void {
  errorJson(res, 404, 'Not Found', details);
}

export function UnprocessableEntityResponse(res: Response, details?: unknown): void {
  errorJson(res, 422, 'Unprocessable Entity', details);
}

export function InternalServerErrorResponse(res: Response, details?: unknown): void {
  errorJson(res, 500, 'Internal Server Error', details);
}

export function OkResponse<T>(res: Response, data: T): void {
  res.status(200).json(data);
}

export function CreatedResponse<T>(res: Response, data: T): void {
  res.status(201).json(data);
}

export function NoContentResponse(res: Response): void {
  res.status(204).end();
}
