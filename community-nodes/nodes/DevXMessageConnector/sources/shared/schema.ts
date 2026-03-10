import { z } from 'zod';

export const IsoTimestampSchema = z.union([z.string().datetime({ offset: true }), z.string().datetime()]);
