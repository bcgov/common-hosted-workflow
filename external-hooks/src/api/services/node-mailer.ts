import sanitizeHtml from 'sanitize-html';
import { convert } from 'html-to-text';

export type MailAttachment = Record<string, unknown>;

export type BaseNodeMailerService = {
  sender: string;
  transport: {
    sendMail(mailOptions: {
      from?: string;
      to: string | string[];
      subject: string;
      text?: string;
      html: string;
      attachments: MailAttachment[];
    }): Promise<unknown>;
  };
};

export type SendMailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  attachments?: MailAttachment[];
};

export class NodeMailerService {
  readonly sender: string;

  private readonly transport: BaseNodeMailerService['transport'];

  constructor(baseNodeMailer: BaseNodeMailerService) {
    this.sender = baseNodeMailer.sender;
    this.transport = baseNodeMailer.transport;
  }

  async sendMail({ to, subject, html, text, from, attachments = [] }: SendMailInput): Promise<void> {
    const sanitizedHtml = sanitizeHtml(html);
    const plainText = text ?? convert(sanitizedHtml);

    await this.transport.sendMail({
      from: from ?? this.sender,
      to,
      subject,
      text: plainText,
      html: sanitizedHtml,
      attachments,
    });
  }
}
