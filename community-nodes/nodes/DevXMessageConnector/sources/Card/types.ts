import type { AdaptiveCardData } from './schema';

export interface CardMessageContent {
  kind: 'card';
  card: AdaptiveCardData;
}
