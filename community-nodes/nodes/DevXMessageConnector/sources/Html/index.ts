import { IExecuteFunctions } from 'n8n-workflow';
import type { HtmlMessageContent } from './types';
import sanitizeHtml from 'sanitize-html';

export function htmlTransform(this: IExecuteFunctions, index: number): HtmlMessageContent {
  const rawPayload = this.getNodeParameter('payload', index);
  const payload = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
  return createHtmlMessageContent(payload);
}

const config: sanitizeHtml.IOptions = {
  // Teams only supports a small subset of HTML
  allowedTags: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'blockquote',
    'p',
    'ul',
    'ol',
    'li',
    'hr',
    'br',
    'div',
    'span',
    'pre',
    'code',
    'b',
    'i',
    'strong',
    'em',
    'u',
    's',
    'a',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'img',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['style'],
    p: ['style'],
    div: ['style'],
  },
  allowedStyles: {
    '*': {
      color: [/^#(?:[0-9a-fA-F]{3}){1,2}$/, /^(rgb|hsl)a?\([^)]*\)$/, /^[\w-]+$/],
      'background-color': [/^#(?:[0-9a-fA-F]{3}){1,2}$/],
      'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
      'font-weight': [/^\d+$/, /^bold$/, /^normal$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  parseStyleAttributes: true,
};

export function createHtmlMessageContent(html: string): HtmlMessageContent {
  const sanitizedHtml = sanitizeHtml(html, config);
  return {
    kind: 'html',
    text: sanitizedHtml,
  };
}
