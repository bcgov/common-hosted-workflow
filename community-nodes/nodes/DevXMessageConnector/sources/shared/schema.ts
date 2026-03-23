import { z } from 'zod';

export const isoTimestampSchema = z.union([z.string().datetime({ offset: true }), z.string().datetime()]);
