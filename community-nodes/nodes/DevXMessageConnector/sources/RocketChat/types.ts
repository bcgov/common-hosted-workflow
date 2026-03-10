// See https://developer.rocket.chat/apidocs/post-message

export interface RocketChatField {
  title: string;
  value: string;
  short: boolean;
}

export interface RocketChatAttachment {
  title: string;
  title_link?: string;
  text: string;
  color?: string;
  image_url?: string;
  thumb_url?: string;
  fields?: RocketChatField[];
}

export interface RocketChatPayload {
  text: string;
  attachments: RocketChatAttachment[];
}
