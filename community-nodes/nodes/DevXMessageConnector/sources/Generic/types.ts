import type { GenericMessageContentData } from './schema';

export interface GenericMessageContent {
  kind: 'template';
  template: 'generic';
  data: GenericMessageContentData;
}
