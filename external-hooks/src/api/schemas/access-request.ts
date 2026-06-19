import { z } from 'zod';
import { trimString } from '../utils/string';

const accessRequestStatusSchema = z.enum(['pending', 'approved', 'denied']);

function parsePositiveInt(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }

  return value;
}

export const createAccessRequestSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z
    .object({
      justification: z.unknown(),
    })
    .transform((body) => ({
      justification: trimString(body.justification),
    }))
    .refine((body) => Boolean(body.justification && body.justification.length >= 10), {
      message: 'Justification is required and must be at least 10 characters.',
    }),
});

export const listAccessRequestsSchema = z.object({
  params: z.record(z.string(), z.unknown()).optional(),
  query: z
    .object({
      status: accessRequestStatusSchema.optional(),
      limit: z.preprocess(parsePositiveInt, z.number().int().min(1).max(100)).optional(),
      offset: z.preprocess(parsePositiveInt, z.number().int().min(0)).optional(),
    })
    .optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

export const reviewAccessRequestSchema = z.object({
  params: z.object({
    id: z.string().uuid({ message: 'Invalid access request ID.' }),
  }),
  query: z.record(z.string(), z.unknown()).optional(),
  body: z
    .object({
      action: z.enum(['approve', 'deny']),
      denyReason: z.string().optional(),
    })
    .transform((body) => ({
      action: body.action,
      denyReason: body.denyReason ? trimString(body.denyReason) : undefined,
    }))
    .refine((body) => body.action !== 'deny' || (body.denyReason && body.denyReason.length >= 10), {
      message: 'Deny reason is required and must be at least 10 characters.',
      path: ['denyReason'],
    }),
});

export const accessRequestResponseSchema = z.object({
  id: z.string().uuid(),
  requesterEmail: z.string().email(),
  justification: z.string(),
  status: z.enum(['pending', 'approved', 'denied']),
  reviewerEmail: z.string().email().nullable(),
  reviewerN8nUserId: z.string().nullable(),
  denyReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const accessRequestListResponseSchema = z.object({
  items: z.array(accessRequestResponseSchema),
  total: z.number().int().nonnegative(),
});

export const createAccessRequestResponseSchema = z.object({
  accessRequest: accessRequestResponseSchema,
});

export const getMyAccessRequestResponseSchema = z.object({
  accessRequest: accessRequestResponseSchema.nullable(),
});

export const reviewAccessRequestResponseSchema = z.object({
  accessRequest: accessRequestResponseSchema,
});
