import { IExecuteFunctions } from 'n8n-workflow';

import type { CardMessageContent } from './types';
import { adaptiveCardSchema, type AdaptiveCardData } from './schema';
import { safeParsePayload } from '../shared/payload';

export function cardTransform(this: IExecuteFunctions, index: number): CardMessageContent | null {
  const rawPayload = this.getNodeParameter('payload', index);

  const payload = safeParsePayload<AdaptiveCardData>(rawPayload);
  if (!payload) return null;

  return createCardMessageContent(payload);
}

export function createCardMessageContent(card: AdaptiveCardData): CardMessageContent {
  const validatedCard = adaptiveCardSchema.parse(card);

  return {
    kind: 'card',
    card: validatedCard,
  };
}
